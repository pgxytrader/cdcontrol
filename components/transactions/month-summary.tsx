import type { MonthSummary as Summary } from '@/lib/finance/summary'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, pending, tone, className }: { label: string; value: string; pending?: string; tone: string; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-3', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone)}>{value}</p>
      {pending ? <p className="text-xs text-muted-foreground tabular-nums">{pending}</p> : null}
    </div>
  )
}

export function MonthSummary({ summary }: { summary: Summary }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <SummaryCard
        label="Receitas"
        value={formatSignedBRL(summary.income.paid)}
        pending={summary.income.pending ? `+ ${formatBRL(summary.income.pending)} previsto` : undefined}
        tone="text-income"
      />
      <SummaryCard
        label="Despesas"
        value={formatSignedBRL(-summary.expense.paid)}
        pending={summary.expense.pending ? `− ${formatBRL(summary.expense.pending)} previsto` : undefined}
        tone="text-expense"
      />
      <SummaryCard
        label="Saldo do mês"
        value={formatSignedBRL(summary.balancePaid)}
        pending={summary.balanceProjected !== summary.balancePaid ? `${formatSignedBRL(summary.balanceProjected)} com previstos` : undefined}
        tone={summary.balancePaid < 0 ? 'text-expense' : 'text-foreground'}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  )
}
