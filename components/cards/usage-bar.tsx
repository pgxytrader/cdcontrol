import { usageLevel, type CardUsage } from '@/lib/finance/card'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'

const BAR: Record<ReturnType<typeof usageLevel>, string> = { ok: 'bg-primary', warning: 'bg-warning', over: 'bg-expense' }

/** Uso do limite com percentual em texto (alerta em 80% e 100% não depende só da cor). */
export function UsageBar({ usage }: { usage: CardUsage }) {
  const level = usageLevel(usage.ratio)
  const percent = Math.round(usage.ratio * 100)
  const width = Math.min(Math.max(percent, 0), 100)
  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Uso do limite"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
      >
        <div className={cn('h-full rounded-full', BAR[level])} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span className={cn(level === 'warning' && 'text-warning', level === 'over' && 'text-expense')}>
          {percent}% usado{level === 'over' ? ' · acima do limite' : level === 'warning' ? ' · perto do limite' : ''}
        </span>
        <span>Disponível {formatBRL(usage.availableCents)}</span>
      </p>
    </div>
  )
}
