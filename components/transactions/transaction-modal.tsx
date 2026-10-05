'use client'

import Link from 'next/link'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import type { InstallmentInfo } from '@/lib/transaction-mappers'
import type { TransactionFormValues } from '@/lib/validation/transaction'
import { useTransactionFormData } from './form-data-context'
import { TransactionForm } from './transaction-form'

type TransactionModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionId?: string
  initial?: TransactionFormValues
  installment?: InstallmentInfo
}

export function TransactionModal({ open, onOpenChange, transactionId, initial, installment }: TransactionModalProps) {
  const data = useTransactionFormData()
  const hasSources = data.accounts.some((account) => !account.archived) || data.cards.some((card) => !card.archived)
  const title = installment ? 'Editar parcela' : transactionId ? 'Editar lançamento' : 'Novo lançamento'

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title}>
      {!open ? null : hasSources || transactionId ? (
        <TransactionForm
          key={transactionId ?? 'new'}
          transactionId={transactionId}
          initial={initial}
          installment={installment}
          onDone={() => onOpenChange(false)}
        />
      ) : (
        <div className="space-y-4 pb-2 text-center">
          <p className="text-muted-foreground">Cadastre sua primeira conta ou cartão para começar a lançar.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild>
              <Link href="/contas" onClick={() => onOpenChange(false)}>
                Ir para Contas
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cartoes" onClick={() => onOpenChange(false)}>
                Ir para Cartões
              </Link>
            </Button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  )
}
