import type { Metadata } from 'next'
import Link from 'next/link'
import { ChartLegend } from '@/components/charts/chart-legend'
import { CHART_COLORS } from '@/components/charts/chart-theme'
import { MonthlyBarsChart } from '@/components/charts/monthly-bars-chart'
import { EmptyText, Panel } from '@/components/dashboard/panel'
import { PageHeader } from '@/components/layout/page-header'
import { CardSpendingChart } from '@/components/reports/card-spending-chart'
import { CardSpendingTable } from '@/components/reports/card-spending-table'
import { CategoryComparisonList } from '@/components/reports/category-comparison'
import { MonthlyTable } from '@/components/reports/monthly-table'
import { PeriodTabs } from '@/components/reports/period-tabs'
import { resolveYearMonth, todayISO } from '@/lib/dates'
import { parsePeriod, periodLabel } from '@/lib/finance/periods'
import { getReports } from '@/lib/reports'

export const metadata: Metadata = { title: 'Relatórios' }

type Props = { searchParams: Promise<{ mes?: string | string[]; periodo?: string | string[] }> }

export default async function ReportsPage({ searchParams }: Props) {
  const { mes, periodo } = await searchParams
  const ym = resolveYearMonth(mes)
  const period = parsePeriod(periodo)
  const data = await getReports(ym, period, todayISO())

  return (
    <>
      <PageHeader title="Relatórios" ym={ym} basePath="/relatorios" extraParams={{ periodo: period }} />
      <div className="space-y-4">
        <Panel title="Despesas por categoria">
          <PeriodTabs ym={ym} period={period} />
          <p className="text-sm text-muted-foreground">
            {periodLabel(data.range)} x {periodLabel(data.previous)}
          </p>
          <CategoryComparisonList comparison={data.comparison} />
        </Panel>

        <Panel title="Evolução mensal">
          <MonthlyBarsChart points={data.series} showBalance label="Receitas, despesas e saldo dos últimos 12 meses" />
          <ChartLegend
            items={[
              { label: 'Receitas', color: CHART_COLORS.income },
              { label: 'Despesas', color: CHART_COLORS.expense },
              { label: 'Tom claro = previsto', color: CHART_COLORS.muted, faded: true },
              { label: 'Saldo (com previstos)', color: CHART_COLORS.primary, line: true },
            ]}
          />
          <MonthlyTable points={data.series} />
        </Panel>

        <Panel title="Gastos por cartão">
          {data.cards.cards.length === 0 ? (
            <EmptyText>Nenhum gasto no cartão nos últimos 12 meses.</EmptyText>
          ) : (
            <>
              <CardSpendingChart data={data.cards} />
              <ChartLegend items={data.cards.cards.map((card) => ({ label: card.name, color: card.color }))} />
              <CardSpendingTable data={data.cards} />
            </>
          )}
        </Panel>

        <p className="text-sm">
          <Link href="/lancamentos" className="text-primary underline-offset-4 hover:underline">
            Exportar lançamentos (CSV)
          </Link>
        </p>
      </div>
    </>
  )
}
