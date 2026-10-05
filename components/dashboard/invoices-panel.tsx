import Link from 'next/link'
import { InvoiceStatusBadge } from '@/components/cards/invoice-status-badge'
import { formatISODateBR } from '@/lib/dates'
import type { DashboardInvoice } from '@/lib/finance/dashboard'
import { formatBRL } from '@/lib/finance/money'
import { invoiceHref } from '@/lib/invoice-labels'
import { EmptyText } from './panel'

const dayMonth = (iso: string) => formatISODateBR(iso).slice(0, 5)

export function InvoicesPanel({ invoices, hasCards }: { invoices: DashboardInvoice[]; hasCards: boolean }) {
  if (!hasCards) return <EmptyText>Nenhum cartão cadastrado.</EmptyText>
  return (
    <ul className="space-y-1">
      {invoices.map((invoice) => {
        const open = invoice.status === 'open'
        return (
          <li key={`${invoice.cardId}-${invoice.cycle.closingMonth}`}>
            <Link href={invoiceHref(invoice.cardId, invoice.cycle.closingMonth)} className="flex items-center gap-3 rounded-md p-2 hover:bg-surface-2">
              <span aria-hidden className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: invoice.cardColor }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{invoice.cardName}</span>
                  {open ? null : <InvoiceStatusBadge status={invoice.status} />}
                </span>
                <span className="block text-xs text-muted-foreground">
                  fecha {dayMonth(invoice.cycle.closingDate)} · vence {dayMonth(invoice.cycle.dueDate)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-muted-foreground">{open ? 'parcial' : 'a pagar'}</span>
                <span className="font-medium tabular-nums">{formatBRL(open ? invoice.totalCents : invoice.remainingCents)}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
