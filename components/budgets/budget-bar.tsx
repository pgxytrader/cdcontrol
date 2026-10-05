import type { BudgetLine, BudgetProgress } from '@/lib/finance/budget'
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

/** Selo "Atenção" (80%) ou "Estourado" (100%); nada abaixo de 80%. */
export function LevelBadge({ line }: { line: BudgetLine }) {
  if (!line.progress || line.progress.level === 'ok') return null
  const over = line.progress.level === 'over'
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', over ? 'bg-expense/15 text-expense' : 'bg-warning/15 text-warning')}>
      {over ? 'Estourado' : 'Atenção'}
    </span>
  )
}
