'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { payExpense } from '@/lib/actions/property-expenses'
import { activeCategories, buildCategoryTree } from '@/lib/categories'
import { formatSignedBRL } from '@/lib/finance/money'
import { FUNDING_LABELS, FUNDING_SOURCES, isConstructorKey, type FundingSource } from '@/lib/finance/property'
import { decodeSource, encodeSource, pickDefaultSource } from '@/lib/transaction-mappers'
import type { ExpenseView } from '@/lib/validation/property'

type Errors = Record<string, string[] | undefined>

type PaymentFormProps = { expense: ExpenseView; systemKey: string | null; today: string; onDone: () => void }

export function PaymentForm({ expense, systemKey, today, onDone }: PaymentFormProps) {
  const data = useTransactionFormData()
  const expenseCategories = activeCategories(data.categories).filter((category) => category.kind === 'expense')
  const imovel = expenseCategories.find((category) => category.isDefault && category.parentId === null && category.name === 'Imóvel')

  const [paidCents, setPaidCents] = useState(expense.paidAmountCents ?? expense.plannedAmountCents)
  const [paidDate, setPaidDate] = useState(expense.paidDate ?? today)
  const [fundingSource, setFundingSource] = useState<FundingSource>(expense.fundingSource)
  const [launch, setLaunch] = useState(expense.status === 'paid' ? expense.transactionId !== null : true)
  const [source, setSource] = useState(
    expense.linked
      ? encodeSource({ accountId: expense.linked.accountId ?? '', creditCardId: expense.linked.creditCardId ?? '' })
      : encodeSource(pickDefaultSource(
          data.accounts.filter((account) => !account.archived),
          data.cards.filter((card) => !card.archived), data.lastAccountId, data.lastCreditCardId)),
  )
  const [categoryId, setCategoryId] = useState(expense.linked?.categoryId ?? imovel?.id ?? expenseCategories[0]?.id ?? '')
  const selected = decodeSource(source)
  // Mantém o item atual na lista mesmo se arquivado (como no formulário de lançamento)
  const accounts = data.accounts.filter((account) => !account.archived || account.id === selected.accountId)
  const cards = data.cards.filter((card) => !card.archived || card.id === selected.creditCardId)
  const currentCategory = expenseCategories.some((category) => category.id === categoryId)
    ? undefined
    : data.categories.find((category) => category.id === categoryId && category.kind === 'expense')
  const tree = buildCategoryTree(currentCategory ? [...expenseCategories, currentCategory] : expenseCategories)
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()
  const err = (field: string) => errors[field]?.[0]
  const own = fundingSource === 'own'
  const correction = isConstructorKey(systemKey) ? paidCents - expense.plannedAmountCents : 0

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const decoded = decodeSource(source)
    const target = decoded.accountId
      ? { kind: 'account' as const, id: decoded.accountId }
      : decoded.creditCardId
        ? { kind: 'card' as const, id: decoded.creditCardId }
        : null
    startTransition(async () => {
      const result = await payExpense({
        expenseId: expense.id,
        paidAmountCents: paidCents,
        paidDate,
        fundingSource,
        launch,
        source: target,
        categoryId: categoryId || null,
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success(result.data.transactionId ? 'Pagamento salvo e lançado nas finanças.' : 'Pagamento salvo.')
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="payment-amount" label="Valor pago" error={err('paidAmountCents')}>
          <MoneyInput id="payment-amount" autoFocus valueCents={paidCents} onChangeCents={setPaidCents} aria-invalid={Boolean(err('paidAmountCents'))} />
        </Field>
        <Field id="payment-date" label="Data do pagamento" error={err('paidDate')}>
          <Input id="payment-date" type="date" max={today} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} aria-invalid={Boolean(err('paidDate'))} />
        </Field>
      </div>
      {correction !== 0 ? (
        <p className="text-sm tabular-nums">
          Correção: <span className="font-medium">{formatSignedBRL(correction)}</span>
        </p>
      ) : null}
      <Field id="payment-source-kind" label="Fonte do recurso" error={err('fundingSource')}>
        <NativeSelect id="payment-source-kind" value={fundingSource} onChange={(e) => {
            const next = e.target.value as FundingSource
            setFundingSource(next)
            if (next === 'own') setLaunch(true)
          }}>
          {FUNDING_SOURCES.map((value) => (
            <option key={value} value={value}>
              {FUNDING_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {own ? (
        <div className="space-y-4 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={launch} onChange={(e) => setLaunch(e.target.checked)} className="size-4 accent-primary" />
            Lançar nas finanças
          </label>
          {launch ? (
            <>
              <Field id="payment-from" label="Pagar com" error={err('source')}>
                <NativeSelect id="payment-from" value={source} onChange={(e) => setSource(e.target.value)} aria-invalid={Boolean(err('source'))}>
                  <option value="">Escolha</option>
                  {accounts.length > 0 ? (
                    <optgroup label="Contas">
                      {accounts.map((account) => (
                        <option key={account.id} value={encodeSource({ accountId: account.id, creditCardId: '' })}>
                          {account.archived ? `${account.name} (arquivada)` : account.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {cards.length > 0 ? (
                    <optgroup label="Cartões">
                      {cards.map((card) => (
                        <option key={card.id} value={encodeSource({ accountId: '', creditCardId: card.id })}>
                          {card.archived ? `${card.name} (arquivado)` : card.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </NativeSelect>
              </Field>
              <Field id="payment-category" label="Categoria" error={err('categoryId')}>
                <NativeSelect id="payment-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={Boolean(err('categoryId'))}>
                  {tree.flatMap((node) => [
                    <option key={node.id} value={node.id}>
                      {expenseCategories.some((c) => c.id === node.id) ? node.name : `${node.name} (arquivada)`}
                    </option>,
                    ...node.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {`— ${child.name}${expenseCategories.some((c) => c.id === child.id) ? '' : ' (arquivada)'}`}
                      </option>
                    )),
                  ])}
                </NativeSelect>
              </Field>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Sem lançamento: o pagamento fica só no Imóvel.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">FGTS e financiamento não geram lançamento: o dinheiro não passa pelas contas.</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar pagamento'}
      </Button>
    </form>
  )
}
