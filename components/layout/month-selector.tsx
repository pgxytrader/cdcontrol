import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatYearMonthLabel, formatYearMonthParam, shiftYearMonth, type YearMonth } from '@/lib/dates'

/** "‹ Outubro 2026 ›": o mês fica na URL (?mes=AAAA-MM). */
export function MonthSelector({ ym, basePath }: { ym: YearMonth; basePath: string }) {
  const previous = shiftYearMonth(ym, -1)
  const next = shiftYearMonth(ym, 1)
  return (
    <nav
      aria-label="Selecionar mês"
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-1 sm:justify-start"
    >
      <Button asChild variant="ghost" size="icon">
        <Link
          href={`${basePath}?mes=${formatYearMonthParam(previous)}`}
          aria-label={`Mês anterior: ${formatYearMonthLabel(previous)}`}
        >
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <span className="min-w-36 text-center font-medium">{formatYearMonthLabel(ym)}</span>
      <Button asChild variant="ghost" size="icon">
        <Link
          href={`${basePath}?mes=${formatYearMonthParam(next)}`}
          aria-label={`Próximo mês: ${formatYearMonthLabel(next)}`}
        >
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </nav>
  )
}
