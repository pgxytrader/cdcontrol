import type { Metadata } from 'next'
import { BudgetList } from '@/components/budgets/budget-list'
import { PageHeader } from '@/components/layout/page-header'
import { getBudgetMonth } from '@/lib/budgets'
import { resolveYearMonth, todayISO } from '@/lib/dates'

export const metadata: Metadata = { title: 'Orçamento' }

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  const { mes } = await searchParams
  const ym = resolveYearMonth(mes)
  const { month, lines, totals } = await getBudgetMonth(ym, todayISO())
  return (
    <>
      <PageHeader title="Orçamento" ym={ym} basePath="/orcamento" />
      <BudgetList lines={lines} totals={totals} month={month} />
    </>
  )
}
