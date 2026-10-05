import type { BudgetProgress } from '@/lib/finance/budget'
import type { UsageLevel } from '@/lib/finance/card'
import { cn } from '@/lib/utils'

const FILL: Record<UsageLevel, string> = { ok: 'bg-primary', warning: 'bg-warning', over: 'bg-expense' }

/** Realizado em cor cheia e previsto em tom claro; o percentual vai em texto ao lado (não só pela cor). */
export function BudgetBar({ progress, label }: { progress: BudgetProgress; label: string }) {
  const realized = Math.min(progress.realizedRatio * 100, 100)
  const planned = Math.min(progress.plannedRatio * 100, 100 - realized)
  const percent = Math.round(progress.ratio * 100)
  return (
    <div
      className="flex h-2 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
      aria-valuetext={`${percent}% do limite`}
    >
      <div className={cn('h-full', FILL[progress.level])} style={{ width: `${realized}%` }} />
      <div className={cn('h-full opacity-40', FILL[progress.level])} style={{ width: `${planned}%` }} />
    </div>
  )
}
