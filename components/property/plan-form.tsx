'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteExpenses, generatePlan } from '@/lib/actions/property-expenses'
import { formatISODateBR } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import { FUNDING_LABELS, FUNDING_SOURCES, type FundingSource } from '@/lib/finance/property'
import { buildPaymentPlan, PLAN_BLOCK_LABELS, planPreview, type PaymentPlanInput } from '@/lib/finance/property-plan'

const toCount = (text: string) => (text.trim() ? Number(text) : 0)

function PlanForm({ propertyId, today, onDone }: { propertyId: string; today: string; onDone: () => void }) {
  const [fundingSource, setFundingSource] = useState<FundingSource>('own')
  const [monthlyOn, setMonthlyOn] = useState(true)
  const [monthlyCents, setMonthlyCents] = useState(0)
  const [monthlyCount, setMonthlyCount] = useState('36')
  const [monthlyFirst, setMonthlyFirst] = useState(today)
  const [intermediateOn, setIntermediateOn] = useState(false)
  const [intermediateCents, setIntermediateCents] = useState(0)
  const [intermediateCount, setIntermediateCount] = useState('6')
  const [intermediateFirst, setIntermediateFirst] = useState(today)
  const [everyMonths, setEveryMonths] = useState<6 | 12>(6)
  const [keysOn, setKeysOn] = useState(false)
  const [keysCents, setKeysCents] = useState(0)
  const [keysDate, setKeysDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const input: PaymentPlanInput = {
    fundingSource,
    monthly: monthlyOn ? { amountCents: monthlyCents, count: toCount(monthlyCount), firstDueDate: monthlyFirst } : null,
    intermediate: intermediateOn
      ? { amountCents: intermediateCents, count: toCount(intermediateCount), firstDueDate: intermediateFirst, everyMonths }
      : null,
    keys: keysOn ? { amountCents: keysCents, dueDate: keysDate } : null,
  }

  // Prévia só com blocos completos e dentro dos limites (evita laço enorme enquanto digita)
  const previewInput: PaymentPlanInput = {
    fundingSource,
    monthly:
      input.monthly && input.monthly.amountCents > 0 && input.monthly.count >= 1 && input.monthly.count <= 360 && input.monthly.firstDueDate
        ? input.monthly
        : null,
    intermediate:
      input.intermediate &&
      input.intermediate.amountCents > 0 &&
      input.intermediate.count >= 1 &&
      input.intermediate.count <= 60 &&
      input.intermediate.firstDueDate
        ? input.intermediate
        : null,
    keys: input.keys && input.keys.amountCents > 0 && input.keys.dueDate ? input.keys : null,
  }
  const preview = planPreview(buildPaymentPlan(previewInput))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await generatePlan({ propertyId, ...input })
      if (!result.ok) {
        setError(Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.error)
        toast.error(result.error)
        return
      }
      const ids = result.data.ids
      toast(`${ids.length} gastos criados.`, {
        action: {
          label: 'Desfazer',
          onClick: async () => {
            const undone = await deleteExpenses(ids)
            if (undone.ok) toast.success('Plano desfeito.')
            else toast.error(undone.error)
          },
        },
      })
      onDone()
    })
  }

  const blockClass = 'space-y-3 rounded-lg border border-border p-3'
  const toggleClass = 'flex items-center gap-2 text-sm font-medium'

  return (
    <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
      <Field id="plan-source" label="Fonte do recurso">
        <NativeSelect id="plan-source" value={fundingSource} onChange={(e) => setFundingSource(e.target.value as FundingSource)}>
          {FUNDING_SOURCES.map((source) => (
            <option key={source} value={source}>
              {FUNDING_LABELS[source]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <fieldset className={blockClass}>
        <legend className="sr-only">Mensais</legend>
        <label className={toggleClass}>
          <input type="checkbox" checked={monthlyOn} onChange={(e) => setMonthlyOn(e.target.checked)} className="size-4 accent-primary" />
          Mensais
        </label>
        {monthlyOn ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="plan-monthly-amount" label="Valor">
              <MoneyInput id="plan-monthly-amount" valueCents={monthlyCents} onChangeCents={setMonthlyCents} />
            </Field>
            <Field id="plan-monthly-count" label="Quantidade">
              <Input id="plan-monthly-count" inputMode="numeric" value={monthlyCount} onChange={(e) => setMonthlyCount(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field id="plan-monthly-first" label="1º vencimento">
              <Input id="plan-monthly-first" type="date" value={monthlyFirst} onChange={(e) => setMonthlyFirst(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={blockClass}>
        <legend className="sr-only">Intermediárias</legend>
        <label className={toggleClass}>
          <input type="checkbox" checked={intermediateOn} onChange={(e) => setIntermediateOn(e.target.checked)} className="size-4 accent-primary" />
          Intermediárias (balões)
        </label>
        {intermediateOn ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="plan-intermediate-amount" label="Valor">
              <MoneyInput id="plan-intermediate-amount" valueCents={intermediateCents} onChangeCents={setIntermediateCents} />
            </Field>
            <Field id="plan-intermediate-count" label="Quantidade">
              <Input
                id="plan-intermediate-count"
                inputMode="numeric"
                value={intermediateCount}
                onChange={(e) => setIntermediateCount(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field id="plan-intermediate-first" label="1º vencimento">
              <Input id="plan-intermediate-first" type="date" value={intermediateFirst} onChange={(e) => setIntermediateFirst(e.target.value)} />
            </Field>
            <Field id="plan-intermediate-every" label="Intervalo">
              <NativeSelect id="plan-intermediate-every" value={everyMonths} onChange={(e) => setEveryMonths(Number(e.target.value) as 6 | 12)}>
                <option value={6}>A cada 6 meses</option>
                <option value={12}>A cada 12 meses</option>
              </NativeSelect>
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={blockClass}>
        <legend className="sr-only">Chaves</legend>
        <label className={toggleClass}>
          <input type="checkbox" checked={keysOn} onChange={(e) => setKeysOn(e.target.checked)} className="size-4 accent-primary" />
          Parcela das chaves
        </label>
        {keysOn ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="plan-keys-amount" label="Valor">
              <MoneyInput id="plan-keys-amount" valueCents={keysCents} onChangeCents={setKeysCents} />
            </Field>
            <Field id="plan-keys-date" label="Vencimento">
              <Input id="plan-keys-date" type="date" value={keysDate} onChange={(e) => setKeysDate(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <div className="rounded-lg bg-surface-2 p-3 text-sm" aria-live="polite">
        {preview.count === 0 ? (
          <p className="text-muted-foreground">Preencha ao menos um bloco para ver a prévia.</p>
        ) : (
          <ul className="space-y-1">
            {preview.blocks.map((block) => (
              <li key={block.systemKey} className="tabular-nums">
                <span className="font-medium">{PLAN_BLOCK_LABELS[block.systemKey]}:</span> {block.count}× de{' '}
                {formatISODateBR(block.firstDate)}
                {block.count > 1 ? ` a ${formatISODateBR(block.lastDate)}` : ''} · {formatBRL(block.totalCents)}
              </li>
            ))}
            <li className="pt-1 font-semibold tabular-nums">
              Total: {preview.count} gastos · {formatBRL(preview.totalCents)}
            </li>
          </ul>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending || preview.count === 0}>
        {pending ? 'Gerando…' : 'Gerar'}
      </Button>
    </form>
  )
}

export function PlanFormButton({ propertyId, today }: { propertyId: string; today: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Gerar plano
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Gerar plano de pagamento">
        {open ? <PlanForm propertyId={propertyId} today={today} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
