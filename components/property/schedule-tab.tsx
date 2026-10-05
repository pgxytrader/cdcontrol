import { KeyRound } from 'lucide-react'
import { EmptyText } from '@/components/dashboard/panel'
import { formatYearMonthLabel } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import type { ScheduleMonth } from '@/lib/finance/property'
import { cn } from '@/lib/utils'

/** Linha do tempo por mês, agrupada por ano: previsto (claro) e realizado (cheio) na mesma escala. */
export function ScheduleTab({ months }: { months: ScheduleMonth[] }) {
  if (months.length === 0) return <EmptyText>Nenhum gasto cadastrado.</EmptyText>
  const max = Math.max(1, ...months.map((month) => Math.max(month.plannedCents, month.paidCents)))
  const years: { year: number; months: ScheduleMonth[] }[] = []
  for (const month of months) {
    const last = years.at(-1)
    if (last && last.year === month.ym.year) last.months.push(month)
    else years.push({ year: month.ym.year, months: [month] })
  }

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1.5 w-3 rounded-full bg-primary/40" /> Previsto
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1.5 w-3 rounded-full bg-income" /> Pago
        </span>
      </p>
      {years.map((group) => (
        <section key={group.year} aria-label={String(group.year)} className="rounded-xl border border-border bg-surface p-2">
          <h2 className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">{group.year}</h2>
          <ol className="space-y-1">
            {group.months.map((month) => (
              <li key={month.key} className={cn('rounded-lg px-2 py-2', month.isCurrent && 'bg-surface-2 ring-1 ring-primary/40')}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="font-medium">
                    {formatYearMonthLabel(month.ym)}
                    {month.isCurrent ? <span className="ml-1 text-xs font-normal text-primary">(este mês)</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    previsto {formatBRL(month.plannedCents)} · pago {formatBRL(month.paidCents)}
                  </span>
                </div>
                <div aria-hidden className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary/40" style={{ width: `${(month.plannedCents / max) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-income" style={{ width: `${(month.paidCents / max) * 100}%` }} />
                </div>
                {month.isDelivery ? (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
                    <KeyRound className="size-3.5" aria-hidden />
                    Entrega das chaves
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
