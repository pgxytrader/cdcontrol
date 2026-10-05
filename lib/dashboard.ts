import 'server-only'
import { listAccounts } from '@/lib/accounts'
import { getBudgetMonth } from '@/lib/budgets'
import { listCards, listInvoiceTotals } from '@/lib/cards'
import { listCategories } from '@/lib/categories-query'
import { formatYearMonthParam, monthBounds, shiftYearMonth, yearMonthOfISO, type YearMonth } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import type { BudgetLine } from '@/lib/finance/budget'
import { futureCommitment, type Commitment, type CommitmentRow } from '@/lib/finance/commitment'
import { dashboardInvoices, type DashboardInvoice } from '@/lib/finance/dashboard'
import { lastMonths } from '@/lib/finance/periods'
import { categoryTotals, compareCategories, monthlySeries, topSlices, type MonthPoint, type Slice } from '@/lib/finance/reports'
import { loadReportRows } from '@/lib/report-rows'
import { createClient } from '@/lib/supabase/server'

export type Dashboard = {
  month: MonthPoint
  series: MonthPoint[]
  accountsBalanceCents: number
  slices: Slice[]
  expenseTotalCents: number
  invoices: DashboardInvoice[]
  hasCards: boolean
  commitment: Commitment
  budgetLines: BudgetLine[]
}

/** Parcelas e recorrências de cartão nas faturas que vencem nos meses pedidos; faturas já quitadas ficam fora. */
async function loadCommitmentRows(months: YearMonth[]): Promise<CommitmentRow[]> {
  const supabase = await createClient()
  const { data: invoices, error } = await supabase
    .from('v_invoice_totals')
    .select('invoice_id, reference_month, total_cents, paid_cents')
    .gte('reference_month', monthBounds(months[0]).start)
    .lt('reference_month', monthBounds(months[months.length - 1]).end)
  if (error) throw error
  const open = invoices.filter((invoice) => {
    const total = Number(invoice.total_cents ?? 0)
    return !(total > 0 && Number(invoice.paid_cents ?? 0) >= total)
  })
  if (open.length === 0) return []

  const referenceOf = new Map(open.map((invoice) => [invoice.invoice_id as string, invoice.reference_month as string]))
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select('id, invoice_id, amount_cents, installment_plan_id')
      .eq('type', 'expense')
      .in('invoice_id', [...referenceOf.keys()])
      .or('installment_plan_id.not.is.null,recurrence_id.not.is.null')
      .order('id')
      .range(from, to),
  )
  return rows.map((row) => ({
    amountCents: Number(row.amount_cents),
    referenceMonth: referenceOf.get(row.invoice_id as string) as string,
    kind: row.installment_plan_id ? 'installment' : 'recurrence',
  }))
}

/** Dados da tela Início: mês do seletor (cards, rosca, orçamento), 6 meses de barras e o que vale hoje (saldo, faturas, comprometimento). */
export async function getDashboard(ym: YearMonth, today: string): Promise<Dashboard> {
  const months = lastMonths(ym, 6)
  // Comprometimento: do mês de hoje até 5 meses depois, independente do seletor
  const commitmentMonths = lastMonths(shiftYearMonth(yearMonthOfISO(today), 5), 6)
  const [rows, categories, accounts, cards, invoices, budget, commitmentRows] = await Promise.all([
    loadReportRows(monthBounds(months[0]).start, monthBounds(ym).end, today),
    listCategories(),
    listAccounts(),
    listCards(),
    listInvoiceTotals(),
    getBudgetMonth(ym, today),
    loadCommitmentRows(commitmentMonths),
  ])

  const series = monthlySeries(rows, months)
  const key = formatYearMonthParam(ym)
  const monthLines = compareCategories(
    categoryTotals(
      rows.filter((row) => row.date.startsWith(key)),
      categories,
    ),
    new Map(),
    categories,
  ).lines

  return {
    month: series[series.length - 1],
    series,
    accountsBalanceCents: accounts.reduce((sum, account) => sum + account.balanceCents, 0),
    slices: topSlices(monthLines),
    expenseTotalCents: monthLines.reduce((sum, line) => sum + line.totalCents, 0),
    invoices: dashboardInvoices(cards, invoices, today),
    hasCards: cards.length > 0,
    commitment: futureCommitment(commitmentRows, commitmentMonths),
    // Já ordenadas pela proporção do limite; sem limite ficam de fora
    budgetLines: budget.lines.filter((line) => line.progress !== null).slice(0, 5),
  }
}
