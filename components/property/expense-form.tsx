'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createExpense, updateExpense } from '@/lib/actions/property-expenses'
import { FUNDING_LABELS, FUNDING_SOURCES, type ExpenseType, type FundingSource } from '@/lib/finance/property'
import type { ExpenseView } from '@/lib/validation/property'

type Errors = Record<string, string[] | undefined>

type ExpenseFormProps = {
  propertyId: string
  types: ExpenseType[]
  today: string
  expense?: ExpenseView
  onDone: () => void
}

export function ExpenseForm({ propertyId, types, today, expense, onDone }: ExpenseFormProps) {
  // Tipos ativos + o tipo atual do gasto, mesmo se arquivado
  const options = types.filter((type) => !type.archived || type.id === expense?.expenseTypeId)
  const [typeId, setTypeId] = useState(expense?.expenseTypeId ?? options[0]?.id ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [payee, setPayee] = useState(expense?.payee ?? '')
  const [plannedCents, setPlannedCents] = useState(expense?.plannedAmountCents ?? 0)
  const [dueDate, setDueDate] = useState(expense?.dueDate ?? today)
  const [fundingSource, setFundingSource] = useState<FundingSource>(expense?.fundingSource ?? 'own')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()
  const err = (field: string) => errors[field]?.[0]
  const paid = expense?.status === 'paid'

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const values = { propertyId, expenseTypeId: typeId, description, payee, plannedAmountCents: plannedCents, dueDate, fundingSource, notes }
    startTransition(async () => {
      const result = expense ? await updateExpense(expense.id, values) : await createExpense(values)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success(expense ? 'Gasto atualizado.' : 'Gasto criado.')
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
      <Field id="expense-type" label="Tipo" error={err('expenseTypeId')}>
        <NativeSelect id="expense-type" value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-invalid={Boolean(err('expenseTypeId'))}>
          {options.map((type) => (
            <option key={type.id} value={type.id}>
              {type.archived ? `${type.name} (arquivado)` : type.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="expense-description" label="Descrição" error={err('description')}>
        <Input id="expense-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} aria-invalid={Boolean(err('description'))} />
      </Field>
      <Field id="expense-payee" label="Favorecido" error={err('payee')}>
        <Input id="expense-payee" value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={80} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="expense-planned" label="Valor previsto" error={err('plannedAmountCents')}>
          <MoneyInput id="expense-planned" valueCents={plannedCents} onChangeCents={setPlannedCents} aria-invalid={Boolean(err('plannedAmountCents'))} />
        </Field>
        <Field id="expense-due" label="Vencimento" error={err('dueDate')}>
          <Input id="expense-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-invalid={Boolean(err('dueDate'))} />
        </Field>
      </div>
      <Field id="expense-source" label="Fonte do recurso" error={err('fundingSource')}>
        <NativeSelect id="expense-source" value={fundingSource} disabled={paid} onChange={(e) => setFundingSource(e.target.value as FundingSource)}>
          {FUNDING_SOURCES.map((source) => (
            <option key={source} value={source}>
              {FUNDING_LABELS[source]}
            </option>
          ))}
        </NativeSelect>
        {paid ? <p className="text-xs text-muted-foreground">A fonte de um gasto pago muda em “Editar pagamento”.</p> : null}
      </Field>
      <Field id="expense-notes" label="Observação" error={err('notes')}>
        <textarea
          id="expense-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full min-w-0 rounded-lg border border-input bg-surface-2 px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

export function ExpenseFormButton({ propertyId, types, today }: { propertyId: string; types: ExpenseType[]; today: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo gasto</Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Novo gasto">
        {open ? <ExpenseForm propertyId={propertyId} types={types} today={today} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
