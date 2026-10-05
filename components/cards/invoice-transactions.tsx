'use client'

import { useState } from 'react'
import { TransactionItem } from '@/components/transactions/transaction-item'
import { TransactionModal } from '@/components/transactions/transaction-modal'
import type { Category } from '@/lib/categories'
import { formatISODateBR } from '@/lib/dates'
import { installmentInfo, rowToFormValues, seriesInfo, type TransactionRow } from '@/lib/transaction-mappers'
import { PaymentModal } from './payment-form'

type InvoiceTransactionsProps = {
  purchases: TransactionRow[]
  payments: TransactionRow[]
  categories: Category[]
  accounts: { id: string; name: string }[]
  invoiceId: string | null
  remainingCents: number
  defaultAccountId: string | null
}

export function InvoiceTransactions({
  purchases,
  payments,
  categories,
  accounts,
  invoiceId,
  remainingCents,
  defaultAccountId,
}: InvoiceTransactionsProps) {
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [editingPayment, setEditingPayment] = useState<TransactionRow | null>(null)
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Compras</h2>
        {purchases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
            Nenhuma compra nesta fatura.
          </div>
        ) : (
          <ul className="rounded-xl border border-border bg-surface p-2">
            {purchases.map((row) => (
              <li key={row.id}>
                <TransactionItem
                  row={row}
                  category={row.category_id ? categoryById.get(row.category_id) : undefined}
                  sourceLabel={formatISODateBR(row.date)}
                  onClick={() => setEditing(row)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {payments.length > 0 ? (
        <section className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pagamentos</h2>
          <ul className="rounded-xl border border-border bg-surface p-2">
            {payments.map((row) => (
              <li key={row.id}>
                <TransactionItem
                  row={row}
                  sourceLabel={`${formatISODateBR(row.date)} · ${accountName.get(row.account_id ?? '') ?? '?'}`}
                  onClick={() => setEditingPayment(row)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TransactionModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        transactionId={editing?.id}
        initial={editing ? rowToFormValues(editing) : undefined}
        installment={editing ? installmentInfo(editing) : undefined}
        series={editing ? seriesInfo(editing) : undefined}
      />
      {invoiceId ? (
        <PaymentModal
          open={editingPayment !== null}
          onOpenChange={(open) => {
            if (!open) setEditingPayment(null)
          }}
          invoiceId={invoiceId}
          remainingCents={remainingCents}
          defaultAccountId={defaultAccountId}
          payment={
            editingPayment
              ? {
                  id: editingPayment.id,
                  accountId: editingPayment.account_id ?? '',
                  amountCents: editingPayment.amount_cents,
                  date: editingPayment.date,
                  status: editingPayment.status,
                }
              : undefined
          }
        />
      ) : null}
    </>
  )
}
