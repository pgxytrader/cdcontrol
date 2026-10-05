'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, formatCompactBRL, formatTooltipValue, tooltipStyle } from '@/components/charts/chart-theme'
import { formatMonthAxis } from '@/lib/finance/periods'
import type { CardMonthly } from '@/lib/finance/reports'

export function CardSpendingChart({ data }: { data: CardMonthly }) {
  const rows = data.months.map((month) => ({ month: formatMonthAxis(month.ym), ...month.byCard }))
  const axisTick = { fill: CHART_COLORS.muted, fontSize: 12 }
  return (
    <div className="h-56 w-full" role="img" aria-label="Gastos por cartão nos últimos 12 meses">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => formatCompactBRL(Number(value))} tick={axisTick} tickLine={false} axisLine={false} width={72} />
          <Tooltip formatter={formatTooltipValue} contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
          {data.cards.map((card) => (
            <Bar key={card.id} dataKey={card.id} name={card.name} stackId="cards" fill={card.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
