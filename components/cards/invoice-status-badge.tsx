import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@/lib/finance/invoice'
import { cn } from '@/lib/utils'

const STYLES: Record<InvoiceStatus, string> = {
  open: 'border-primary/40 text-primary',
  closed: 'border-border text-foreground',
  paid: 'border-income/40 text-income',
  overdue: 'border-expense bg-expense/15 font-semibold text-expense',
}

/** Status sempre em texto; a cor só reforça. */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs', STYLES[status])}>{INVOICE_STATUS_LABELS[status]}</span>
}
