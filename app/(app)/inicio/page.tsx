import type { Metadata } from 'next'
import Link from 'next/link'
import { ChartLegend } from '@/components/charts/chart-legend'
import { CHART_COLORS } from '@/components/charts/chart-theme'
import { MonthlyBarsChart } from '@/components/charts/monthly-bars-chart'
import { BudgetPanel } from '@/components/dashboard/budget-panel'
import { CategoryDonut } from '@/components/dashboard/category-donut'
import { CommitmentPanel } from '@/components/dashboard/commitment-panel'
import { InvoicesPanel } from '@/components/dashboard/invoices-panel'
import { Panel } from '@/components/dashboard/panel'
import { PageHeader } from '@/components/layout/page-header'
import { MonthSummary, SummaryCard } from '@/components/transactions/month-summary'
import { getDashboard } from '@/lib/dashboard'
import { formatYearMonthParam, resolveYearMonth, todayISO } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'

export const metadata: Metadata = { title: 'Início' }

const panelLink = (href: string, label: string) => (
  <Link href={href} className="text-sm text-primary underline-offset-4 hover:underline">
    {label}
  </Link>
)

export default async function HomePage({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  const { mes } = await searchParams
  const ym = resolveYearMonth(mes)
  const monthParam = formatYearMonthParam(ym)
  const data = await getDashboard(ym, todayISO())

  return (
    <>
      <PageHeader title="Início" ym={ym} basePath="/inicio" />
      <MonthSummary
        summary={data.month}
        extra={
          <SummaryCard
            label="Saldo das contas"
            value={formatBRL(data.accountsBalanceCents)}
            pending="hoje"
            tone={data.accountsBalanceCents < 0 ? 'text-expense' : 'text-foreground'}
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Despesas por categoria" action={panelLink(`/relatorios?mes=${monthParam}`, 'Relatórios')}>
          <CategoryDonut slices={data.slices} totalCents={data.expenseTotalCents} monthParam={monthParam} />
        </Panel>
        <Panel title="Receitas x despesas" className="lg:col-span-2">
          <MonthlyBarsChart points={data.series} label="Receitas e despesas dos últimos 6 meses" />
          <ChartLegend
            items={[
              { label: 'Receitas', color: CHART_COLORS.income },
              { label: 'Despesas', color: CHART_COLORS.expense },
              { label: 'Tom claro = previsto', color: CHART_COLORS.muted, faded: true },
            ]}
          />
        </Panel>
        <Panel title="Faturas" action={panelLink('/cartoes', 'Cartões')}>
          <InvoicesPanel invoices={data.invoices} hasCards={data.hasCards} />
        </Panel>
        <Panel title="Comprometimento futuro" action={panelLink('/parcelas', 'Parcelas')}>
          <CommitmentPanel commitment={data.commitment} />
        </Panel>
        <Panel title="Orçamento" action={panelLink(`/orcamento?mes=${monthParam}`, 'Ver orçamento')}>
          <BudgetPanel lines={data.budgetLines} />
        </Panel>
      </div>
    </>
  )
}
