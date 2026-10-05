import { formatYearMonthParam, shiftYearMonth, yearMonthOfISO } from '@/lib/dates'
import { usageLevel, type UsageLevel } from './card'
import { effectiveStatus } from './status'
import type { TransactionStatus, TransactionType } from './types'

export const BUDGET_MODES = ['only', 'from'] as const
/** "Só este mês" ou "a partir deste mês". */
export type BudgetMode = (typeof BUDGET_MODES)[number]

/** Linha de `budgets`. `month` em AAAA-MM-01; 0 = sem limite. */
export type BudgetRow = { categoryId: string; month: string; amountCents: number; repeats: boolean }

const nextMonth = (month: string) => `${formatYearMonthParam(shiftYearMonth(yearMonthOfISO(month), 1))}-01`

/** Limite do mês: a linha do mês; senão a última anterior que se repete; senão nenhum. Valor 0 = sem limite. */
export function effectiveBudget(rows: BudgetRow[], categoryId: string, month: string): number | null {
  const mine = rows.filter((row) => row.categoryId === categoryId)
  const row =
    mine.find((item) => item.month === month) ??
    mine.filter((item) => item.month < month && item.repeats).sort((a, b) => b.month.localeCompare(a.month))[0]
  return row && row.amountCents > 0 ? row.amountCents : null
}

export type BudgetUpsert = { month: string; amountCents: number; repeats: boolean }
export type BudgetChange = { upserts: BudgetUpsert[]; deleteMonths: string[] }

/** O que gravar e apagar ao definir o limite de um mês (spec 2.2). */
export function budgetChange(rows: BudgetRow[], categoryId: string, month: string, amountCents: number, mode: BudgetMode): BudgetChange {
  const mine = rows.filter((row) => row.categoryId === categoryId)
  if (mode === 'from') {
    return {
      upserts: [{ month, amountCents, repeats: true }],
      deleteMonths: mine
        .filter((row) => row.month > month && row.repeats)
        .map((row) => row.month)
        .sort(),
    }
  }

  const upserts: BudgetUpsert[] = [{ month, amountCents, repeats: false }]
  // O limite que se repetia começava neste mês: o primeiro mês seguinte sem linha própria continua com ele
  const own = mine.find((row) => row.month === month)
  if (own?.repeats) {
    let target = nextMonth(month)
    let found = mine.find((row) => row.month === target)
    while (found && !found.repeats) {
      target = nextMonth(target)
      found = mine.find((row) => row.month === target)
    }
    if (!found) upserts.push({ month: target, amountCents: own.amountCents, repeats: true })
  }
  return { upserts, deleteMonths: [] }
}

export type SpendingTransaction = {
  type: TransactionType
  status: TransactionStatus
  date: string
  accountId: string | null
  amountCents: number
  categoryId: string | null
}

export type Spending = { realizedCents: number; plannedCents: number }

/** Despesas do mês por categoria de primeiro nível (subcategoria soma na mãe), realizado x previsto pelo status efetivo. */
export function categorySpending(
  transactions: SpendingTransaction[],
  categories: { id: string; parentId: string | null }[],
  month: string,
  today: string,
): Map<string, Spending> {
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]))
  const prefix = month.slice(0, 7)
  const result = new Map<string, Spending>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.categoryId === null || !tx.date.startsWith(prefix)) continue
    const root = parentOf.get(tx.categoryId) ?? tx.categoryId
    const entry = result.get(root) ?? { realizedCents: 0, plannedCents: 0 }
    if (effectiveStatus(tx, today) === 'paid') entry.realizedCents += tx.amountCents
    else entry.plannedCents += tx.amountCents
    result.set(root, entry)
  }
  return result
}

export type BudgetProgress = { realizedRatio: number; plannedRatio: number; ratio: number; level: UsageLevel }

/** Alerta sobre realizado + previsto: atenção em 80%, estourado em 100%. */
export function budgetProgress(limitCents: number, realizedCents: number, plannedCents: number): BudgetProgress {
  if (limitCents <= 0) return { realizedRatio: 0, plannedRatio: 0, ratio: 0, level: 'ok' }
  const realizedRatio = realizedCents / limitCents
  const plannedRatio = plannedCents / limitCents
  // Divide a soma (não soma as razões): 0,6 + 0,2 em ponto flutuante pode dar 0,7999… e perder o alerta de 80%
  const ratio = (realizedCents + plannedCents) / limitCents
  return { realizedRatio, plannedRatio, ratio, level: usageLevel(ratio) }
}

export type BudgetLine = {
  categoryId: string
  name: string
  color: string
  icon: string
  limitCents: number | null
  spending: Spending
  progress: BudgetProgress | null
}

const spent = (line: BudgetLine) => line.spending.realizedCents + line.spending.plannedCents

/** Com limite primeiro (da mais perto do limite para a mais longe); sem limite depois, por gasto. */
export function sortBudgetLines(lines: BudgetLine[]): BudgetLine[] {
  return [...lines].sort((a, b) => {
    if (a.progress && b.progress) return b.progress.ratio - a.progress.ratio || a.name.localeCompare(b.name, 'pt-BR')
    if (a.progress) return -1
    if (b.progress) return 1
    return spent(b) - spent(a) || a.name.localeCompare(b.name, 'pt-BR')
  })
}

type BudgetCategory = { id: string; name: string; kind: 'income' | 'expense'; parentId: string | null; archived: boolean; color: string; icon: string }

/** Uma linha por categoria de despesa de primeiro nível ativa, já ordenada. */
export function buildBudgetLines(
  categories: BudgetCategory[],
  rows: BudgetRow[],
  spending: Map<string, Spending>,
  month: string,
): BudgetLine[] {
  const lines = categories
    .filter((category) => category.kind === 'expense' && category.parentId === null && !category.archived)
    .map((category) => {
      const limitCents = effectiveBudget(rows, category.id, month)
      const categorySpent = spending.get(category.id) ?? { realizedCents: 0, plannedCents: 0 }
      return {
        categoryId: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        limitCents,
        spending: categorySpent,
        progress: limitCents === null ? null : budgetProgress(limitCents, categorySpent.realizedCents, categorySpent.plannedCents),
      }
    })
  return sortBudgetLines(lines)
}

/** Resumo do topo: total orçado (só linhas com limite), realizado e previsto (todas as linhas). */
export function budgetTotals(lines: BudgetLine[]): { budgetedCents: number; realizedCents: number; plannedCents: number } {
  return lines.reduce(
    (sum, line) => ({
      budgetedCents: sum.budgetedCents + (line.limitCents ?? 0),
      realizedCents: sum.realizedCents + line.spending.realizedCents,
      plannedCents: sum.plannedCents + line.spending.plannedCents,
    }),
    { budgetedCents: 0, realizedCents: 0, plannedCents: 0 },
  )
}
