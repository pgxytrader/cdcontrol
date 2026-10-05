'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { NativeSelect } from '@/components/form/native-select'
import { PropertyTransactionModal } from '@/components/transactions/property-transaction-modal'
import { TransactionModal } from '@/components/transactions/transaction-modal'
import { formatYearMonthLabel, yearMonthOfISO } from '@/lib/dates'
import type { InstallmentEntry, InstallmentMonth } from '@/lib/finance/installments-view'
import { formatBRL } from '@/lib/finance/money'
import { installmentInfo, rowToFormValues, type TransactionRow } from '@/lib/transaction-mappers'

type Entry = InstallmentEntry & { row: TransactionRow }

type InstallmentsViewProps = {
  months: InstallmentMonth<Entry>[]
  totalCents: number
  cards: { id: string; name: string; color: string }[]
  cardId: string
}

export function InstallmentsView({ months, totalCents, cards, cardId }: InstallmentsViewProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [viewing, setViewing] = useState<TransactionRow | null>(null)
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const cardName = (id: string) => cardById.get(id)?.name ?? 'Cartão'

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Total comprometido</p>
          <p className="text-3xl font-semibold tabular-nums">{formatBRL(totalCents)}</p>
        </div>
        {cards.length > 0 ? (
          <NativeSelect
            aria-label="Cartão"
            className="sm:w-56"
            value={cardId}
            onChange={(event) => router.replace(event.target.value ? `/parcelas?cartao=${event.target.value}` : '/parcelas')}
          >
            <option value="">Todos os cartões</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>

      {months.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          Nenhuma parcela pela frente.
        </div>
      ) : (
        <div className="space-y-4">
          {months.map((month) => (
            <section key={month.referenceMonth} className="rounded-xl border border-border bg-surface p-2">
              <header className="flex flex-wrap items-baseline justify-between gap-2 px-2 pt-1 pb-2">
                <h2 className="font-medium">{formatYearMonthLabel(yearMonthOfISO(month.referenceMonth))}</h2>
                <p className="font-semibold tabular-nums">{formatBRL(month.totalCents)}</p>
              </header>
              {month.byCard.length > 1 ? (
                <ul className="flex flex-wrap gap-2 px-2 pb-2 text-xs text-muted-foreground">
                  {month.byCard.map((item) => (
                    <li key={item.cardId} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 tabular-nums">
                      <span className="size-2 rounded-full" style={{ backgroundColor: cardById.get(item.cardId)?.color }} aria-hidden />
                      {cardName(item.cardId)} {formatBRL(item.totalCents)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul>
                {month.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => (item.row.source === 'property' ? setViewing(item.row) : setEditing(item.row))}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.description}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {cardName(item.cardId)} · {item.installmentNumber}/{item.installmentsCount}
                        </span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block font-medium">{formatBRL(item.amountCents)}</span>
                        <span className="block text-xs text-muted-foreground">Restam {formatBRL(item.remainingCents)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TransactionModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        transactionId={editing?.id}
        initial={editing ? rowToFormValues(editing) : undefined}
        installment={editing ? installmentInfo(editing) : undefined}
      />
      <PropertyTransactionModal
        row={viewing}
        sourceLabel={viewing?.credit_card_id ? cardName(viewing.credit_card_id) : ''}
        categoryName={undefined}
        onClose={() => setViewing(null)}
      />
    </>
  )
}
