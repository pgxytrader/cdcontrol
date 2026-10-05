import { EXPENSE_STATUS_LABELS, type ExpenseStatus } from '@/lib/finance/property'
import { cn } from '@/lib/utils'

const STYLES: Record<ExpenseStatus, string> = {
  planned: 'border-border text-muted-foreground',
  paid: 'border-income/40 text-income',
  overdue: 'border-expense bg-expense/15 font-semibold text-expense',
}

/** Status sempre em texto; a cor só reforça. */
export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return <span className={cn('inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs', STYLES[status])}>{EXPENSE_STATUS_LABELS[status]}</span>
}
