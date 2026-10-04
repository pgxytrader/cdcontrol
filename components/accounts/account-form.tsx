'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ColorPicker } from '@/components/form/color-picker'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createAccount, updateAccount } from '@/lib/actions/accounts'
import { COLOR_PALETTE } from '@/lib/categories'
import { todayISO } from '@/lib/dates'
import { applyActionErrors } from '@/lib/forms'
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  accountSchema,
  type AccountFormInput,
  type AccountOutput,
} from '@/lib/validation/account'

type AccountFormProps = { accountId?: string; initial?: AccountFormInput; onDone: () => void }

function AccountForm({ accountId, initial, onDone }: AccountFormProps) {
  const router = useRouter()
  const form = useForm<AccountFormInput, unknown, AccountOutput>({
    resolver: zodResolver(accountSchema),
    defaultValues: initial ?? {
      name: '',
      institution: '',
      type: 'checking',
      initialBalanceCents: 0,
      initialBalanceDate: todayISO(),
      color: COLOR_PALETTE[0],
    },
  })
  const [negative, setNegative] = useState((initial?.initialBalanceCents ?? 0) < 0)
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = accountId ? await updateAccount(accountId, values) : await createAccount(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(accountId ? 'Conta atualizada.' : 'Conta criada.')
    router.refresh()
    onDone()
  })

  function toggleNegative(checked: boolean) {
    setNegative(checked)
    const current = Math.abs(form.getValues('initialBalanceCents'))
    form.setValue('initialBalanceCents', checked ? -current : current)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2" noValidate>
      <Field id="account-name" label="Nome" error={errors.name?.message}>
        <Input
          id="account-name"
          placeholder="Ex.: Itaú conjunta"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'account-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>
      <Field id="account-institution" label="Banco/instituição (opcional)" error={errors.institution?.message}>
        <Input id="account-institution" autoComplete="off" {...form.register('institution')} />
      </Field>
      <Field id="account-type" label="Tipo" error={errors.type?.message}>
        <NativeSelect id="account-type" {...form.register('type')}>
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="account-initial" label="Saldo inicial (R$)" error={errors.initialBalanceCents?.message}>
          <Controller
            control={form.control}
            name="initialBalanceCents"
            render={({ field }) => (
              <MoneyInput
                id="account-initial"
                valueCents={Math.abs(field.value)}
                onChangeCents={(cents) => field.onChange(negative ? -cents : cents)}
              />
            )}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={negative} onChange={(event) => toggleNegative(event.target.checked)} />
            Saldo negativo
          </label>
        </Field>
        <Field id="account-initial-date" label="Data do saldo inicial" error={errors.initialBalanceDate?.message}>
          <Input id="account-initial-date" type="date" {...form.register('initialBalanceDate')} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cor</legend>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => <ColorPicker label="Cor da conta" value={field.value} onChange={field.onChange} />}
        />
      </fieldset>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

type AccountFormButtonProps = {
  accountId?: string
  initial?: AccountFormInput
  label: string
  variant?: 'default' | 'outline'
}

export function AccountFormButton({ accountId, initial, label, variant = 'default' }: AccountFormButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {accountId ? <Pencil aria-hidden /> : <Plus aria-hidden />}
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={accountId ? 'Editar conta' : 'Nova conta'}>
        {open ? <AccountForm accountId={accountId} initial={initial} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
