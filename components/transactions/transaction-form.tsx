'use client'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/categories/category-icon'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { Segmented } from '@/components/form/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTransaction, deleteTransaction, restoreTransaction, updateTransaction } from '@/lib/actions/transactions'
import { activeCategories, buildCategoryTree, chipCategories, type Category } from '@/lib/categories'
import { addDaysISO, todayISO } from '@/lib/dates'
import { defaultStatus } from '@/lib/finance/status'
import type { TransactionStatus } from '@/lib/finance/types'
import { applyActionErrors } from '@/lib/forms'
import { pickDefaultAccountId } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'
import { toTransactionInput, transactionFormResolver, type FormTransactionType, type TransactionFormValues } from '@/lib/validation/transaction'
import { useTransactionFormData } from './form-data-context'

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'transfer', label: 'Transferência' },
] as const

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Pago' },
  { value: 'pending', label: 'Pendente' },
] as const

function CategoryOption({ category, selected, onSelect }: { category: Category; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(category.id)}
      aria-pressed={selected}
      className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', selected ? 'bg-primary/15' : 'hover:bg-surface-2')}
    >
      <CategoryIcon name={category.icon} color={category.color} className="size-7" />
      {category.name}
    </button>
  )
}

type TransactionFormProps = { transactionId?: string; initial?: TransactionFormValues; onDone: () => void }

export function TransactionForm({ transactionId, initial, onDone }: TransactionFormProps) {
  const data = useTransactionFormData()
  const [today] = useState(() => todayISO())
  const activeAccounts = data.accounts.filter((account) => !account.archived)
  const form = useForm<TransactionFormValues>({
    resolver: transactionFormResolver,
    defaultValues: initial ?? {
      type: 'expense',
      amountCents: 0,
      description: '',
      categoryId: '',
      accountId: pickDefaultAccountId(activeAccounts, data.lastAccountId) ?? '',
      creditCardId: '',
      destinationAccountId: '',
      date: today,
      status: 'paid',
      notes: '',
      installmentsCount: 1,
      inProgress: false,
      currentInstallment: 1,
    },
  })
  const [statusTouched, setStatusTouched] = useState(Boolean(initial))
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showNotes, setShowNotes] = useState(Boolean(initial?.notes))
  const { errors, isSubmitting } = form.formState

  const [type, date, status, accountId, destinationAccountId, categoryId] = useWatch({
    control: form.control,
    name: ['type', 'date', 'status', 'accountId', 'destinationAccountId', 'categoryId'],
  })

  const kind = type === 'income' ? 'income' : 'expense'
  const candidates = activeCategories(data.categories).filter((category) => category.kind === kind)
  const chips = chipCategories(candidates, data.topCategoryIds[kind], 6)
  const selectedCategory = data.categories.find((category) => category.id === categoryId)
  const visibleChips =
    selectedCategory && !chips.some((chip) => chip.id === selectedCategory.id) ? [selectedCategory, ...chips] : chips
  const tree = buildCategoryTree(candidates)

  const accountOptions = (selectedId: string) => data.accounts.filter((account) => !account.archived || account.id === selectedId)
  const touchedAccounts = type === 'transfer' ? [accountId, destinationAccountId] : [accountId]
  const beforeInitialBalance = touchedAccounts.some((id) => {
    const account = data.accounts.find((a) => a.id === id)
    return account ? date < account.initialBalanceDate : false
  })

  const revalidate = { shouldValidate: form.formState.isSubmitted }

  function changeType(value: FormTransactionType) {
    form.setValue('type', value)
    form.setValue('categoryId', '', revalidate)
    setShowAllCategories(false)
  }

  function changeDate(value: string) {
    form.setValue('date', value, revalidate)
    if (!statusTouched && value) form.setValue('status', defaultStatus(value, today))
  }

  function changeStatus(value: TransactionStatus) {
    setStatusTouched(true)
    form.setValue('status', value)
  }

  function selectCategory(id: string) {
    form.setValue('categoryId', id, revalidate)
    setShowAllCategories(false)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const input = toTransactionInput(values)
    const result = transactionId ? await updateTransaction(transactionId, input) : await createTransaction(input)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(transactionId ? 'Lançamento atualizado.' : 'Lançamento salvo.')
    onDone()
  })

  async function onDelete() {
    if (!transactionId) return
    const result = await deleteTransaction(transactionId)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const snapshot = result.data
    toast('Lançamento excluído.', {
      action: {
        label: 'Desfazer',
        onClick: async () => {
          const restored = await restoreTransaction(snapshot)
          if (restored.ok) toast.success('Lançamento restaurado.')
          else toast.error(restored.error)
        },
      },
    })
    onDone()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-2" noValidate>
      <Segmented label="Tipo de lançamento" value={type} options={TYPE_OPTIONS} onChange={changeType} />

      <div>
        <label htmlFor="tx-amount" className="text-sm text-muted-foreground">
          Valor
        </label>
        <div className="flex items-baseline gap-2 border-b border-border pb-2">
          <span className="text-2xl text-muted-foreground">R$</span>
          <Controller
            control={form.control}
            name="amountCents"
            render={({ field }) => (
              <MoneyInput
                id="tx-amount"
                size="lg"
                autoFocus={!transactionId}
                valueCents={field.value}
                onChangeCents={field.onChange}
                aria-invalid={Boolean(errors.amountCents)}
                aria-describedby={errors.amountCents ? 'tx-amount-error' : undefined}
              />
            )}
          />
        </div>
        {errors.amountCents ? (
          <p id="tx-amount-error" role="alert" className="mt-1 text-sm text-expense">
            {errors.amountCents.message}
          </p>
        ) : null}
      </div>

      <Field id="tx-description" label="Descrição" error={errors.description?.message}>
        <Input
          id="tx-description"
          autoComplete="off"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? 'tx-description-error' : undefined}
          {...form.register('description')}
        />
      </Field>

      {type !== 'transfer' ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Categoria</legend>
          <div className="flex flex-wrap gap-2">
            {visibleChips.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category.id)}
                aria-pressed={categoryId === category.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  categoryId === category.id
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                {category.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowAllCategories((value) => !value)}
              aria-expanded={showAllCategories}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground"
            >
              {showAllCategories ? 'Menos' : 'Todas'}
            </button>
          </div>
          {showAllCategories ? (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {tree.map((node) => (
                <li key={node.id}>
                  <CategoryOption category={node} selected={categoryId === node.id} onSelect={selectCategory} />
                  {node.children.length > 0 ? (
                    <ul className="ml-6">
                      {node.children.map((child) => (
                        <li key={child.id}>
                          <CategoryOption category={child} selected={categoryId === child.id} onSelect={selectCategory} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {errors.categoryId ? (
            <p role="alert" className="text-sm text-expense">
              {errors.categoryId.message}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className={cn('grid gap-4', type === 'transfer' && 'sm:grid-cols-2')}>
        <Field id="tx-account" label={type === 'transfer' ? 'De' : 'Conta'} error={errors.accountId?.message}>
          <NativeSelect
            id="tx-account"
            aria-invalid={Boolean(errors.accountId)}
            aria-describedby={errors.accountId ? 'tx-account-error' : undefined}
            {...form.register('accountId')}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {accountOptions(accountId).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {type === 'transfer' ? (
          <Field id="tx-destination" label="Para" error={errors.destinationAccountId?.message}>
            <NativeSelect
              id="tx-destination"
              aria-invalid={Boolean(errors.destinationAccountId)}
              aria-describedby={errors.destinationAccountId ? 'tx-destination-error' : undefined}
              {...form.register('destinationAccountId')}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {accountOptions(destinationAccountId).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>

      <Field id="tx-date" label="Data" error={errors.date?.message}>
        <div className="flex gap-2">
          <Input
            id="tx-date"
            type="date"
            value={date}
            onChange={(event) => changeDate(event.target.value)}
            aria-invalid={Boolean(errors.date)}
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={() => changeDate(today)}>
            Hoje
          </Button>
          <Button type="button" variant="outline" onClick={() => changeDate(addDaysISO(today, -1))}>
            Ontem
          </Button>
        </div>
      </Field>
      {beforeInitialBalance ? (
        <p className="-mt-3 text-sm text-warning">Este lançamento não afeta o saldo atual desta conta (data anterior ao saldo inicial).</p>
      ) : null}

      <Segmented label="Status" value={status} options={STATUS_OPTIONS} onChange={changeStatus} />

      {showNotes ? (
        <Field id="tx-notes" label="Observação" error={errors.notes?.message}>
          <textarea
            id="tx-notes"
            rows={3}
            className="w-full rounded-lg border border-input bg-surface-2 px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            {...form.register('notes')}
          />
        </Field>
      ) : (
        <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setShowNotes(true)}>
          + Observação
        </button>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : 'Salvar'}
        </Button>
        {transactionId ? (
          <Button type="button" variant="outline" className="text-expense" onClick={onDelete} disabled={isSubmitting}>
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  )
}
