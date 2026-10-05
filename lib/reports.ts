import 'server-only'
import { listCardOptions } from '@/lib/cards'
import { listCategories } from '@/lib/categories-query'
import { monthBounds, type YearMonth } from '@/lib/dates'
import {
  lastMonths,
  monthIndex,
  periodRange,
  previousRange,
  rangeBounds,
  type MonthRange,
  type ReportPeriod,
} from '@/lib/finance/periods'
import {
  cardMonthly,
  categoryTotals,
  compareCategories,
  monthlySeries,
  type CardMonthly,
  type CategoryComparison,
  type MonthPoint,
  type ReportRow,
} from '@/lib/finance/reports'
import { loadReportRows } from '@/lib/report-rows'

export type Reports = {
  period: ReportPeriod
  range: MonthRange
  previous: MonthRange
  comparison: CategoryComparison
  series: MonthPoint[]
  cards: CardMonthly
}

function within(rows: ReportRow[], range: MonthRange): ReportRow[] {
  const { start, end } = rangeBounds(range)
  return rows.filter((row) => row.date >= start && row.date < end)
}

/** Uma busca cobrindo o período anterior e os 12 meses (no máximo 24 meses), agregada em memória. */
export async function getReports(ym: YearMonth, period: ReportPeriod, today: string): Promise<Reports> {
  const range = periodRange(period, ym)
  const previous = previousRange(period, ym)
  const months = lastMonths(ym, 12)
  const from = monthIndex(previous.start) < monthIndex(months[0]) ? previous.start : months[0]
  const [rows, categories, cards] = await Promise.all([
    loadReportRows(monthBounds(from).start, monthBounds(ym).end, today),
    listCategories(),
    listCardOptions(),
  ])
  return {
    period,
    range,
    previous,
    comparison: compareCategories(categoryTotals(within(rows, range), categories), categoryTotals(within(rows, previous), categories), categories),
    series: monthlySeries(rows, months),
    cards: cardMonthly(rows, cards, months),
  }
}
