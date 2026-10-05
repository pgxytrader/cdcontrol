import { formatYearMonthParam, yearMonthOfISO, type YearMonth } from '@/lib/dates'
import { monthIndex, monthsIn } from './periods'

export const FUNDING_SOURCES = ['own', 'fgts', 'financing'] as const
export type FundingSource = (typeof FUNDING_SOURCES)[number]
export const FUNDING_LABELS: Record<FundingSource, string> = {
  own: 'Recursos próprios',
  fgts: 'FGTS',
  financing: 'Financiamento',
}

export const TYPICAL_PHASES = ['signing', 'construction', 'delivery', 'financing', 'post_keys', 'any'] as const
export type TypicalPhase = (typeof TYPICAL_PHASES)[number]
export const TYPICAL_PHASE_LABELS: Record<TypicalPhase, string> = {
  signing: 'Assinatura',
  construction: 'Obra',
  delivery: 'Entrega',
  financing: 'Financiamento',
  post_keys: 'Pós-chaves',
  any: 'Qualquer',
}

export const PROPERTY_PHASES = ['pre_keys', 'post_keys'] as const
export type PropertyPhase = (typeof PROPERTY_PHASES)[number]
export const PROPERTY_PHASE_LABELS: Record<PropertyPhase, string> = {
  pre_keys: 'Em obra (pré-chaves)',
  post_keys: 'Pós-chaves',
}

export const AMORTIZATION_SYSTEMS = ['sac', 'price'] as const
export type AmortizationSystem = (typeof AMORTIZATION_SYSTEMS)[number]
export const AMORTIZATION_LABELS: Record<AmortizationSystem, string> = { sac: 'SAC', price: 'Price' }

/** Parcelas pagas à construtora: a diferença sobre o previsto é correção (INCC). */
export const CONSTRUCTOR_KEYS: readonly string[] = ['down_payment', 'monthly', 'intermediate', 'keys']

export function isConstructorKey(key: string | null): boolean {
  return key !== null && CONSTRUCTOR_KEYS.includes(key)
}

export type ExpenseStatus = 'planned' | 'paid' | 'overdue'
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = { planned: 'Previsto', paid: 'Pago', overdue: 'Atrasado' }

export type PropertyExpense = {
  id: string
  propertyId: string
  expenseTypeId: string
  description: string
  payee: string | null
  plannedAmountCents: number
  dueDate: string
  status: 'planned' | 'paid'
  paidAmountCents: number | null
  paidDate: string | null
  fundingSource: FundingSource
  transactionId: string | null
  notes: string | null
}

export type ExpenseType = {
  id: string
  name: string
  typicalPhase: TypicalPhase
  sortOrder: number
  isDefault: boolean
  systemKey: string | null
  archived: boolean
}

/** "Atrasado" é calculado: previsto com vencimento antes de hoje. */
export function expenseStatus(expense: Pick<PropertyExpense, 'status' | 'dueDate'>, today: string): ExpenseStatus {
  if (expense.status === 'paid') return 'paid'
  return expense.dueDate < today ? 'overdue' : 'planned'
}

/** Pago − previsto de uma parcela paga da construtora (pode ser negativo); 0 nos demais. */
export function correctionCents(
  expense: Pick<PropertyExpense, 'status' | 'paidAmountCents' | 'plannedAmountCents'>,
  systemKey: string | null,
): number {
  if (expense.status !== 'paid' || expense.paidAmountCents === null || !isConstructorKey(systemKey)) return 0
  return expense.paidAmountCents - expense.plannedAmountCents
}

export type SourceTotals = Record<FundingSource, { paidCents: number; toPayCents: number }>

export type PropertySummary = {
  purchasePriceCents: number
  plannedCents: number
  paidCents: number
  toPayCents: number
  paidRatio: number
  inccCents: number
  constructionInterestCents: number
  bySource: SourceTotals
  next: PropertyExpense | null
}

const byDueDate = (a: PropertyExpense, b: PropertyExpense) =>
  a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description, 'pt-BR')

/** Totais do Resumo. `typeKeys`: id do tipo → system_key. % pago = pago ÷ (pago + a pagar). */
export function propertySummary(
  purchasePriceCents: number,
  expenses: PropertyExpense[],
  typeKeys: Map<string, string | null>,
): PropertySummary {
  const bySource: SourceTotals = {
    own: { paidCents: 0, toPayCents: 0 },
    fgts: { paidCents: 0, toPayCents: 0 },
    financing: { paidCents: 0, toPayCents: 0 },
  }
  let plannedCents = 0
  let paidCents = 0
  let toPayCents = 0
  let inccCents = 0
  let constructionInterestCents = 0

  for (const expense of expenses) {
    const key = typeKeys.get(expense.expenseTypeId) ?? null
    plannedCents += expense.plannedAmountCents
    if (expense.status === 'paid') {
      const value = expense.paidAmountCents ?? 0
      paidCents += value
      bySource[expense.fundingSource].paidCents += value
      inccCents += correctionCents(expense, key)
      if (key === 'incc') inccCents += value
      if (key === 'construction_interest') constructionInterestCents += value
    } else {
      toPayCents += expense.plannedAmountCents
      bySource[expense.fundingSource].toPayCents += expense.plannedAmountCents
    }
  }

  const unpaid = expenses.filter((expense) => expense.status !== 'paid').sort(byDueDate)
  const base = paidCents + toPayCents
  return {
    purchasePriceCents,
    plannedCents,
    paidCents,
    toPayCents,
    paidRatio: base > 0 ? paidCents / base : 0,
    inccCents,
    constructionInterestCents,
    bySource,
    next: unpaid[0] ?? null,
  }
}

export type TypeTotal = { typeId: string; name: string; plannedCents: number; paidCents: number; count: number }

type Totals = { plannedCents: number; paidCents: number; count: number }

/** Previsto, pago e quantidade por tipo, na ordem do cadastro; tipos sem gasto ficam fora. */
export function totalsByType(expenses: PropertyExpense[], types: Pick<ExpenseType, 'id' | 'name' | 'sortOrder'>[]): TypeTotal[] {
  const totals = new Map<string, Totals>()
  for (const expense of expenses) {
    const total = totals.get(expense.expenseTypeId) ?? { plannedCents: 0, paidCents: 0, count: 0 }
    total.plannedCents += expense.plannedAmountCents
    total.paidCents += expense.status === 'paid' ? (expense.paidAmountCents ?? 0) : 0
    total.count += 1
    totals.set(expense.expenseTypeId, total)
  }
  return [...types]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'))
    .flatMap((type) => {
      const total = totals.get(type.id)
      return total ? [{ typeId: type.id, name: type.name, ...total }] : []
    })
}

export type ScheduleMonth = {
  ym: YearMonth
  key: string
  plannedCents: number
  paidCents: number
  isCurrent: boolean
  isDelivery: boolean
}

const fromIndex = (index: number): YearMonth => ({ year: Math.floor(index / 12), month: (index % 12) + 1 })

/**
 * Previsto (pelo vencimento) e realizado (pela data do pagamento) por mês, do primeiro mês com gasto
 * até o último — ou até o mês das chaves, se for depois.
 */
export function propertySchedule(expenses: PropertyExpense[], expectedDeliveryDate: string | null, today: string): ScheduleMonth[] {
  if (expenses.length === 0) return []
  const planned = new Map<string, number>()
  const paid = new Map<string, number>()
  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  const touch = (iso: string) => {
    const index = monthIndex(yearMonthOfISO(iso))
    first = Math.min(first, index)
    last = Math.max(last, index)
  }

  for (const expense of expenses) {
    const dueKey = expense.dueDate.slice(0, 7)
    planned.set(dueKey, (planned.get(dueKey) ?? 0) + expense.plannedAmountCents)
    touch(expense.dueDate)
    if (expense.status === 'paid' && expense.paidDate) {
      const paidKey = expense.paidDate.slice(0, 7)
      paid.set(paidKey, (paid.get(paidKey) ?? 0) + (expense.paidAmountCents ?? 0))
      touch(expense.paidDate)
    }
  }
  if (expectedDeliveryDate) last = Math.max(last, monthIndex(yearMonthOfISO(expectedDeliveryDate)))

  const currentKey = today.slice(0, 7)
  const deliveryKey = expectedDeliveryDate?.slice(0, 7) ?? null
  return monthsIn({ start: fromIndex(first), end: fromIndex(last) }).map((ym) => {
    const key = formatYearMonthParam(ym)
    return {
      ym,
      key,
      plannedCents: planned.get(key) ?? 0,
      paidCents: paid.get(key) ?? 0,
      isCurrent: key === currentKey,
      isDelivery: key === deliveryKey,
    }
  })
}
