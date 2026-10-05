'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { EmptyText } from '@/components/dashboard/panel'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteExpenses, restoreExpenses, unpayExpense } from '@/lib/actions/property-expenses'
import { formatISODateBR, formatYearMonthLabel, formatYearMonthParam, parseYearMonth, yearMonthOfISO } from '@/lib/dates'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import {
  correctionCents,
  EXPENSE_STATUS_LABELS,
  expenseStatus,
  FUNDING_LABELS,
  FUNDING_SOURCES,
  type ExpenseStatus,
  type ExpenseType,
  type FundingSource,
} from '@/lib/finance/property'
import { hasExpenseFilters, propertyHref, type ExpenseFilters, type PropertyQuery } from '@/lib/property-filters'
import type { ExpenseView } from '@/lib/validation/property'
import { ExpenseForm } from './expense-form'
import { PaymentForm } from './payment-form'
import { ExpenseStatusBadge } from './status-badge'

type ExpensesTabProps = {
  propertyId: string
  expenses: ExpenseView[]
  types: ExpenseType[]
  query: PropertyQuery
  today: string
  openExpense: ExpenseView | null
}

type Mode = 'view' | 'edit' | 'pay'

function groupByDueMonth(expenses: ExpenseView[]) {
  const groups: { key: string; items: ExpenseView[] }[] = []
  for (const expense of expenses) {
    const key = expense.dueDate.slice(0, 7)
    const last = groups.at(-1)
    if (last && last.key === key) last.items.push(expense)
    else groups.push({ key, items: [expense] })
  }
  return groups
}

export function ExpensesTab({ propertyId, expenses, types, query, today, openExpense }: ExpensesTabProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<ExpenseView | null>(openExpense)
  const [mode, setMode] = useState<Mode>('view')
  const [pending, startTransition] = useTransition()
  const typeById = new Map(types.map((type) => [type.id, type]))
  const { filters } = query

  const setFilters = (patch: ExpenseFilters) => router.replace(propertyHref(query, { filters: { ...filters, ...patch } }))
  const close = () => {
    setSelected(null)
    setMode('view')
  }

  function remove(expense: ExpenseView) {
    const extra = expense.transactionId ? ' O lançamento em Lançamentos também será excluído.' : ''
    if (!window.confirm(`Excluir "${expense.description}"?${extra}`)) return
    startTransition(async () => {
      const result = await deleteExpenses([expense.id])
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      close()
      toast('Gasto excluído.', {
        action: {
          label: 'Desfazer',
          onClick: async () => {
            const restored = await restoreExpenses(result.data)
            if (restored.ok) toast.success('Gasto restaurado.')
            else toast.error(restored.error)
          },
        },
      })
    })
  }

  function unpay(expense: ExpenseView) {
    if (expense.transactionId && !window.confirm('Desmarcar o pagamento apaga o lançamento em Lançamentos. Continuar?')) return
    startTransition(async () => {
      const result = await unpayExpense(expense.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('O gasto voltou para previsto.')
      close()
    })
  }

  const selectedStatus = selected ? expenseStatus(selected, today) : null
  const selectedKey = selected ? (typeById.get(selected.expenseTypeId)?.systemKey ?? null) : null

  return (
    <>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <NativeSelect aria-label="Tipo" value={filters.typeId ?? ''} onChange={(e) => setFilters({ typeId: e.target.value || undefined })}>
          <option value="">Todos os tipos</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Status"
          value={filters.status ?? ''}
          onChange={(e) => setFilters({ status: (e.target.value || undefined) as ExpenseStatus | undefined })}
        >
          <option value="">Todos os status</option>
          {(['planned', 'overdue', 'paid'] as const).map((status) => (
            <option key={status} value={status}>
              {EXPENSE_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Fonte"
          value={filters.source ?? ''}
          onChange={(e) => setFilters({ source: (e.target.value || undefined) as FundingSource | undefined })}
        >
          <option value="">Todas as fontes</option>
          {FUNDING_SOURCES.map((source) => (
            <option key={source} value={source}>
              {FUNDING_LABELS[source]}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="month"
          aria-label="Vencimento de"
          value={filters.from ? formatYearMonthParam(filters.from) : ''}
          onChange={(e) => setFilters({ from: parseYearMonth(e.target.value) ?? undefined })}
        />
        <Input
          type="month"
          aria-label="Vencimento até"
          value={filters.to ? formatYearMonthParam(filters.to) : ''}
          onChange={(e) => setFilters({ to: parseYearMonth(e.target.value) ?? undefined })}
        />
        <Button variant="ghost" disabled={!hasExpenseFilters(filters)} onClick={() => router.replace(propertyHref(query, { filters: {} }))}>
          Limpar
        </Button>
      </div>

      {expenses.length === 0 ? (
        <EmptyText>{hasExpenseFilters(filters) ? 'Nenhum gasto com estes filtros.' : 'Nenhum gasto cadastrado. Use “Novo gasto” ou “Gerar plano”.'}</EmptyText>
      ) : (
        <div className="space-y-4">
          {groupByDueMonth(expenses).map((group) => (
            <section key={group.key} className="rounded-xl border border-border bg-surface p-2">
              <h2 className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">{formatYearMonthLabel(yearMonthOfISO(`${group.key}-01`))}</h2>
              <ul>
                {group.items.map((expense) => {
                  const status = expenseStatus(expense, today)
                  const type = typeById.get(expense.expenseTypeId)
                  const correction = correctionCents(expense, type?.systemKey ?? null)
                  const subtitle = [type?.name, expense.payee, `vence ${formatISODateBR(expense.dueDate)}`, FUNDING_LABELS[expense.fundingSource]]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <li key={expense.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(expense)
                          setMode('view')
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{expense.description}</span>
                          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-medium tabular-nums">
                            {formatBRL(expense.status === 'paid' ? (expense.paidAmountCents ?? 0) : expense.plannedAmountCents)}
                          </span>
                          <span className="flex items-center gap-1">
                            {correction !== 0 ? <span className="text-xs text-muted-foreground tabular-nums">INCC {formatSignedBRL(correction)}</span> : null}
                            <ExpenseStatusBadge status={status} />
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ResponsiveModal
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title={mode === 'edit' ? 'Editar gasto' : mode === 'pay' ? (selected?.status === 'paid' ? 'Editar pagamento' : 'Pagar') : (selected?.description ?? 'Gasto')}
      >
        {selected && mode === 'edit' ? (
          <ExpenseForm propertyId={propertyId} types={types} today={today} expense={selected} onDone={close} />
        ) : null}
        {selected && mode === 'pay' ? <PaymentForm expense={selected} systemKey={selectedKey} today={today} onDone={close} /> : null}
        {selected && mode === 'view' && selectedStatus ? (
          <div className="space-y-4 pb-2">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="col-span-2 flex items-center gap-2">
                <dt className="sr-only">Status</dt>
                <dd>
                  <ExpenseStatusBadge status={selectedStatus} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Tipo</dt>
                <dd className="break-words">{typeById.get(selected.expenseTypeId)?.name ?? '—'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Favorecido</dt>
                <dd className="break-words">{selected.payee ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vencimento</dt>
                <dd>{formatISODateBR(selected.dueDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Previsto</dt>
                <dd className="tabular-nums">{formatBRL(selected.plannedAmountCents)}</dd>
              </div>
              {selected.status === 'paid' ? (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">Pago</dt>
                    <dd className="tabular-nums">
                      {formatBRL(selected.paidAmountCents ?? 0)} em {formatISODateBR(selected.paidDate ?? selected.dueDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Correção</dt>
                    <dd className="tabular-nums">{formatSignedBRL(correctionCents(selected, selectedKey))}</dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Fonte</dt>
                <dd>{FUNDING_LABELS[selected.fundingSource]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Nas finanças</dt>
                <dd>{selected.transactionId ? 'Lançado' : 'Não lançado'}</dd>
              </div>
              {selected.notes ? (
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-muted-foreground">Observação</dt>
                  <dd className="break-words">{selected.notes}</dd>
                </div>
              ) : null}
            </dl>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => setMode('pay')} disabled={pending}>
                {selected.status === 'paid' ? 'Editar pagamento' : 'Pagar'}
              </Button>
              <Button variant="outline" onClick={() => setMode('edit')} disabled={pending}>
                Editar
              </Button>
              {selected.status === 'paid' ? (
                <Button variant="outline" onClick={() => unpay(selected)} disabled={pending}>
                  Desmarcar pagamento
                </Button>
              ) : null}
              <Button variant="outline" className="text-expense" onClick={() => remove(selected)} disabled={pending}>
                Excluir
              </Button>
            </div>
          </div>
        ) : null}
      </ResponsiveModal>
    </>
  )
}
