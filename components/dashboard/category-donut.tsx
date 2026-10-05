'use client'

import Link from 'next/link'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatTooltipValue, tooltipStyle } from '@/components/charts/chart-theme'
import { formatBRL } from '@/lib/finance/money'
import type { Slice } from '@/lib/finance/reports'
import { EmptyText } from './panel'

/** Até 6 fatias; a legenda (nome, valor e %) é a alternativa em texto e leva para Lançamentos filtrado. */
export function CategoryDonut({ slices, totalCents, monthParam }: { slices: Slice[]; totalCents: number; monthParam: string }) {
  if (slices.length === 0) return <EmptyText>Nenhuma despesa neste mês.</EmptyText>
  const sum = slices.reduce((acc, slice) => acc + slice.valueCents, 0)

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
      <div className="relative mx-auto size-40 shrink-0" role="img" aria-label="Gráfico de despesas por categoria">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="valueCents" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="var(--surface)" strokeWidth={2}>
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip formatter={formatTooltipValue} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-sm font-semibold tabular-nums">{formatBRL(totalCents)}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {slices.map((slice) => {
          const percent = sum > 0 ? Math.round((slice.valueCents / sum) * 100) : 0
          const content = (
            <>
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="shrink-0 tabular-nums">{formatBRL(slice.valueCents)}</span>
              <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">{percent}%</span>
            </>
          )
          const rowClass = 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm'
          return (
            <li key={slice.key}>
              {slice.categoryId ? (
                <Link href={`/lancamentos?mes=${monthParam}&categoria=${slice.categoryId}`} className={`${rowClass} hover:bg-surface-2`}>
                  {content}
                </Link>
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
