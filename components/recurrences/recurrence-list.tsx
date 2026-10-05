'use client'

import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { CategoryIcon } from '@/components/categories/category-icon'
import { QuickAddButton } from '@/components/layout/quick-add'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { formatISODateBR } from '@/lib/dates'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import { describeSchedule, type RecurrenceItem } from '@/lib/finance/recurrence'
import { cn } from '@/lib/utils'
import { RecurrenceForm } from './recurrence-form'

function useLabels() {
  const data = useTransactionFormData()
  const accounts = new Map(data.accounts.map((account) => [account.id, account.name]))
  const cards = new Map(data.cards.map((card) => [card.id, card.name]))
  const categories = new Map(data.categories.map((category) => [category.id, category]))
  return {
    source(item: RecurrenceItem) {
      if (item.type === 'transfer') return `${accounts.get(item.accountId ?? '') ?? '?'} → ${accounts.get(item.destinationAccountId ?? '') ?? '?'}`
      return item.creditCardId ? (cards.get(item.creditCardId) ?? '?') : (accounts.get(item.accountId ?? '') ?? '?')
    },
    category: (item: RecurrenceItem) => (item.categoryId ? categories.get(item.categoryId) : undefined),
  }
}

function Amount({ item }: { item: RecurrenceItem }) {
  if (item.type === 'transfer') return <span className="shrink-0 font-medium tabular-nums">{formatBRL(item.amountCents)}</span>
  const income = item.type === 'income'
  return (
    <span className={cn('shrink-0 font-medium tabular-nums', income ? 'text-income' : 'text-expense')}>
      {formatSignedBRL(income ? item.amountCents : -item.amountCents)}
    </span>
  )
}

function Row({ item, detail }: { item: RecurrenceItem; detail: string }) {
  const labels = useLabels()
  const category = labels.category(item)
  return (
    <span className="flex w-full items-center gap-3">
      {item.type === 'transfer' ? (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
          <ArrowLeftRight className="size-4" />
        </span>
      ) : (
        <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.description}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {describeSchedule(item)} · {labels.source(item)}
        </span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Amount item={item} />
    </span>
  )
}

export function RecurrenceList({ active, ended }: { active: RecurrenceItem[]; ended: RecurrenceItem[] }) {
  const [editing, setEditing] = useState<RecurrenceItem | null>(null)

  return (
    <>
      {active.length === 0 ? (
        <div className="space-y-4 rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          <p>Nenhuma recorrência ativa. Ao lançar, escolha “Repetir” para o app gerar os próximos lançamentos sozinho.</p>
          <div className="mx-auto max-w-xs">
            <QuickAddButton />
          </div>
        </div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {active.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="w-full rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-2"
              >
                <Row item={item} detail={item.nextDate ? `Próxima: ${formatISODateBR(item.nextDate)}` : 'Nenhuma prevista'} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {ended.length > 0 ? (
        <details className="mt-6 rounded-xl border border-border bg-surface p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Encerradas ({ended.length})</summary>
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {ended.map((item) => (
              <li key={item.id} className="opacity-80">
                <Row item={item} detail={`Encerrada em ${formatISODateBR(item.endDate ?? item.startDate)}`} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ResponsiveModal
        open={editing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditing(null)
        }}
        title="Editar recorrência"
      >
        {editing ? <RecurrenceForm key={editing.id} item={editing} onDone={() => setEditing(null)} /> : null}
      </ResponsiveModal>
    </>
  )
}
