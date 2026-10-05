import { ProgressBar } from '@/components/property/progress-bar'
import { ExpenseStatusBadge } from '@/components/property/status-badge'
import { formatISODateBR } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import type { PropertyCard } from '@/lib/property'

export function PropertyPanel({ card }: { card: PropertyCard }) {
  const { summary } = card
  return (
    <div className="space-y-3 text-sm">
      <p className="truncate font-medium">{card.name}</p>
      <div className="space-y-1">
        <p className="flex items-baseline justify-between">
          <span>Pago</span>
          <span className="tabular-nums">{Math.round(summary.paidRatio * 100)}%</span>
        </p>
        <ProgressBar ratio={summary.paidRatio} label="Percentual pago do imóvel" />
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Total pago</dt>
          <dd className="break-words tabular-nums">{formatBRL(summary.paidCents)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Total previsto</dt>
          <dd className="break-words tabular-nums">{formatBRL(summary.plannedCents)}</dd>
        </div>
      </dl>
      {summary.next && card.nextStatus ? (
        <div className="space-y-1 rounded-lg bg-surface-2 p-2">
          <p className="text-xs text-muted-foreground">Próximo pagamento</p>
          <p className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{summary.next.description}</span>
            <ExpenseStatusBadge status={card.nextStatus} />
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatISODateBR(summary.next.dueDate)} · {formatBRL(summary.next.plannedAmountCents)}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">Nenhum pagamento pendente.</p>
      )}
    </div>
  )
}
