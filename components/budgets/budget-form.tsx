'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { Segmented } from '@/components/form/segmented'
import { Button } from '@/components/ui/button'
import { setBudget } from '@/lib/actions/budgets'
import { formatYearMonthLabel, yearMonthOfISO } from '@/lib/dates'
import type { BudgetLine, BudgetMode } from '@/lib/finance/budget'

const MODE_OPTIONS = [
  { value: 'from', label: 'A partir deste mês' },
  { value: 'only', label: 'Só este mês' },
] as const

export function BudgetForm({ line, month, onDone }: { line: BudgetLine; month: string; onDone: () => void }) {
  const [amountCents, setAmountCents] = useState(line.limitCents ?? 0)
  const [mode, setMode] = useState<BudgetMode>('from')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const monthLabel = formatYearMonthLabel(yearMonthOfISO(month)).toLowerCase()

  function save(value: number) {
    startTransition(async () => {
      const result = await setBudget({ categoryId: line.categoryId, month, amountCents: value, mode })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(value === 0 ? 'Limite removido.' : 'Limite salvo.')
      onDone()
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (amountCents <= 0) {
      setError('Informe um valor maior que zero ou use “Remover limite”.')
      return
    }
    setError(null)
    save(amountCents)
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-2" noValidate>
      <Field id="budget-amount" label={`Limite de ${line.name}`} error={error ?? undefined}>
        <MoneyInput
          id="budget-amount"
          autoFocus
          valueCents={amountCents}
          onChangeCents={setAmountCents}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'budget-amount-error' : undefined}
        />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Aplicar</p>
        <Segmented label="Aplicar" value={mode} options={MODE_OPTIONS} onChange={setMode} />
        <p className="text-sm text-muted-foreground">
          {mode === 'from' ? `Vale de ${monthLabel} em diante, até você mudar.` : `Vale só para ${monthLabel}.`}
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        {line.limitCents !== null ? (
          <Button type="button" variant="outline" className="text-expense" disabled={pending} onClick={() => save(0)}>
            Remover limite
          </Button>
        ) : null}
      </div>
    </form>
  )
}
