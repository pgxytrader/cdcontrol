'use client'

import { useState } from 'react'
import { CategoryIcon } from '@/components/categories/category-icon'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import type { BudgetLine } from '@/lib/finance/budget'
import { formatBRL } from '@/lib/finance/money'
import { BudgetBar, LevelBadge } from './budget-bar'
import { BudgetForm } from './budget-form'

type Totals = { budgetedCents: number; realizedCents: number; plannedCents: number }

function Summary({ totals }: { totals: Totals }) {
  const items = [
    { label: 'Orçado', value: totals.budgetedCents },
    { label: 'Realizado', value: totals.realizedCents },
    { label: 'Previsto', value: totals.plannedCents },
  ]
  return (
    <dl className="mb-6 grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="truncate text-right font-semibold tabular-nums sm:text-lg">{formatBRL(item.value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function detailText(line: BudgetLine): string {
  const { realizedCents, plannedCents } = line.spending
  if (line.limitCents === null) return `${formatBRL(realizedCents + plannedCents)} no mês`
  const planned = plannedCents > 0 ? ` + ${formatBRL(plannedCents)} previstos` : ''
  return `${formatBRL(realizedCents)} gastos${planned} de ${formatBRL(line.limitCents)}`
}

export function BudgetList({ lines, totals, month }: { lines: BudgetLine[]; totals: Totals; month: string }) {
  const [editing, setEditing] = useState<BudgetLine | null>(null)

  return (
    <>
      <Summary totals={totals} />
      {lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          Nenhuma categoria de despesa ativa. Crie uma em Configurações → Categorias.
        </div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {lines.map((line) => (
            <li key={line.categoryId}>
              <button
                type="button"
                onClick={() => setEditing(line)}
                className="w-full space-y-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center gap-3">
                  <CategoryIcon name={line.icon} color={line.color} />
                  <span className="min-w-0 flex-1 truncate font-medium">{line.name}</span>
                  <LevelBadge line={line} />
                  {line.progress ? (
                    <span className="shrink-0 text-sm tabular-nums">{Math.round(line.progress.ratio * 100)}%</span>
                  ) : (
                    <span className="shrink-0 text-sm text-primary">Definir limite</span>
                  )}
                </span>
                {line.progress ? <BudgetBar progress={line.progress} label={`Orçamento de ${line.name}`} /> : null}
                <span className="block text-xs text-muted-foreground tabular-nums">{detailText(line)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveModal
        open={editing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditing(null)
        }}
        title={editing?.limitCents === null ? 'Definir limite' : 'Editar limite'}
      >
        {editing ? <BudgetForm key={editing.categoryId} line={editing} month={month} onDone={() => setEditing(null)} /> : null}
      </ResponsiveModal>
    </>
  )
}
