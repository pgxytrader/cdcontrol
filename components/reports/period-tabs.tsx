import Link from 'next/link'
import { formatYearMonthParam, type YearMonth } from '@/lib/dates'
import { PERIOD_LABELS, REPORT_PERIODS, type ReportPeriod } from '@/lib/finance/periods'
import { cn } from '@/lib/utils'

export function PeriodTabs({ ym, period }: { ym: YearMonth; period: ReportPeriod }) {
  return (
    <nav aria-label="Período" className="flex flex-wrap gap-1">
      {REPORT_PERIODS.map((item) => {
        const active = item === period
        return (
          <Link
            key={item}
            href={`/relatorios?${new URLSearchParams({ mes: formatYearMonthParam(ym), periodo: item }).toString()}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-surface-2',
            )}
          >
            {PERIOD_LABELS[item]}
          </Link>
        )
      })}
    </nav>
  )
}
