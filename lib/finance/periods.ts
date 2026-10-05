import { monthBounds, shiftYearMonth, type YearMonth } from '@/lib/dates'

export const REPORT_PERIODS = ['mes', 'trimestre', 'semestre', 'ano', '12m'] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  mes: 'Mês',
  trimestre: 'Trimestre',
  semestre: 'Semestre',
  ano: 'Ano',
  '12m': '12 meses',
}

/** Intervalo de meses, inclusivo nas duas pontas. */
export type MonthRange = { start: YearMonth; end: YearMonth }

const LENGTH: Record<Exclude<ReportPeriod, 'ano'>, number> = { mes: 1, trimestre: 3, semestre: 6, '12m': 12 }

/** ?periodo= da URL; ausente ou inválido → "mes". */
export function parsePeriod(value: string | string[] | undefined): ReportPeriod {
  const raw = Array.isArray(value) ? value[0] : value
  return REPORT_PERIODS.find((period) => period === raw) ?? 'mes'
}

/** Período terminando em `ym`; "ano" vai de janeiro até `ym`. */
export function periodRange(period: ReportPeriod, ym: YearMonth): MonthRange {
  if (period === 'ano') return { start: { year: ym.year, month: 1 }, end: ym }
  return { start: shiftYearMonth(ym, -(LENGTH[period] - 1)), end: ym }
}

/** Período anterior de mesmo tamanho; "ano" compara com o mesmo trecho do ano anterior. */
export function previousRange(period: ReportPeriod, ym: YearMonth): MonthRange {
  if (period === 'ano') return { start: { year: ym.year - 1, month: 1 }, end: { year: ym.year - 1, month: ym.month } }
  const { start } = periodRange(period, ym)
  return { start: shiftYearMonth(start, -LENGTH[period]), end: shiftYearMonth(start, -1) }
}

export function monthIndex({ year, month }: YearMonth): number {
  return year * 12 + month - 1
}

export function monthsIn({ start, end }: MonthRange): YearMonth[] {
  const count = Math.max(monthIndex(end) - monthIndex(start) + 1, 0)
  return Array.from({ length: count }, (_, index) => shiftYearMonth(start, index))
}

/** Os `count` meses terminando em `ym`, em ordem crescente. */
export function lastMonths(ym: YearMonth, count: number): YearMonth[] {
  return monthsIn({ start: shiftYearMonth(ym, -(count - 1)), end: ym })
}

/** Datas ISO do intervalo, no formato [start, end). */
export function rangeBounds(range: MonthRange): { start: string; end: string } {
  return { start: monthBounds(range.start).start, end: monthBounds(range.end).end }
}

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "out/2026". */
export function formatMonthShort({ year, month }: YearMonth): string {
  return `${MONTH_ABBR[month - 1]}/${year}`
}

/** "out/26", para eixos de gráfico. */
export function formatMonthAxis({ year, month }: YearMonth): string {
  return `${MONTH_ABBR[month - 1]}/${String(year).slice(2)}`
}

/** "out/2026", "ago–out/2026" ou "nov/2025–out/2026". */
export function periodLabel({ start, end }: MonthRange): string {
  if (monthIndex(start) === monthIndex(end)) return formatMonthShort(end)
  if (start.year === end.year) return `${MONTH_ABBR[start.month - 1]}–${formatMonthShort(end)}`
  return `${formatMonthShort(start)}–${formatMonthShort(end)}`
}
