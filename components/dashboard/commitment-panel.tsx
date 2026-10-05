import { formatYearMonthLabel } from '@/lib/dates'
import type { Commitment } from '@/lib/finance/commitment'
import { formatBRL } from '@/lib/finance/money'
import { EmptyText } from './panel'

export function CommitmentPanel({ commitment }: { commitment: Commitment }) {
  if (commitment.totalCents === 0) return <EmptyText>Nada comprometido nos próximos 6 meses.</EmptyText>
  return (
    <ul className="space-y-3">
      {commitment.months.map((month) => {
        const width = commitment.maxTotalCents > 0 ? (month.totalCents / commitment.maxTotalCents) * 100 : 0
        return (
          <li key={month.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{formatYearMonthLabel(month.ym)}</span>
              <span className="font-medium tabular-nums">{formatBRL(month.totalCents)}</span>
            </div>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              parcelas {formatBRL(month.installmentsCents)} · assinaturas {formatBRL(month.recurrencesCents)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
