'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createProperty, deleteProperty, updateProperty } from '@/lib/actions/properties'
import {
  AMORTIZATION_LABELS,
  AMORTIZATION_SYSTEMS,
  PROPERTY_PHASE_LABELS,
  PROPERTY_PHASES,
  type AmortizationSystem,
  type PropertyPhase,
} from '@/lib/finance/property'
import type { PropertyRecord } from '@/lib/validation/property'

type Errors = Record<string, string[] | undefined>
type Counts = { expenses: number; linked: number }

/** "9,5" → 9.5; vazio → null; texto inválido → NaN (o schema recusa). */
function parseRate(text: string): number | null {
  const value = text.trim().replace(',', '.')
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : Number.NaN
}

function PropertyForm({ property, counts, onDone }: { property?: PropertyRecord; counts?: Counts; onDone: (id: string | null) => void }) {
  const [name, setName] = useState(property?.name ?? '')
  const [developer, setDeveloper] = useState(property?.developer ?? '')
  const [unit, setUnit] = useState(property?.unit ?? '')
  const [address, setAddress] = useState(property?.address ?? '')
  const [priceCents, setPriceCents] = useState(property?.purchasePriceCents ?? 0)
  const [contractDate, setContractDate] = useState(property?.contractDate ?? '')
  const [deliveryDate, setDeliveryDate] = useState(property?.expectedDeliveryDate ?? '')
  const [phase, setPhase] = useState<PropertyPhase>(property?.phase ?? 'pre_keys')
  const [bank, setBank] = useState(property?.bank ?? '')
  const [financedCents, setFinancedCents] = useState(property?.financedAmountCents ?? 0)
  const [term, setTerm] = useState(property?.termMonths?.toString() ?? '')
  const [amortization, setAmortization] = useState<AmortizationSystem | ''>(property?.amortizationSystem ?? '')
  const [rate, setRate] = useState(property?.annualInterestRate?.toString().replace('.', ',') ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()
  const err = (field: string) => errors[field]?.[0]

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const values = {
      name,
      developer,
      unit,
      address,
      purchasePriceCents: priceCents,
      contractDate: contractDate || null,
      expectedDeliveryDate: deliveryDate || null,
      phase,
      bank,
      financedAmountCents: financedCents > 0 ? financedCents : null,
      termMonths: term.trim() ? Number(term) : null,
      amortizationSystem: amortization || null,
      annualInterestRate: parseRate(rate),
    }
    startTransition(async () => {
      if (property) {
        const result = await updateProperty(property.id, values)
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {})
          toast.error(result.error)
          return
        }
        toast.success('Imóvel atualizado.')
        onDone(property.id)
        return
      }
      const result = await createProperty(values)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success('Imóvel cadastrado.')
      onDone(result.data.id)
    })
  }

  function remove() {
    if (!property) return
    const detail = counts ? ` Isto apaga ${counts.expenses} gastos e ${counts.linked} lançamentos em Lançamentos.` : ''
    if (!window.confirm(`Excluir o imóvel "${property.name}"?${detail} Não dá para desfazer.`)) return
    startTransition(async () => {
      const result = await deleteProperty(property.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Imóvel excluído.')
      onDone(null)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-2" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="property-name" label="Empreendimento" error={err('name')}>
          <Input id="property-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={Boolean(err('name'))} />
        </Field>
        <Field id="property-developer" label="Construtora" error={err('developer')}>
          <Input id="property-developer" value={developer} onChange={(e) => setDeveloper(e.target.value)} maxLength={200} />
        </Field>
        <Field id="property-unit" label="Unidade / bloco" error={err('unit')}>
          <Input id="property-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={200} />
        </Field>
        <Field id="property-address" label="Endereço" error={err('address')}>
          <Input id="property-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
        </Field>
        <Field id="property-price" label="Valor de compra" error={err('purchasePriceCents')}>
          <MoneyInput id="property-price" valueCents={priceCents} onChangeCents={setPriceCents} aria-invalid={Boolean(err('purchasePriceCents'))} />
        </Field>
        <Field id="property-phase" label="Fase atual" error={err('phase')}>
          <NativeSelect id="property-phase" value={phase} onChange={(e) => setPhase(e.target.value as PropertyPhase)}>
            {PROPERTY_PHASES.map((value) => (
              <option key={value} value={value}>
                {PROPERTY_PHASE_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="property-contract" label="Assinatura do contrato" error={err('contractDate')}>
          <Input id="property-contract" type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
        </Field>
        <Field id="property-delivery" label="Previsão das chaves" error={err('expectedDeliveryDate')}>
          <Input id="property-delivery" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </Field>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Financiamento (opcional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="property-bank" label="Banco" error={err('bank')}>
            <Input id="property-bank" value={bank} onChange={(e) => setBank(e.target.value)} maxLength={80} />
          </Field>
          <Field id="property-financed" label="Valor financiado" error={err('financedAmountCents')}>
            <MoneyInput id="property-financed" valueCents={financedCents} onChangeCents={setFinancedCents} />
          </Field>
          <Field id="property-term" label="Prazo (meses)" error={err('termMonths')}>
            <Input id="property-term" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))} aria-invalid={Boolean(err('termMonths'))} />
          </Field>
          <Field id="property-amortization" label="Sistema de amortização" error={err('amortizationSystem')}>
            <NativeSelect id="property-amortization" value={amortization} onChange={(e) => setAmortization(e.target.value as AmortizationSystem | '')}>
              <option value="">Não informado</option>
              {AMORTIZATION_SYSTEMS.map((value) => (
                <option key={value} value={value}>
                  {AMORTIZATION_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="property-rate" label="Juros (% ao ano)" error={err('annualInterestRate')}>
            <Input id="property-rate" inputMode="decimal" placeholder="9,5" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={Boolean(err('annualInterestRate'))} />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        {property ? (
          <Button type="button" variant="outline" className="text-expense" disabled={pending} onClick={remove}>
            Excluir imóvel
          </Button>
        ) : null}
      </div>
    </form>
  )
}

type PropertyFormButtonProps = {
  label: string
  property?: PropertyRecord
  counts?: Counts
  variant?: 'default' | 'outline' | 'ghost'
}

/** Botão que abre o cadastro (novo) ou a edição do imóvel. */
export function PropertyFormButton({ label, property, counts, variant = 'outline' }: PropertyFormButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={property ? 'Editar imóvel' : 'Novo imóvel'}>
        {open ? (
          <PropertyForm
            property={property}
            counts={counts}
            onDone={(id) => {
              setOpen(false)
              if (id === null) router.push('/imovel')
              else if (!property) router.push(`/imovel?imovel=${id}`)
            }}
          />
        ) : null}
      </ResponsiveModal>
    </>
  )
}
