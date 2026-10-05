'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { deleteLinkedTransaction } from '@/lib/actions/property-expenses'
import { formatISODateBR } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import type { TransactionRow } from '@/lib/transaction-mappers'

type PropertyTransactionModalProps = {
  row: TransactionRow | null
  sourceLabel: string
  categoryName: string | undefined
  onClose: () => void
}

/** Lançamento ligado a um gasto do Imóvel: só leitura; edição pelo Imóvel; excluir volta o gasto para previsto. */
export function PropertyTransactionModal({ row, sourceLabel, categoryName, onClose }: PropertyTransactionModalProps) {
  const [pending, startTransition] = useTransition()

  function remove() {
    if (!row) return
    if (!window.confirm('Excluir este lançamento? Isto volta o gasto do imóvel para previsto.')) return
    startTransition(async () => {
      const result = await deleteLinkedTransaction(row.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Lançamento excluído. O gasto do imóvel voltou para previsto.')
      onClose()
    })
  }

  return (
    <ResponsiveModal
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Lançamento do Imóvel"
    >
      {row ? (
        <div className="space-y-4 pb-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="col-span-2 min-w-0">
              <dt className="text-xs text-muted-foreground">Descrição</dt>
              <dd className="break-words">{row.description}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Valor</dt>
              <dd className="tabular-nums">{formatBRL(row.amount_cents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Data</dt>
              <dd>{formatISODateBR(row.date)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Pago com</dt>
              <dd className="break-words">{sourceLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Categoria</dt>
              <dd className="break-words">{categoryName ?? '—'}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">Este lançamento vem de um gasto do Imóvel. Valor, data, conta e categoria mudam pelo Imóvel.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild>
              <Link href={`/imovel/lancamento/${row.id}`} onClick={onClose}>
                Editar no Imóvel
              </Link>
            </Button>
            <Button variant="outline" className="text-expense" onClick={remove} disabled={pending}>
              Excluir
            </Button>
          </div>
        </div>
      ) : null}
    </ResponsiveModal>
  )
}
