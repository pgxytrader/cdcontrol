import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatYearMonthLabel, formatYearMonthParam, shiftYearMonth, type YearMonth } from '@/lib/dates'

type MonthSelectorProps = { ym: YearMonth; basePath: string; extraParams?: Record<string, string> }

/** "‹ Outubro 2026 ›": o mês fica na URL (?mes=AAAA-MM); extraParams preserva filtros. */
export function MonthSelector({ ym, basePath, extraParams = {} }: MonthSelectorProps) {
  const previous = shiftYearMonth(ym, -1)
  const next = shiftYearMonth(ym, 1)
  const hrefFor = (target: YearMonth) =>
    `${basePath}?${new URLSearchParams({ mes: formatYearMonthParam(target), ...extraParams }).toString()}`

  return (
    <nav
      aria-label="Selecionar mês"
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-1 sm:justify-start"
    >
      <Button asChild variant="ghost" size="icon">
        <Link href={hrefFor(previous)} aria-label={`Mês anterior: ${formatYearMonthLabel(previous)}`}>
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <span className="min-w-36 text-center font-medium">{formatYearMonthLabel(ym)}</span>
      <Button asChild variant="ghost" size="icon">
        <Link href={hrefFor(next)} aria-label={`Próximo mês: ${formatYearMonthLabel(next)}`}>
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </nav>
  )
}
