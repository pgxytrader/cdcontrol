import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { shiftClosingMonth } from '@/lib/finance/invoice'
import { invoiceHref, invoiceTitle } from '@/lib/invoice-labels'

type InvoiceSelectorProps = { cardId: string; closingMonth: string; referenceMonth: string }

/** "‹ Fatura de Novembro 2026 ›": navega de ciclo em ciclo (?fatura= é o mês de fechamento). */
export function InvoiceSelector({ cardId, closingMonth, referenceMonth }: InvoiceSelectorProps) {
  return (
    <nav
      aria-label="Selecionar fatura"
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-1 sm:justify-start"
    >
      <Button asChild variant="ghost" size="icon">
        <Link href={invoiceHref(cardId, shiftClosingMonth(closingMonth, -1))} aria-label="Fatura anterior">
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <span className="min-w-44 text-center font-medium">{invoiceTitle(referenceMonth)}</span>
      <Button asChild variant="ghost" size="icon">
        <Link href={invoiceHref(cardId, shiftClosingMonth(closingMonth, 1))} aria-label="Próxima fatura">
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </nav>
  )
}
