import { BudgetBar, LevelBadge } from '@/components/budgets/budget-bar'
import type { BudgetLine } from '@/lib/finance/budget'
import { formatBRL } from '@/lib/finance/money'
import { EmptyText } from './panel'

export function BudgetPanel({ lines }: { lines: BudgetLine[] }) {
  if (lines.length === 0) return <EmptyText>Defina limites em Orçamento.</EmptyText>
  return (
    <ul className="space-y-3">
      {lines.map((line) =>
        line.progress ? (
          <li key={line.categoryId} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{line.name}</span>
              <LevelBadge line={line} />
              <span className="shrink-0 tabular-nums">{Math.round(line.progress.ratio * 100)}%</span>
            </div>
            <BudgetBar progress={line.progress} label={`Orçamento de ${line.name}`} />
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatBRL(line.spending.realizedCents + line.spending.plannedCents)} de {formatBRL(line.limitCents ?? 0)}
            </p>
          </li>
        ) : null,
      )}
    </ul>
  )
}
