'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ColorPicker } from '@/components/form/color-picker'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createCard, updateCard } from '@/lib/actions/cards'
import { COLOR_PALETTE } from '@/lib/categories'
import { applyActionErrors } from '@/lib/forms'
import { CARD_BRAND_LABELS, CARD_BRANDS, cardSchema, type CardFormInput, type CardOutput } from '@/lib/validation/card'

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1)

type CardFormProps = { cardId?: string; initial?: CardFormInput; onDone: () => void }

function CardForm({ cardId, initial, onDone }: CardFormProps) {
  const { accounts } = useTransactionFormData()
  const form = useForm<CardFormInput, unknown, CardOutput>({
    resolver: zodResolver(cardSchema),
    defaultValues: initial ?? {
      name: '',
      brand: 'mastercard',
      lastFour: '',
      limitCents: 0,
      closingDay: 1,
      dueDay: 10,
      defaultPaymentAccountId: '',
      color: COLOR_PALETTE[0],
    },
  })
  const { errors, isSubmitting } = form.formState
  const [closingDay, dueDay, defaultAccountId] = useWatch({
    control: form.control,
    name: ['closingDay', 'dueDay', 'defaultPaymentAccountId'],
  })
  const daysChanged = Boolean(cardId && initial) && (closingDay !== initial?.closingDay || dueDay !== initial?.dueDay)
  const accountOptions = accounts.filter((account) => !account.archived || account.id === defaultAccountId)

  const onSubmit = form.handleSubmit(async (values) => {
    const result = cardId ? await updateCard(cardId, values) : await createCard(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(cardId ? 'Cartão atualizado.' : 'Cartão criado.')
    onDone()
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2" noValidate>
      <Field id="card-name" label="Nome" error={errors.name?.message}>
        <Input
          id="card-name"
          placeholder="Ex.: Nubank Paula"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'card-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="card-brand" label="Bandeira" error={errors.brand?.message}>
          <NativeSelect id="card-brand" {...form.register('brand')}>
            {CARD_BRANDS.map((brand) => (
              <option key={brand} value={brand}>
                {CARD_BRAND_LABELS[brand]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="card-last-four" label="Últimos 4 dígitos (opcional)" error={errors.lastFour?.message}>
          <Input
            id="card-last-four"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="1234"
            aria-invalid={Boolean(errors.lastFour)}
            aria-describedby={errors.lastFour ? 'card-last-four-error' : undefined}
            {...form.register('lastFour')}
          />
        </Field>
      </div>
      <Field id="card-limit" label="Limite (R$)" error={errors.limitCents?.message}>
        <Controller
          control={form.control}
          name="limitCents"
          render={({ field }) => <MoneyInput id="card-limit" valueCents={field.value} onChangeCents={field.onChange} />}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="card-closing" label="Dia de fechamento" error={errors.closingDay?.message}>
          <NativeSelect id="card-closing" {...form.register('closingDay', { valueAsNumber: true })}>
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="card-due" label="Dia de vencimento" error={errors.dueDay?.message}>
          <NativeSelect id="card-due" {...form.register('dueDay', { valueAsNumber: true })}>
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {daysChanged ? (
        <p className="-mt-2 text-sm text-warning">Faturas abertas e futuras serão recalculadas; faturas fechadas não mudam.</p>
      ) : null}
      <Field id="card-account" label="Conta padrão de pagamento" error={errors.defaultPaymentAccountId?.message}>
        <NativeSelect id="card-account" {...form.register('defaultPaymentAccountId')}>
          <option value="">Nenhuma</option>
          {accountOptions.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cor</legend>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => <ColorPicker label="Cor do cartão" value={field.value} onChange={field.onChange} />}
        />
      </fieldset>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

type CardFormButtonProps = { cardId?: string; initial?: CardFormInput; label: string; variant?: 'default' | 'outline' }

export function CardFormButton({ cardId, initial, label, variant = 'default' }: CardFormButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {cardId ? <Pencil aria-hidden /> : <Plus aria-hidden />}
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={cardId ? 'Editar cartão' : 'Novo cartão'}>
        {open ? <CardForm cardId={cardId} initial={initial} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
