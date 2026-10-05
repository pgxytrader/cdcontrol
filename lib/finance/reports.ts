import type { Category } from '@/lib/categories'
import { formatYearMonthParam, type YearMonth } from '@/lib/dates'
import { effectiveStatus } from './status'
import { summarizeMonth, type MonthSummary } from './summary'
import type { TransactionStatus, TransactionType } from './types'

/** Linha mínima para relatórios, já com o status efetivo (cartão pela data). */
export type ReportRow = {
  type: TransactionType
  status: TransactionStatus
  date: string
  amountCents: number
  categoryId: string | null
  creditCardId: string | null
}

export type RawReportRow = {
  type: string
  status: string
  date: string
  amount_cents: number
  category_id: string | null
  account_id: string | null
  credit_card_id: string | null
}

export function toReportRow(raw: RawReportRow, today: string): ReportRow {
  const type = raw.type as TransactionType
  const status = effectiveStatus({ type, status: raw.status as TransactionStatus, date: raw.date, accountId: raw.account_id }, today)
  return {
    type,
    status,
    date: raw.date,
    amountCents: Number(raw.amount_cents),
    categoryId: raw.category_id,
    creditCardId: raw.credit_card_id,
  }
}

export type MonthPoint = MonthSummary & { ym: YearMonth; key: string }

/** Receitas e despesas de cada mês pedido (mesma regra de summarizeMonth); meses sem lançamento saem zerados. */
export function monthlySeries(rows: ReportRow[], months: YearMonth[]): MonthPoint[] {
  const byMonth = new Map<string, ReportRow[]>()
  for (const row of rows) {
    const key = row.date.slice(0, 7)
    const list = byMonth.get(key)
    if (list) list.push(row)
    else byMonth.set(key, [row])
  }
  return months.map((ym) => {
    const key = formatYearMonthParam(ym)
    return { ym, key, ...summarizeMonth(byMonth.get(key) ?? []) }
  })
}

export const NO_CATEGORY = 'none'
const NO_CATEGORY_INFO = { name: 'Sem categoria', color: '#64748b' }

export type CategoryAmount = { paid: number; pending: number }
export type ReportCategory = Pick<Category, 'id' | 'name' | 'color' | 'parentId'>

/** Despesas por categoria-mãe (subcategoria soma na mãe; sem categoria em NO_CATEGORY). */
export function categoryTotals(rows: ReportRow[], categories: ReportCategory[]): Map<string, CategoryAmount> {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const totals = new Map<string, CategoryAmount>()
  for (const row of rows) {
    if (row.type !== 'expense') continue
    const category = row.categoryId ? byId.get(row.categoryId) : undefined
    const key = category ? (category.parentId ?? category.id) : NO_CATEGORY
    const amount = totals.get(key) ?? { paid: 0, pending: 0 }
    amount[row.status] += row.amountCents
    totals.set(key, amount)
  }
  return totals
}

export type Change = { kind: 'pct'; value: number } | { kind: 'new' } | { kind: 'gone' }

/** Variação em % (inteiro); "novo" sem gasto antes; "gone" quando zerou. */
export function changeBetween(current: number, previous: number): Change {
  if (previous === 0) return current > 0 ? { kind: 'new' } : { kind: 'pct', value: 0 }
  if (current === 0) return { kind: 'gone' }
  // `|| 0` troca −0 por 0
  return { kind: 'pct', value: Math.round(((current - previous) / previous) * 100) || 0 }
}

export type CategoryLine = {
  categoryId: string
  name: string
  color: string
  totalCents: number
  pendingCents: number
  previousCents: number
  change: Change
}

export type CategoryComparison = {
  lines: CategoryLine[]
  total: { totalCents: number; pendingCents: number; previousCents: number; change: Change }
}

const ZERO: CategoryAmount = { paid: 0, pending: 0 }

/** Uma linha por categoria com gasto em algum dos dois períodos; maior total primeiro, empate pelo nome. */
export function compareCategories(
  current: Map<string, CategoryAmount>,
  previous: Map<string, CategoryAmount>,
  categories: ReportCategory[],
): CategoryComparison {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const keys = new Set([...current.keys(), ...previous.keys()])
  const lines = [...keys]
    .map((key) => {
      const now = current.get(key) ?? ZERO
      const before = previous.get(key) ?? ZERO
      const totalCents = now.paid + now.pending
      const previousCents = before.paid + before.pending
      const info = (key === NO_CATEGORY ? undefined : byId.get(key)) ?? NO_CATEGORY_INFO
      return {
        categoryId: key,
        name: info.name,
        color: info.color,
        totalCents,
        pendingCents: now.pending,
        previousCents,
        change: changeBetween(totalCents, previousCents),
      }
    })
    .filter((line) => line.totalCents !== 0 || line.previousCents !== 0)
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'))

  const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0)
  const pendingCents = lines.reduce((sum, line) => sum + line.pendingCents, 0)
  const previousCents = lines.reduce((sum, line) => sum + line.previousCents, 0)
  return { lines, total: { totalCents, pendingCents, previousCents, change: changeBetween(totalCents, previousCents) } }
}

export type Slice = { key: string; categoryId: string | null; name: string; color: string; valueCents: number }

const OTHERS_COLOR = '#475569'

/** As `n` maiores fatias positivas e "Outras" com a soma do resto (omitida se vazia). */
export function topSlices(lines: Pick<CategoryLine, 'categoryId' | 'name' | 'color' | 'totalCents'>[], n = 5): Slice[] {
  const positive = lines
    .filter((line) => line.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'))
  const slices: Slice[] = positive.slice(0, n).map((line) => ({
    key: line.categoryId,
    categoryId: line.categoryId === NO_CATEGORY ? null : line.categoryId,
    name: line.name,
    color: line.color,
    valueCents: line.totalCents,
  }))
  const rest = positive.slice(n).reduce((sum, line) => sum + line.totalCents, 0)
  if (rest > 0) slices.push({ key: 'outras', categoryId: null, name: 'Outras', color: OTHERS_COLOR, valueCents: rest })
  return slices
}

export type ReportCard = { id: string; name: string; color: string }
export type CardMonth = { ym: YearMonth; key: string; byCard: Record<string, number>; totalCents: number }
export type CardMonthly = { cards: ReportCard[]; months: CardMonth[] }

/** Compras menos estornos por cartão e mês (realizado + previsto). Só cartões com movimento nos meses pedidos. */
export function cardMonthly(rows: ReportRow[], cards: ReportCard[], months: YearMonth[]): CardMonthly {
  const keys = new Set(months.map(formatYearMonthParam))
  const sums = new Map<string, Map<string, number>>()
  const used = new Set<string>()
  for (const row of rows) {
    if (!row.creditCardId || (row.type !== 'expense' && row.type !== 'income')) continue
    const key = row.date.slice(0, 7)
    if (!keys.has(key)) continue
    used.add(row.creditCardId)
    const month = sums.get(key) ?? new Map<string, number>()
    const signed = row.type === 'expense' ? row.amountCents : -row.amountCents
    month.set(row.creditCardId, (month.get(row.creditCardId) ?? 0) + signed)
    sums.set(key, month)
  }
  const shown = cards.filter((card) => used.has(card.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return {
    cards: shown,
    months: months.map((ym) => {
      const key = formatYearMonthParam(ym)
      const month = sums.get(key)
      const byCard = Object.fromEntries(shown.map((card) => [card.id, month?.get(card.id) ?? 0]))
      const totalCents = Object.values(byCard).reduce((sum, value) => sum + value, 0)
      return { ym, key, byCard, totalCents }
    }),
  }
}
