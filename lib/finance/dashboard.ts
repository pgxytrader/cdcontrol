import { invoiceStatus, type InvoiceStatus } from './invoice'
import type { InvoiceCycle } from './types'

export type DashboardCard = { id: string; name: string; color: string; currentCycle: InvoiceCycle }
export type CardInvoiceTotals = { creditCardId: string; cycle: InvoiceCycle; totalCents: number; paidCents: number }
export type DashboardInvoice = {
  cardId: string
  cardName: string
  cardColor: string
  cycle: InvoiceCycle
  totalCents: number
  remainingCents: number
  status: InvoiceStatus
}

/** Por cartão: faturas fechadas ainda não quitadas (mais antiga primeiro) e a fatura do ciclo atual. */
export function dashboardInvoices(cards: DashboardCard[], invoices: CardInvoiceTotals[], today: string): DashboardInvoice[] {
  return cards.flatMap((card) => {
    const entry = (cycle: InvoiceCycle, totalCents: number, paidCents: number, status: InvoiceStatus): DashboardInvoice => ({
      cardId: card.id,
      cardName: card.name,
      cardColor: card.color,
      cycle,
      totalCents,
      remainingCents: totalCents - paidCents,
      status,
    })
    const mine = invoices.filter((invoice) => invoice.creditCardId === card.id)
    const unpaidClosed = mine
      .filter((invoice) => invoice.cycle.closingMonth !== card.currentCycle.closingMonth)
      .map((invoice) => ({ invoice, status: invoiceStatus(invoice.cycle, invoice, today) }))
      .filter(({ status }) => status === 'closed' || status === 'overdue')
      .sort((a, b) => a.invoice.cycle.closingDate.localeCompare(b.invoice.cycle.closingDate))
      .map(({ invoice, status }) => entry(invoice.cycle, invoice.totalCents, invoice.paidCents, status))
    const current = mine.find((invoice) => invoice.cycle.closingMonth === card.currentCycle.closingMonth)
    return [...unpaidClosed, entry(card.currentCycle, current?.totalCents ?? 0, current?.paidCents ?? 0, 'open')]
  })
}
