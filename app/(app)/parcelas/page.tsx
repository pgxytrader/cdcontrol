import type { Metadata } from 'next'
import { InstallmentsView } from '@/components/installments/installments-view'
import { PageHeader } from '@/components/layout/page-header'
import { listCardOptions } from '@/lib/cards'
import { todayISO } from '@/lib/dates'
import { groupInstallmentsByMonth, totalCommitted } from '@/lib/finance/installments-view'
import { listUpcomingInstallments } from '@/lib/installments-query'
import { applyEffectiveStatus } from '@/lib/transaction-mappers'
import { uuidSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Parcelas' }

export default async function InstallmentsPage({ searchParams }: { searchParams: Promise<{ cartao?: string | string[] }> }) {
  const { cartao } = await searchParams
  const raw = Array.isArray(cartao) ? cartao[0] : cartao
  const cardId = raw && uuidSchema.safeParse(raw).success ? raw : undefined

  const [cards, found] = await Promise.all([listCardOptions(), listUpcomingInstallments({ cardId })])
  const today = todayISO()
  const entries = found.map((entry) => ({ ...entry, row: applyEffectiveStatus(entry.row, today) }))

  return (
    <>
      <PageHeader title="Parcelas" />
      <InstallmentsView
        months={groupInstallmentsByMonth(entries)}
        totalCents={totalCommitted(entries)}
        cards={cards.map((card) => ({ id: card.id, name: card.name, color: card.color }))}
        cardId={cardId ?? ''}
      />
    </>
  )
}
