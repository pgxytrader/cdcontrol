import type { Metadata } from 'next'
import Link from 'next/link'
import { CardFormButton } from '@/components/cards/card-form'
import { UsageBar } from '@/components/cards/usage-bar'
import { PageHeader } from '@/components/layout/page-header'
import { listCards } from '@/lib/cards'
import { formatISODateBR } from '@/lib/dates'
import { cardUsage } from '@/lib/finance/card'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { cardSubtitle } from '@/lib/validation/card'

export const metadata: Metadata = { title: 'Cartões' }

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ arquivados?: string }> }) {
  const { arquivados } = await searchParams
  const showArchived = arquivados === '1'
  const cards = await listCards({ includeArchived: showArchived })
  const active = cards.filter((card) => !card.archived)
  const limitCents = active.reduce((sum, card) => sum + card.limitCents, 0)
  // Mesma conta de cardUsage, somando os cartões ativos
  const total = cardUsage(limitCents, active.map((card) => ({ totalCents: card.usage.usedCents, paidCents: 0 })))

  return (
    <>
      <PageHeader title="Cartões" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-64 flex-1 space-y-2 sm:max-w-md">
          <p className="text-sm text-muted-foreground">Limite total de {formatBRL(limitCents)}</p>
          <p className="text-3xl font-semibold tabular-nums">{formatBRL(total.usedCents)}</p>
          <UsageBar usage={total} />
        </div>
        <CardFormButton label="Novo cartão" />
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          Cadastre seu primeiro cartão para lançar compras e acompanhar as faturas.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id}>
              <Link
                href={`/cartoes/${card.id}`}
                className={cn(
                  'block space-y-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2',
                  card.archived && 'opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: card.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{card.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{cardSubtitle(card)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">Fatura atual</p>
                    <p className="font-medium tabular-nums">{formatBRL(card.currentTotalCents)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fecha {formatISODateBR(card.currentCycle.closingDate)} · vence {formatISODateBR(card.currentCycle.dueDate)}
                </p>
                <UsageBar usage={card.usage} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm">
        <Link href={showArchived ? '/cartoes' : '/cartoes?arquivados=1'} className="text-muted-foreground underline underline-offset-4">
          {showArchived ? 'Ocultar arquivados' : 'Mostrar arquivados'}
        </Link>
      </p>
    </>
  )
}
