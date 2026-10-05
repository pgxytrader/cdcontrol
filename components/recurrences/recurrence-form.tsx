'use client'

import { useState, useTransition } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { Segmented } from '@/components/form/segmented'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { endRecurrence, updateRecurrence } from '@/lib/actions/recurrences'
import { activeCategories, buildCategoryTree } from '@/lib/categories'
import { todayISO } from '@/lib/dates'
import {
  describeSchedule,
  FREQUENCY_LABELS,
  horizonDate,
  occurrenceDates,
  RECURRENCE_FREQUENCIES,
  type RecurrenceItem,
} from '@/lib/finance/recurrence'
import { applyActionErrors } from '@/lib/forms'
import { decodeSource, encodeSource } from '@/lib/transaction-mappers'
import { recurrenceFormResolver, toRecurrenceEditInput, type RecurrenceFormValues } from '@/lib/validation/recurrence'

const FREQUENCY_OPTIONS = RECURRENCE_FREQUENCIES.map((value) => ({ value, label: FREQUENCY_LABELS[value] }))
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Próxima data sugerida: a próxima não realizada ou, se não houver, a próxima data do calendário da série. */
function suggestedNextDate(item: RecurrenceItem, today: string): string {
  return item.nextDate ?? occurrenceDates({ ...item, endDate: null }, today, horizonDate(today))[0] ?? today
}

export function RecurrenceForm({ item, onDone }: { item: RecurrenceItem; onDone: () => void }) {
  const data = useTransactionFormData()
  const [today] = useState(() => todayISO())
  const [ending, startEnding] = useTransition()
  const form = useForm<RecurrenceFormValues>({
    resolver: recurrenceFormResolver,
    defaultValues: {
      type: item.type,
      amountCents: item.amountCents,
      description: item.description,
      categoryId: item.categoryId ?? '',
      accountId: item.accountId ?? '',
      creditCardId: item.creditCardId ?? '',
      destinationAccountId: item.destinationAccountId ?? '',
      frequency: item.frequency,
      nextDate: suggestedNextDate(item, today),
      endDate: item.endDate ?? '',
      notes: item.notes ?? '',
    },
  })
  const { errors, isSubmitting } = form.formState
  const [frequency, nextDate, endDate, accountId, creditCardId] = useWatch({
    control: form.control,
    name: ['frequency', 'nextDate', 'endDate', 'accountId', 'creditCardId'],
  })

  const kind = item.type === 'income' ? 'income' : 'expense'
  const tree = buildCategoryTree(
    activeCategories(data.categories).filter((category) => category.kind === kind || category.id === item.categoryId),
  )
  const accounts = data.accounts.filter((account) => !account.archived || account.id === item.accountId || account.id === item.destinationAccountId)
  const cards = item.type === 'expense' ? data.cards.filter((card) => !card.archived || card.id === item.creditCardId) : []

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateRecurrence(item.id, toRecurrenceEditInput(values))
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success('Recorrência atualizada.')
    onDone()
  })

  function end() {
    if (!window.confirm('Encerrar esta recorrência? Os lançamentos previstos depois de hoje serão excluídos; os já pagos ficam.')) return
    startEnding(async () => {
      const result = await endRecurrence(item.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Recorrência encerrada.')
      onDone()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-2" noValidate>
      <Field id="rec-amount" label="Valor" error={errors.amountCents?.message}>
        <Controller
          control={form.control}
          name="amountCents"
          render={({ field }) => (
            <MoneyInput
              id="rec-amount"
              valueCents={field.value}
              onChangeCents={field.onChange}
              aria-invalid={Boolean(errors.amountCents)}
              aria-describedby={errors.amountCents ? 'rec-amount-error' : undefined}
            />
          )}
        />
      </Field>

      <Field id="rec-description" label="Descrição" error={errors.description?.message}>
        <Input id="rec-description" autoComplete="off" aria-invalid={Boolean(errors.description)} {...form.register('description')} />
      </Field>

      {item.type === 'transfer' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="rec-account" label="De" error={errors.accountId?.message}>
            <NativeSelect id="rec-account" {...form.register('accountId')}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="rec-destination" label="Para" error={errors.destinationAccountId?.message}>
            <NativeSelect id="rec-destination" {...form.register('destinationAccountId')}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      ) : (
        <>
          <Field id="rec-category" label="Categoria" error={errors.categoryId?.message}>
            <NativeSelect id="rec-category" {...form.register('categoryId')}>
              <option value="" disabled>
                Escolha…
              </option>
              {tree.flatMap((node) => [
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>,
                ...node.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {`  ↳ ${child.name}`}
                  </option>
                )),
              ])}
            </NativeSelect>
          </Field>
          <Field id="rec-source" label={item.type === 'income' ? 'Receber em' : 'Pagar com'} error={errors.accountId?.message}>
            <NativeSelect
              id="rec-source"
              value={encodeSource({ accountId, creditCardId })}
              onChange={(event) => {
                const source = decodeSource(event.target.value)
                form.setValue('accountId', source.accountId)
                form.setValue('creditCardId', source.creditCardId)
              }}
            >
              <optgroup label="Contas">
                {accounts.map((account) => (
                  <option key={account.id} value={`account:${account.id}`}>
                    {account.name}
                  </option>
                ))}
              </optgroup>
              {cards.length > 0 ? (
                <optgroup label="Cartões">
                  {cards.map((card) => (
                    <option key={card.id} value={`card:${card.id}`}>
                      {card.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </NativeSelect>
          </Field>
        </>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Frequência</p>
        <Segmented label="Frequência" value={frequency} options={FREQUENCY_OPTIONS} onChange={(value) => form.setValue('frequency', value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rec-next" label="Próxima data" error={errors.nextDate?.message}>
          <Input id="rec-next" type="date" min={today} aria-invalid={Boolean(errors.nextDate)} {...form.register('nextDate')} />
        </Field>
        <Field id="rec-end" label="Até (opcional)" error={errors.endDate?.message}>
          <Input id="rec-end" type="date" min={nextDate} aria-invalid={Boolean(errors.endDate)} {...form.register('endDate')} />
        </Field>
      </div>
      {ISO_DATE.test(nextDate) ? (
        <p className="-mt-3 text-sm text-muted-foreground">
          {describeSchedule({ frequency, startDate: nextDate, endDate: ISO_DATE.test(endDate) ? endDate : null })}. Vale para os
          lançamentos previstos de hoje em diante; os já pagos não mudam.
        </p>
      ) : null}

      <Field id="rec-notes" label="Observação" error={errors.notes?.message}>
        <textarea
          id="rec-notes"
          rows={2}
          className="w-full rounded-lg border border-input bg-surface-2 px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          {...form.register('notes')}
        />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting || ending}>
          {isSubmitting ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="outline" className="text-expense" onClick={end} disabled={isSubmitting || ending}>
          Encerrar
        </Button>
      </div>
    </form>
  )
}
