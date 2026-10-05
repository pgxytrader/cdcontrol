'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Category } from '@/lib/categories'
import { invoiceHref } from '@/lib/invoice-labels'
import { groupByDay, groupByMonth, splitPending, type TransactionGroup } from '@/lib/transaction-grouping'
import { installmentInfo, rowToFormValues, seriesInfo, type TransactionRow } from '@/lib/transaction-mappers'
import { TransactionItem } from './transaction-item'
import { TransactionModal } from './transaction-modal'

type TransactionListProps = {
  rows: TransactionRow[]
  categories: Category[]
  accounts: { id: string; name: string }[]
  cards: { id: string; name: string }[]
  mode: 'month' | 'search'
}

type Section = { title: string | null; groups: TransactionGroup<TransactionRow>[] }

function buildSections(rows: TransactionRow[], mode: 'month' | 'search'): Section[] {
  if (mode === 'search') return [{ title: null, groups: groupByMonth(rows) }]
  const { pending, paid } = splitPending(rows)
  if (pending.length === 0) return [{ title: null, groups: groupByDay(paid) }]
  return [
    { title: 'Previsto', groups: groupByDay(pending) },
    { title: 'Realizado', groups: groupByDay(paid) },
  ]
}

export function TransactionList({ rows, categories, accounts, cards, mode }: TransactionListProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const cardName = new Map(cards.map((card) => [card.id, card.name]))

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
        {mode === 'search' ? 'Nenhum lançamento encontrado.' : 'Nenhum lançamento neste mês. Toque no + para lançar o primeiro.'}
      </div>
    )
  }

  const account = (id: string | null) => accountName.get(id ?? '') ?? '?'
  const card = (id: string | null) => cardName.get(id ?? '') ?? '?'
  const labelFor = (row: TransactionRow) => {
    if (row.type === 'transfer') return `${account(row.account_id)} → ${account(row.destination_account_id)}`
    if (row.type === 'invoice_payment') return `${account(row.account_id)} → ${card(row.credit_card_id)}`
    return row.credit_card_id ? card(row.credit_card_id) : account(row.account_id)
  }

  // Pagamento de fatura se edita na tela da fatura
  const open = (row: TransactionRow) => {
    if (row.type === 'invoice_payment' && row.credit_card_id && row.card_invoices) {
      router.push(invoiceHref(row.credit_card_id, row.card_invoices.closing_month))
      return
    }
    setEditing(row)
  }

  return (
    <>
      <div className="space-y-6">
        {buildSections(rows, mode).map((section) => (
          <section key={section.title ?? 'all'} className="space-y-4">
            {section.title ? <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h2> : null}
            {section.groups.map((group) => (
              <div key={`${section.title}-${group.key}`} className="rounded-xl border border-border bg-surface p-2">
                <h3 className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">{group.label}</h3>
                <ul>
                  {group.items.map((row) => (
                    <li key={row.id}>
                      <TransactionItem
                        row={row}
                        category={row.category_id ? categoryById.get(row.category_id) : undefined}
                        sourceLabel={labelFor(row)}
                        onClick={() => open(row)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
      <TransactionModal
        open={editing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditing(null)
        }}
        transactionId={editing?.id}
        initial={editing ? rowToFormValues(editing) : undefined}
        installment={editing ? installmentInfo(editing) : undefined}
        series={editing ? seriesInfo(editing) : undefined}
      />
    </>
  )
}
