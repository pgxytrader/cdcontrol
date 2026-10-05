import { EmptyText } from '@/components/dashboard/panel'
import { formatBRL } from '@/lib/finance/money'
import type { TypeTotal } from '@/lib/finance/property'
import { ProgressBar } from './progress-bar'

export function TypesTab({ totals }: { totals: TypeTotal[] }) {
  if (totals.length === 0) return <EmptyText>Nenhum gasto cadastrado.</EmptyText>
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {totals.map((total) => {
        const ratio = total.plannedCents > 0 ? total.paidCents / total.plannedCents : total.paidCents > 0 ? 1 : 0
        return (
          <li key={total.typeId} className="space-y-2 rounded-xl border border-border bg-surface p-3">
            <p className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{total.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {total.count} {total.count === 1 ? 'gasto' : 'gastos'}
              </span>
            </p>
            <ProgressBar ratio={ratio} label={`Pago de ${total.name}`} />
            <p className="text-xs text-muted-foreground tabular-nums">
              pago {formatBRL(total.paidCents)} de {formatBRL(total.plannedCents)} previstos
            </p>
          </li>
        )
      })}
    </ul>
  )
}
