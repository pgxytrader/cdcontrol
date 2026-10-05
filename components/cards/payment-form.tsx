'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Wallet } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { Segmented } from '@/components/form/segmented'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { payInvoice, updateInvoicePayment } from '@/lib/actions/invoices'
import { deleteTransaction, restoreTransactions } from '@/lib/actions/transactions'
import { todayISO } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import { defaultStatus } from '@/lib/finance/status'
import type { TransactionStatus } from '@/lib/finance/types'
import { applyActionErrors } from '@/lib/forms'
import { invoicePaymentSchema, type InvoicePaymentInput } from '@/lib/validation/invoice-payment'

export type ExistingPayment = InvoicePaymentInput & { id: string }

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Pago' },
  { value: 'pending', label: 'Pendente' },
] as const

type PaymentFormProps = {
  invoiceId: string
  remainingCents: number
  defaultAccountId: string | null
  payment?: ExistingPayment
  onDone: () => void
}

function PaymentForm({ invoiceId, remainingCents, defaultAccountId, payment, onDone }: PaymentFormProps) {
  const { accounts } = useTransactionFormData()
  const active = accounts.filter((account) => !account.archived)
  const fallbackAccountId =
    defaultAccountId && active.some((account) => account.id === defaultAccountId) ? defaultAccountId : (active[0]?.id ?? '')
  const [today] = useState(() => todayISO())
  const form = useForm<InvoicePaymentInput, unknown, InvoicePaymentInput>({
    resolver: zodResolver(invoicePaymentSchema),
    defaultValues: payment
      ? { accountId: payment.accountId, amountCents: payment.amountCents, date: payment.date, status: payment.status }
      : { accountId: fallbackAccountId, amountCents: remainingCents, date: today, status: defaultStatus(today, today) },
  })
  // Pagamento novo: o status segue a data até o usuário escolher; na edição, mantém o salvo
  const [statusTouched, setStatusTouched] = useState(Boolean(payment))
  const { errors, isSubmitting } = form.formState
  const [accountId, amountCents, status] = useWatch({ control: form.control, name: ['accountId', 'amountCents', 'status'] })
  // Na edição, um pagamento já pago está descontado do que falta
  const limit = remainingCents + (payment?.status === 'paid' ? payment.amountCents : 0)
  const options = accounts.filter((account) => !account.archived || account.id === accountId)

  function changeStatus(value: TransactionStatus) {
    setStatusTouched(true)
    form.setValue('status', value)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const result = payment ? await updateInvoicePayment(payment.id, values) : await payInvoice(invoiceId, values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(payment ? 'Pagamento atualizado.' : 'Pagamento registrado.')
    onDone()
  })

  async function onDelete() {
    if (!payment) return
    const result = await deleteTransaction(payment.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const snapshot = result.data
    toast('Pagamento excluído.', {
      action: {
        label: 'Desfazer',
        onClick: async () => {
          const restored = await restoreTransactions(snapshot)
          if (restored.ok) toast.success('Pagamento restaurado.')
          else toast.error(restored.error)
        },
      },
    })
    onDone()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2" noValidate>
      <Field id="payment-account" label="Conta" error={errors.accountId?.message}>
        <NativeSelect
          id="payment-account"
          aria-invalid={Boolean(errors.accountId)}
          aria-describedby={errors.accountId ? 'payment-account-error' : undefined}
          {...form.register('accountId')}
        >
          <option value="" disabled>
            Escolha…
          </option>
          {options.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="payment-amount" label="Valor (R$)" error={errors.amountCents?.message}>
        <Controller
          control={form.control}
          name="amountCents"
          render={({ field }) => (
            <MoneyInput
              id="payment-amount"
              valueCents={field.value}
              onChangeCents={field.onChange}
              aria-invalid={Boolean(errors.amountCents)}
              aria-describedby={errors.amountCents ? 'payment-amount-error' : undefined}
            />
          )}
        />
      </Field>
      {amountCents > limit ? (
        <p className="-mt-2 text-sm text-warning">Acima do que falta ({formatBRL(limit)}). O excedente fica como crédito na fatura.</p>
      ) : null}
      <Field id="payment-date" label="Data" error={errors.date?.message}>
        <Input
          id="payment-date"
          type="date"
          aria-invalid={Boolean(errors.date)}
          {...form.register('date', {
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
              const value = event.target.value
              if (!statusTouched && value) form.setValue('status', defaultStatus(value, today))
            },
          })}
        />
      </Field>
      <Segmented label="Status" value={status} options={STATUS_OPTIONS} onChange={changeStatus} />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : 'Salvar'}
        </Button>
        {payment ? (
          <Button type="button" variant="outline" className="text-expense" onClick={onDelete} disabled={isSubmitting}>
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  )
}

type PaymentModalProps = Omit<PaymentFormProps, 'onDone'> & { open: boolean; onOpenChange: (open: boolean) => void }

export function PaymentModal({ open, onOpenChange, payment, ...props }: PaymentModalProps) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={payment ? 'Editar pagamento' : 'Pagar fatura'}>
      {open ? <PaymentForm key={payment?.id ?? 'new'} payment={payment} {...props} onDone={() => onOpenChange(false)} /> : null}
    </ResponsiveModal>
  )
}

type PayInvoiceButtonProps = { invoiceId: string | null; remainingCents: number; defaultAccountId: string | null }

/** Sem fatura salva (nenhum lançamento no ciclo) não há o que pagar. */
export function PayInvoiceButton({ invoiceId, remainingCents, defaultAccountId }: PayInvoiceButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="w-full sm:w-auto" disabled={!invoiceId} onClick={() => setOpen(true)}>
        <Wallet aria-hidden />
        Pagar fatura
      </Button>
      {invoiceId ? (
        <PaymentModal
          open={open}
          onOpenChange={setOpen}
          invoiceId={invoiceId}
          remainingCents={remainingCents}
          defaultAccountId={defaultAccountId}
        />
      ) : null}
    </>
  )
}
