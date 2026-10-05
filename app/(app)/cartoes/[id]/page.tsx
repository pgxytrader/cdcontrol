import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CardActions } from '@/components/cards/card-actions'
import { InvoiceSelector } from '@/components/cards/invoice-selector'
import { InvoiceStatusBadge } from '@/components/cards/invoice-status-badge'
import { InvoiceTransactions } from '@/components/cards/invoice-transactions'
import { PayInvoiceButton } from '@/components/cards/payment-form'
import { UsageBar } from '@/components/cards/usage-bar'
import { listAccounts } from '@/lib/accounts'
import { getCard, toSchedule } from '@/lib/cards'
import type { PaletteColor } from '@/lib/categories'
import { listCategories } from '@/lib/categories-query'
import { formatISODateBR, todayISO } from '@/lib/dates'
import { cycleForClosingMonth, invoiceStatus } from '@/lib/finance/invoice'
import { formatBRL } from '@/lib/finance/money'
import { parseInvoiceParam } from '@/lib/invoice-labels'
import { applyEffectiveStatus, type TransactionRow } from '@/lib/transaction-mappers'
import { listInvoiceTransactions } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import { cardSubtitle } from '@/lib/validation/card'
import { uuidSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Cartão' }

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fatura?: string | string[] }>
}

export default async function CardPage({ params, searchParams }: Props) {
  const [{ id }, { fatura }] = await Promise.all([params, searchParams])
  if (!uuidSchema.safeParse(id).success) notFound()

  const detail = await getCard(id)
  if (!detail) notFound()
  const { card, invoices } = detail

  const today = todayISO()
  const closingMonth = parseInvoiceParam(fatura) ?? card.currentCycle.closingMonth
  const invoice = invoices.find((item) => item.cycle.closingMonth === closingMonth)
  // Ciclo sem lançamentos ainda não tem fatura salva: mostra as datas calculadas
  const cycle = invoice?.cycle ?? cycleForClosingMonth(toSchedule(card), closingMonth)
  const totalCents = invoice?.totalCents ?? 0
  const paidCents = invoice?.paidCents ?? 0
  const status = invoiceStatus(cycle, { totalCents, paidCents }, today)
  const remainingCents = Math.max(totalCents - paidCents, 0)

  const [rows, categories, accounts] = await Promise.all([
    invoice ? listInvoiceTransactions(invoice.invoiceId) : Promise.resolve<TransactionRow[]>([]),
    listCategories(),
    listAccounts({ includeArchived: true }),
  ])
  const visible = rows.map((row) => applyEffectiveStatus(row, today))

  return (
    <>
      <div className="mb-2">
        <Link href="/cartoes" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ Cartões
        </Link>
      </div>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{card.name}</h1>
          <p className="text-sm text-muted-foreground">{cardSubtitle(card)}</p>
        </div>
        <InvoiceSelector cardId={card.id} closingMonth={cycle.closingMonth} referenceMonth={cycle.referenceMonth} />
      </header>

      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2" aria-label="Resumo da fatura">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <InvoiceStatusBadge status={status} />
            <p className="text-sm text-muted-foreground">
              Fecha {formatISODateBR(cycle.closingDate)} · vence {formatISODateBR(cycle.dueDate)}
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatBRL(totalCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pago</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatBRL(paidCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Falta pagar</dt>
              <dd className={cn('text-lg font-semibold tabular-nums', status === 'overdue' && 'text-expense')}>
                {formatBRL(remainingCents)}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <PayInvoiceButton
              invoiceId={invoice?.invoiceId ?? null}
              remainingCents={remainingCents}
              defaultAccountId={card.defaultPaymentAccountId}
            />
          </div>
        </section>
        <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-label="Limite do cartão">
          <p className="text-sm text-muted-foreground">
            Limite de {formatBRL(card.limitCents)} · usado {formatBRL(card.usage.usedCents)}
          </p>
          <UsageBar usage={card.usage} />
          <CardActions
            id={card.id}
            archived={card.archived}
            initial={{
              name: card.name,
              brand: card.brand,
              lastFour: card.lastFour ?? '',
              limitCents: card.limitCents,
              closingDay: card.closingDay,
              dueDay: card.dueDay,
              defaultPaymentAccountId: card.defaultPaymentAccountId ?? '',
              color: card.color as PaletteColor,
            }}
          />
        </section>
      </div>

      <InvoiceTransactions
        purchases={visible.filter((row) => row.type !== 'invoice_payment')}
        payments={visible.filter((row) => row.type === 'invoice_payment')}
        categories={categories}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
        invoiceId={invoice?.invoiceId ?? null}
        remainingCents={remainingCents}
        defaultAccountId={card.defaultPaymentAccountId}
      />
    </>
  )
}
