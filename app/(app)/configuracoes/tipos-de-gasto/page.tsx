import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { ExpenseTypeArchiveButton } from '@/components/property/expense-type-archive-button'
import { ExpenseTypeFormButton } from '@/components/property/expense-type-form'
import { TYPICAL_PHASE_LABELS, type ExpenseType } from '@/lib/finance/property'
import { listExpenseTypes } from '@/lib/property'

export const metadata: Metadata = { title: 'Tipos de gasto do imóvel' }

function TypeRow({ type }: { type: ExpenseType }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate">{type.name}</span>
        <span className="block text-xs text-muted-foreground">
          {TYPICAL_PHASE_LABELS[type.typicalPhase]}
          {type.isDefault ? ' · padrão' : ''}
        </span>
      </span>
      <ExpenseTypeFormButton type={type} />
      <ExpenseTypeArchiveButton id={type.id} name={type.name} archived={type.archived} />
    </li>
  )
}

export default async function ExpenseTypesPage() {
  const types = await listExpenseTypes()
  const active = types.filter((type) => !type.archived)
  const archived = types.filter((type) => type.archived)

  return (
    <>
      <div className="mb-2">
        <Link href="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ Configurações
        </Link>
      </div>
      <PageHeader title="Tipos de gasto do imóvel" />
      <div className="mb-4">
        <ExpenseTypeFormButton />
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
        {active.map((type) => (
          <TypeRow key={type.id} type={type} />
        ))}
      </ul>
      {archived.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground">Arquivados ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface px-4">
            {archived.map((type) => (
              <TypeRow key={type.id} type={type} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}
