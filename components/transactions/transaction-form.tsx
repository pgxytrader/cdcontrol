'use client'

import { Repeat } from 'lucide-react'
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
import type { ActionResult } from '@/lib/action-result'
import { createCardTransaction, deleteInstallments, updateCardTransaction, updateInstallments } from '@/lib/actions/card-transactions'
import { deleteSeriesFollowing, restoreSeries, updateSeriesFollowing } from '@/lib/actions/recurrences'
import { createTransaction, deleteTransaction, restoreTransactions, updateTransaction } from '@/lib/actions/transactions'
import { activeCategories, buildCategoryTree, chipCategories, type Category } from '@/lib/categories'
import { addDaysISO, formatISODateBR, formatYearMonthLabel, todayISO, yearMonthOfISO } from '@/lib/dates'
import { describeSchedule, FREQUENCY_LABELS, type RecurrenceFrequency } from '@/lib/finance/recurrence'
import { MAX_INSTALLMENTS, splitInstallments } from '@/lib/finance/installments'
import { cycleForDate } from '@/lib/finance/invoice'
import { formatBRL } from '@/lib/finance/money'
import { defaultStatus } from '@/lib/finance/status'
import type { TransactionStatus } from '@/lib/finance/types'
import { applyActionErrors } from '@/lib/forms'
import { decodeSource, encodeSource, pickDefaultAccountId, pickDefaultSource, type InstallmentInfo, type SeriesInfo } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'
import {
  canRepeat,
  isCardForm,
  toCardTransactionInput,
  toTransactionInput,
  transactionFormResolver,
  type FormTransactionType,
  type InstallmentScope,
  type TransactionFormValues,
} from '@/lib/validation/transaction'
import type { DeletionSnapshot, RecurrenceSnapshot } from '@/lib/validation/transaction-record'
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

const REPEAT_OPTIONS = [
  { value: '', label: 'Não' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
] as const

type Scope = 'one' | 'rest'

const NUMBERS = Array.from({ length: MAX_INSTALLMENTS }, (_, index) => index + 1)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

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

type TransactionFormProps = {
  transactionId?: string
  initial?: TransactionFormValues
  /** Parcela de uma compra: valor, cartão, data e parcelas ficam travados. */
  installment?: InstallmentInfo
  /** Lançamento de uma série: salvar e excluir perguntam "só este" ou "este e os próximos". */
  series?: SeriesInfo
  onDone: () => void
}

export function TransactionForm({ transactionId, initial, installment, series, onDone }: TransactionFormProps) {
  const data = useTransactionFormData()
  const [today] = useState(() => todayISO())
  const activeAccounts = data.accounts.filter((account) => !account.archived)
  const activeCards = data.cards.filter((card) => !card.archived)
  const form = useForm<TransactionFormValues>({
    resolver: transactionFormResolver,
    defaultValues: initial ?? {
      type: 'expense',
      amountCents: 0,
      description: '',
      categoryId: '',
      ...pickDefaultSource(activeAccounts, activeCards, data.lastAccountId, data.lastCreditCardId),
      destinationAccountId: '',
      date: today,
      status: 'paid',
      notes: '',
      installmentsCount: 1,
      inProgress: false,
      currentInstallment: 1,
      repeatFrequency: '',
      repeatEndDate: '',
    },
  })
  const [statusTouched, setStatusTouched] = useState(Boolean(initial))
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showNotes, setShowNotes] = useState(Boolean(initial?.notes))
  const [scopeAction, setScopeAction] = useState<'save' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const { errors, isSubmitting } = form.formState
  const locked = Boolean(installment)
  // Parcela ou lançamento de série: salvar e excluir perguntam o alcance
  const scoped = locked || Boolean(series)

  const [type, date, status, accountId, creditCardId, destinationAccountId, categoryId, amountCents, installmentsCount, inProgress, repeatFrequency, repeatEndDate] =
    useWatch({
      control: form.control,
      name: [
        'type',
        'date',
        'status',
        'accountId',
        'creditCardId',
        'destinationAccountId',
        'categoryId',
        'amountCents',
        'installmentsCount',
        'inProgress',
        'repeatFrequency',
        'repeatEndDate',
      ],
    })

  const kind = type === 'income' ? 'income' : 'expense'
  const candidates = activeCategories(data.categories).filter((category) => category.kind === kind)
  const chips = chipCategories(candidates, data.topCategoryIds[kind], 6)
  const selectedCategory = data.categories.find((category) => category.id === categoryId)
  const visibleChips =
    selectedCategory && !chips.some((chip) => chip.id === selectedCategory.id) ? [selectedCategory, ...chips] : chips
  const tree = buildCategoryTree(candidates)

  const isCard = isCardForm({ type, creditCardId })
  const card = data.cards.find((item) => item.id === creditCardId)
  const accountOptions = (selectedId: string) => data.accounts.filter((account) => !account.archived || account.id === selectedId)
  const cardOptions = data.cards.filter((item) => !item.archived || item.id === creditCardId)
  const touchedAccounts = type === 'transfer' ? [accountId, destinationAccountId] : [accountId]
  const beforeInitialBalance =
    !isCard &&
    touchedAccounts.some((id) => {
      const account = data.accounts.find((a) => a.id === id)
      return account ? date < account.initialBalanceDate : false
    })
  const cycle = isCard && card && !locked && ISO_DATE.test(date) ? cycleForDate(card, date) : null
  const canSplit = isCard && type === 'expense' && !transactionId && !repeatFrequency
  const showRepeat = !transactionId && canRepeat({ type, creditCardId, installmentsCount, inProgress })
  const firstInstallment =
    canSplit && !inProgress && installmentsCount > 1 && amountCents >= installmentsCount
      ? splitInstallments(amountCents, installmentsCount)[0]
      : null

  const revalidate = { shouldValidate: form.formState.isSubmitted }

  function changeType(value: FormTransactionType) {
    form.setValue('type', value)
    form.setValue('categoryId', '', revalidate)
    if (value === 'transfer' && form.getValues('creditCardId')) {
      form.setValue('creditCardId', '')
      form.setValue('accountId', pickDefaultAccountId(activeAccounts, data.lastAccountId) ?? '')
    }
    if (value !== 'expense') {
      form.setValue('installmentsCount', 1)
      form.setValue('inProgress', false)
    }
    setShowAllCategories(false)
  }

  function changeSource(value: string) {
    const source = decodeSource(value)
    form.setValue('accountId', source.accountId, revalidate)
    form.setValue('creditCardId', source.creditCardId, revalidate)
    if (!source.creditCardId) {
      form.setValue('installmentsCount', 1)
      form.setValue('inProgress', false)
    }
  }

  function toggleInProgress() {
    const next = !inProgress
    form.setValue('inProgress', next)
    form.setValue('currentInstallment', 1)
    if (next && form.getValues('installmentsCount') < 2) form.setValue('installmentsCount', 2)
  }

  function changeDate(value: string) {
    form.setValue('date', value, revalidate)
    if (!statusTouched && value) form.setValue('status', defaultStatus(value, today))
  }

  function changeStatus(value: TransactionStatus) {
    setStatusTouched(true)
    form.setValue('status', value)
  }

  function changeRepeat(value: RecurrenceFrequency | '') {
    form.setValue('repeatFrequency', value, revalidate)
    if (value) {
      // Série e parcelamento não combinam
      form.setValue('installmentsCount', 1)
      form.setValue('inProgress', false)
    } else {
      form.setValue('repeatEndDate', '', revalidate)
    }
  }

  function selectCategory(id: string) {
    form.setValue('categoryId', id, revalidate)
    setShowAllCategories(false)
  }

  function toastDeleted(snapshot: DeletionSnapshot, message: string) {
    toast(message, {
      action: {
        label: 'Desfazer',
        onClick: async () => {
          const restored = await restoreTransactions(snapshot)
          if (restored.ok) toast.success('Lançamento restaurado.')
          else toast.error(restored.error)
        },
      },
    })
  }

  function toastSeriesDeleted(snapshot: RecurrenceSnapshot) {
    toast('Lançamentos excluídos.', {
      action: {
        label: 'Desfazer',
        onClick: async () => {
          const restored = await restoreSeries(snapshot)
          if (restored.ok) toast.success('Lançamentos restaurados.')
          else toast.error(restored.error)
        },
      },
    })
  }

  const onSubmit = form.handleSubmit(async (values) => {
    // Parcela: primeiro pergunta onde aplicar
    if (scoped) {
      setScopeAction('save')
      return
    }
    let result: ActionResult<unknown>
    if (isCardForm(values)) {
      const input = toCardTransactionInput(values)
      result = transactionId ? await updateCardTransaction(transactionId, input) : await createCardTransaction(input)
    } else {
      const input = toTransactionInput(values)
      result = transactionId ? await updateTransaction(transactionId, input) : await createTransaction(input)
    }
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(transactionId ? 'Lançamento atualizado.' : 'Lançamento salvo.')
    onDone()
  })

  async function onDelete() {
    if (!transactionId) return
    if (scoped) {
      setScopeAction('delete')
      return
    }
    const result = await deleteTransaction(transactionId)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toastDeleted(result.data, 'Lançamento excluído.')
    onDone()
  }

  /** Parcela: só os campos descritivos (Fase 3). */
  async function applyInstallmentScope(id: string, action: 'save' | 'delete', scope: InstallmentScope): Promise<boolean> {
    if (action === 'save') {
      const values = form.getValues()
      const result = await updateInstallments(id, { scope, description: values.description, categoryId: values.categoryId, notes: values.notes })
      if (!result.ok) {
        applyActionErrors(form, result)
        return false
      }
      toast.success(scope === 'one' ? 'Parcela atualizada.' : 'Parcelas atualizadas.')
      return true
    }
    const result = await deleteInstallments(id, scope)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    toastDeleted(result.data, scope === 'one' ? 'Parcela excluída.' : 'Parcelas excluídas.')
    return true
  }

  /** Série: "só este" usa as actions normais; "este e os próximos" muda a série (Fase 4). */
  async function applySeriesScope(id: string, action: 'save' | 'delete', scope: Scope): Promise<boolean> {
    if (action === 'delete') {
      if (scope === 'one') {
        const result = await deleteTransaction(id)
        if (!result.ok) {
          toast.error(result.error)
          return false
        }
        toastDeleted(result.data, 'Lançamento excluído.')
        return true
      }
      const result = await deleteSeriesFollowing(id)
      if (!result.ok) {
        toast.error(result.error)
        return false
      }
      toastSeriesDeleted(result.data)
      return true
    }

    const values = form.getValues()
    const onCard = isCardForm(values)
    const input = onCard ? toCardTransactionInput(values) : toTransactionInput(values)
    let result: ActionResult<unknown>
    if (scope === 'rest') result = await updateSeriesFollowing(id, input, onCard ? 'card' : 'account')
    else result = onCard ? await updateCardTransaction(id, input) : await updateTransaction(id, input)
    if (!result.ok) {
      applyActionErrors(form, result)
      return false
    }
    toast.success(scope === 'one' ? 'Lançamento atualizado.' : 'Este e os próximos atualizados.')
    return true
  }

  async function applyScope(scope: Scope) {
    if (!transactionId || !scopeAction) return
    setBusy(true)
    try {
      const ok = series
        ? await applySeriesScope(transactionId, scopeAction, scope)
        : await applyInstallmentScope(transactionId, scopeAction, scope === 'one' ? 'one' : 'future')
      if (ok) onDone()
    } finally {
      setBusy(false)
      setScopeAction(null)
    }
  }

  const scopeLabels = series
    ? { one: 'Só este', rest: 'Este e os próximos' }
    : { one: 'Só esta parcela', rest: 'Esta e as futuras' }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-2" noValidate>
      {series ? (
        <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
          <Repeat className="size-4 shrink-0" aria-hidden />
          {FREQUENCY_LABELS[series.frequency]} · {initial?.description}. Frequência e data final mudam na tela Recorrências.
        </p>
      ) : null}
      {locked ? null : <Segmented label="Tipo de lançamento" value={type} options={TYPE_OPTIONS} onChange={changeType} />}

      <div>
        <label htmlFor="tx-amount" className="text-sm text-muted-foreground">
          {canSplit && inProgress ? 'Valor da parcela' : 'Valor'}
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
                disabled={locked}
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

      {type === 'transfer' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="tx-account" label="De" error={errors.accountId?.message}>
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
        </div>
      ) : (
        <Field id="tx-source" label="Pagar com" error={errors.accountId?.message ?? errors.creditCardId?.message}>
          <NativeSelect
            id="tx-source"
            value={encodeSource({ accountId, creditCardId })}
            onChange={(event) => changeSource(event.target.value)}
            disabled={locked}
            aria-invalid={Boolean(errors.accountId ?? errors.creditCardId)}
            aria-describedby={errors.accountId || errors.creditCardId ? 'tx-source-error' : undefined}
          >
            <option value="" disabled>
              Escolha…
            </option>
            <optgroup label="Contas">
              {accountOptions(accountId).map((account) => (
                <option key={account.id} value={`account:${account.id}`}>
                  {account.name}
                </option>
              ))}
            </optgroup>
            {cardOptions.length > 0 ? (
              <optgroup label="Cartões">
                {cardOptions.map((item) => (
                  <option key={item.id} value={`card:${item.id}`}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </NativeSelect>
        </Field>
      )}
      {isCard && type === 'income' ? (
        <p className="-mt-3 text-sm text-muted-foreground">Estorno / crédito no cartão: abate o total da fatura.</p>
      ) : null}

      {canSplit ? (
        <div className="space-y-2">
          {inProgress ? (
            <div className="grid grid-cols-2 gap-4">
              <Field id="tx-current" label="Parcela atual" error={errors.currentInstallment?.message}>
                <NativeSelect id="tx-current" {...form.register('currentInstallment', { valueAsNumber: true })}>
                  {NUMBERS.slice(0, installmentsCount).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="tx-count" label="De" error={errors.installmentsCount?.message}>
                <NativeSelect id="tx-count" {...form.register('installmentsCount', { valueAsNumber: true })}>
                  {NUMBERS.slice(1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          ) : (
            <Field id="tx-count" label="Parcelas" error={errors.installmentsCount?.message}>
              <NativeSelect id="tx-count" {...form.register('installmentsCount', { valueAsNumber: true })}>
                {NUMBERS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'À vista (1x)' : `${n}x`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {firstInstallment !== null ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {installmentsCount}x de {formatBRL(firstInstallment)}
            </p>
          ) : null}
          <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={toggleInProgress}>
            {inProgress ? 'Compra nova (informar o valor total)' : 'Compra já em andamento?'}
          </button>
        </div>
      ) : null}
      {installment ? (
        <p className="text-sm text-muted-foreground">
          Parcela {installment.number} de {installment.count}. Para mudar valor, parcelas ou cartão, exclua e lance de novo.
        </p>
      ) : null}

      <Field id="tx-date" label={canSplit && inProgress ? 'Data da parcela atual' : 'Data'} error={errors.date?.message}>
        <div className="flex gap-2">
          <Input
            id="tx-date"
            type="date"
            value={date}
            disabled={locked}
            onChange={(event) => changeDate(event.target.value)}
            aria-invalid={Boolean(errors.date)}
            className="flex-1"
          />
          <Button type="button" variant="outline" disabled={locked} onClick={() => changeDate(today)}>
            Hoje
          </Button>
          <Button type="button" variant="outline" disabled={locked} onClick={() => changeDate(addDaysISO(today, -1))}>
            Ontem
          </Button>
        </div>
      </Field>
      {cycle ? (
        <p className="-mt-3 text-sm text-muted-foreground">
          Cai na fatura de {formatYearMonthLabel(yearMonthOfISO(cycle.referenceMonth)).toLowerCase()} (fecha{' '}
          {formatISODateBR(cycle.closingDate).slice(0, 5)}, vence {formatISODateBR(cycle.dueDate).slice(0, 5)}).
        </p>
      ) : null}
      {beforeInitialBalance ? (
        <p className="-mt-3 text-sm text-warning">Este lançamento não afeta o saldo atual desta conta (data anterior ao saldo inicial).</p>
      ) : null}

      {showRepeat ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Repetir</p>
          <Segmented label="Repetir" value={repeatFrequency} options={REPEAT_OPTIONS} onChange={changeRepeat} />
          {repeatFrequency ? (
            <>
              <Field id="tx-repeat-end" label="Até (opcional)" error={errors.repeatEndDate?.message}>
                <Input
                  id="tx-repeat-end"
                  type="date"
                  min={ISO_DATE.test(date) ? date : undefined}
                  aria-invalid={Boolean(errors.repeatEndDate)}
                  aria-describedby={errors.repeatEndDate ? 'tx-repeat-end-error' : undefined}
                  {...form.register('repeatEndDate')}
                />
              </Field>
              {ISO_DATE.test(date) ? (
                <p className="text-sm text-muted-foreground">
                  {describeSchedule({ frequency: repeatFrequency, startDate: date, endDate: ISO_DATE.test(repeatEndDate) ? repeatEndDate : null })}.
                  Os próximos ficam como previstos.
                </p>
              ) : null}
            </>
          ) : null}
          {errors.repeatFrequency ? (
            <p role="alert" className="text-sm text-expense">
              {errors.repeatFrequency.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {isCard ? null : <Segmented label="Status" value={status} options={STATUS_OPTIONS} onChange={changeStatus} />}

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

      {scopeAction ? (
        <div className="space-y-2 rounded-lg border border-border p-3" role="group" aria-label="Escolha o alcance">
          <p className="text-sm font-medium">{scopeAction === 'save' ? 'Aplicar a alteração em:' : 'Excluir:'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => applyScope('one')}>
              {scopeLabels.one}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => applyScope('rest')}>
              {scopeLabels.rest}
            </Button>
          </div>
          <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => setScopeAction(null)}>
            Cancelar
          </Button>
        </div>
      ) : (
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
      )}
    </form>
  )
}
