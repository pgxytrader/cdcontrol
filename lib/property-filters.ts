// lib/property-filters.ts
import { formatYearMonthParam, parseYearMonth, type YearMonth } from '@/lib/dates'
import { monthIndex } from '@/lib/finance/periods'
import { expenseStatus, type ExpenseStatus, type FundingSource, type PropertyExpense } from '@/lib/finance/property'
import { uuidSchema } from '@/lib/validation/common'

export const PROPERTY_TABS = ['resumo', 'cronograma', 'tipos', 'gastos'] as const
export type PropertyTab = (typeof PROPERTY_TABS)[number]

export const PROPERTY_TAB_LABELS: Record<PropertyTab, string> = {
  resumo: 'Resumo',
  cronograma: 'Cronograma',
  tipos: 'Por tipo',
  gastos: 'Gastos',
}

export type ExpenseFilters = { typeId?: string; status?: ExpenseStatus; source?: FundingSource; from?: YearMonth; to?: YearMonth }
export type PropertyQuery = { propertyId?: string; tab: PropertyTab; filters: ExpenseFilters; expenseId?: string }

type Params = Record<string, string | string[] | undefined>

const STATUS_FROM_PARAM: Record<string, ExpenseStatus> = { previsto: 'planned', pago: 'paid', atrasado: 'overdue' }
const STATUS_TO_PARAM: Record<ExpenseStatus, string> = { planned: 'previsto', paid: 'pago', overdue: 'atrasado' }
const SOURCE_FROM_PARAM: Record<string, FundingSource> = { proprios: 'own', fgts: 'fgts', financiamento: 'financing' }
const SOURCE_TO_PARAM: Record<FundingSource, string> = { own: 'proprios', fgts: 'fgts', financing: 'financiamento' }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const lookup = <T,>(map: Record<string, T>, key: string | undefined): T | undefined =>
  key !== undefined && Object.hasOwn(map, key) ? map[key] : undefined
const validUuid = (value: string | undefined) => (value && uuidSchema.safeParse(value).success ? value : undefined)

/** Lê ?imovel, ?aba, ?tipo, ?status, ?fonte, ?de, ?ate e ?gasto; valores inválidos são ignorados. */
export function parsePropertyQuery(params: Params): PropertyQuery {
  const query: PropertyQuery = { tab: 'resumo', filters: {} }
  const propertyId = validUuid(first(params.imovel))
  const tab = PROPERTY_TABS.find((value) => value === first(params.aba))
  const typeId = validUuid(first(params.tipo))
  const status = lookup(STATUS_FROM_PARAM, first(params.status))
  const source = lookup(SOURCE_FROM_PARAM, first(params.fonte))
  const from = parseYearMonth(first(params.de))
  const to = parseYearMonth(first(params.ate))
  const expenseId = validUuid(first(params.gasto))
  if (propertyId) query.propertyId = propertyId
  if (tab) query.tab = tab
  if (typeId) query.filters.typeId = typeId
  if (status) query.filters.status = status
  if (source) query.filters.source = source
  if (from) query.filters.from = from
  if (to) query.filters.to = to
  if (expenseId) query.expenseId = expenseId
  return query
}

/** URL de /imovel com imóvel, aba e filtros (o gasto aberto não entra). */
export function propertyHref(query: PropertyQuery, patch: Partial<PropertyQuery> = {}): string {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.propertyId) params.set('imovel', next.propertyId)
  params.set('aba', next.tab)
  const { filters } = next
  if (filters.typeId) params.set('tipo', filters.typeId)
  if (filters.status) params.set('status', STATUS_TO_PARAM[filters.status])
  if (filters.source) params.set('fonte', SOURCE_TO_PARAM[filters.source])
  if (filters.from) params.set('de', formatYearMonthParam(filters.from))
  if (filters.to) params.set('ate', formatYearMonthParam(filters.to))
  return `/imovel?${params.toString()}`
}

export function hasExpenseFilters(filters: ExpenseFilters): boolean {
  return Object.values(filters).some(Boolean)
}

/** Filtra pelo tipo, status (com "atrasado" calculado), fonte e mês de vencimento (de/até, inclusivos). */
export function filterExpenses<T extends PropertyExpense>(expenses: T[], filters: ExpenseFilters, today: string): T[] {
  const from = filters.from ? monthIndex(filters.from) : null
  const to = filters.to ? monthIndex(filters.to) : null
  return expenses.filter((expense) => {
    if (filters.typeId && expense.expenseTypeId !== filters.typeId) return false
    if (filters.status && expenseStatus(expense, today) !== filters.status) return false
    if (filters.source && expense.fundingSource !== filters.source) return false
    const due = monthIndex(parseYearMonth(expense.dueDate.slice(0, 7)) as YearMonth)
    if (from !== null && due < from) return false
    if (to !== null && due > to) return false
    return true
  })
}
