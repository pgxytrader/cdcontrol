'use client'

import { Pencil } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createExpenseType, updateExpenseType } from '@/lib/actions/property-types'
import { TYPICAL_PHASE_LABELS, TYPICAL_PHASES, type ExpenseType, type TypicalPhase } from '@/lib/finance/property'

type Errors = Record<string, string[] | undefined>

function ExpenseTypeForm({ type, onDone }: { type?: ExpenseType; onDone: () => void }) {
  const [name, setName] = useState(type?.name ?? '')
  const [phase, setPhase] = useState<TypicalPhase>(type?.typicalPhase ?? 'any')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const values = { name, typicalPhase: phase }
    startTransition(async () => {
      const result = type ? await updateExpenseType(type.id, values) : await createExpenseType(values)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success(type ? 'Tipo atualizado.' : 'Tipo criado.')
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
      <Field id="type-name" label="Nome" error={errors.name?.[0]}>
        <Input id="type-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-invalid={Boolean(errors.name)} />
      </Field>
      <Field id="type-phase" label="Fase típica" error={errors.typicalPhase?.[0]}>
        <NativeSelect id="type-phase" value={phase} onChange={(e) => setPhase(e.target.value as TypicalPhase)}>
          {TYPICAL_PHASES.map((value) => (
            <option key={value} value={value}>
              {TYPICAL_PHASE_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

/** Sem `type`: botão "Novo tipo". Com `type`: ícone de editar. */
export function ExpenseTypeFormButton({ type }: { type?: ExpenseType }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {type ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Editar ${type.name}`}>
          <Pencil aria-hidden />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>Novo tipo</Button>
      )}
      <ResponsiveModal open={open} onOpenChange={setOpen} title={type ? 'Editar tipo de gasto' : 'Novo tipo de gasto'}>
        {open ? <ExpenseTypeForm type={type} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
