'use client'

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMonthAxis } from '@/lib/finance/periods'
import type { MonthPoint } from '@/lib/finance/reports'
import { CHART_COLORS, formatCompactBRL, formatTooltipValue, PENDING_OPACITY, tooltipStyle } from './chart-theme'

/** Receitas e despesas por mês: realizado em cor cheia e previsto empilhado em tom claro; saldo opcional em linha. */
export function MonthlyBarsChart({ points, showBalance = false, label }: { points: MonthPoint[]; showBalance?: boolean; label: string }) {
  const data = points.map((point) => ({
    month: formatMonthAxis(point.ym),
    incomePaid: point.income.paid,
    incomePending: point.income.pending,
    expensePaid: point.expense.paid,
    expensePending: point.expense.pending,
    balance: point.balanceProjected,
  }))
  const axisTick = { fill: CHART_COLORS.muted, fontSize: 12 }

  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => formatCompactBRL(Number(value))} tick={axisTick} tickLine={false} axisLine={false} width={72} />
          <Tooltip formatter={formatTooltipValue} contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="incomePaid" name="Receitas" stackId="income" fill={CHART_COLORS.income} />
          <Bar dataKey="incomePending" name="Receitas previstas" stackId="income" fill={CHART_COLORS.income} fillOpacity={PENDING_OPACITY} />
          <Bar dataKey="expensePaid" name="Despesas" stackId="expense" fill={CHART_COLORS.expense} />
          <Bar dataKey="expensePending" name="Despesas previstas" stackId="expense" fill={CHART_COLORS.expense} fillOpacity={PENDING_OPACITY} />
          {showBalance ? (
            <Line dataKey="balance" name="Saldo (com previstos)" type="monotone" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
