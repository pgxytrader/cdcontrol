import 'server-only'
import { listCategories } from '@/lib/categories-query'
import { monthBounds, type YearMonth } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import { budgetTotals, buildBudgetLines, categorySpending, type BudgetLine, type BudgetRow } from '@/lib/finance/budget'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

export type BudgetMonth = { month: string; lines: BudgetLine[]; totals: ReturnType<typeof budgetTotals> }

/** Linhas do orçamento do mês: limites até o mês, categorias e despesas do mês. */
export async function getBudgetMonth(ym: YearMonth, today: string): Promise<BudgetMonth> {
  const supabase = await createClient()
  const { start, end } = monthBounds(ym)
  const [categories, budgets, expenses] = await Promise.all([
    listCategories(),
    fetchAllPages((from, to) =>
      supabase.from('budgets').select('id, category_id, month, amount_cents, repeats').lte('month', start).order('id').range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('transactions')
        .select('id, type, status, date, account_id, amount_cents, category_id')
        .eq('type', 'expense')
        .gte('date', start)
        .lt('date', end)
        .order('id')
        .range(from, to),
    ),
  ])

  const rows: BudgetRow[] = budgets.map((row) => ({
    categoryId: row.category_id as string,
    month: row.month as string,
    amountCents: Number(row.amount_cents),
    repeats: row.repeats as boolean,
  }))
  const spending = categorySpending(
    expenses.map((row) => ({
      type: row.type as TransactionType,
      status: row.status as TransactionStatus,
      date: row.date as string,
      accountId: row.account_id as string | null,
      amountCents: Number(row.amount_cents),
      categoryId: row.category_id as string | null,
    })),
    categories,
    start,
    today,
  )
  const lines = buildBudgetLines(categories, rows, spending, start)
  return { month: start, lines, totals: budgetTotals(lines) }
}
