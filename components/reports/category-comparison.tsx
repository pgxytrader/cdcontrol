import { EmptyText } from '@/components/dashboard/panel'
import type { CategoryComparison, Change } from '@/lib/finance/reports'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'

/** Gasto maior é ruim: ▲ em vermelho, ▼ em verde; seta e sinal sempre em texto. */
function ChangeText({ change }: { change: Change }) {
  if (change.kind === 'new') return <span className="text-muted-foreground">novo</span>
  if (change.kind === 'gone') return <span className="text-muted-foreground">—</span>
  if (change.value === 0) return <span className="text-muted-foreground">0%</span>
  const up = change.value > 0
  return (
    <span className={cn('tabular-nums', up ? 'text-expense' : 'text-income')}>
      {up ? '▲ +' : '▼ −'}
      {Math.abs(change.value)}%
    </span>
  )
}

export function CategoryComparisonList({ comparison }: { comparison: CategoryComparison }) {
  if (comparison.lines.length === 0) return <EmptyText>Nenhuma despesa no período.</EmptyText>
  return (
    <ul className="divide-y divide-border">
      {comparison.lines.map((line) => (
        <li key={line.categoryId} className="space-y-0.5 py-2">
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
            <span className="min-w-0 flex-1 truncate">{line.name}</span>
            <span className="shrink-0 font-medium tabular-nums">{formatBRL(line.totalCents)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 pl-4.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              antes {formatBRL(line.previousCents)}
              {line.pendingCents > 0 ? ` · inclui ${formatBRL(line.pendingCents)} previsto` : ''}
            </span>
            <ChangeText change={line.change} />
          </div>
        </li>
      ))}
      <li className="flex items-center gap-2 py-2 font-semibold">
        <span className="flex-1">Total</span>
        <span className="text-xs font-normal">
          <ChangeText change={comparison.total.change} />
        </span>
        <span className="tabular-nums">{formatBRL(comparison.total.totalCents)}</span>
      </li>
    </ul>
  )
}
