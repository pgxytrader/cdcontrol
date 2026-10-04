'use client'

import Link from 'next/link'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import type { TransactionFormValues } from '@/lib/validation/transaction'
import { useTransactionFormData } from './form-data-context'
import { TransactionForm } from './transaction-form'

type TransactionModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionId?: string
  initial?: TransactionFormValues
}

export function TransactionModal({ open, onOpenChange, transactionId, initial }: TransactionModalProps) {
  const data = useTransactionFormData()
  const hasAccounts = data.accounts.some((account) => !account.archived)

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={transactionId ? 'Editar lançamento' : 'Novo lançamento'}>
      {!open ? null : hasAccounts || transactionId ? (
        <TransactionForm key={transactionId ?? 'new'} transactionId={transactionId} initial={initial} onDone={() => onOpenChange(false)} />
      ) : (
        <div className="space-y-4 pb-2 text-center">
          <p className="text-muted-foreground">Cadastre sua primeira conta para começar a lançar.</p>
          <Button asChild className="w-full">
            <Link href="/contas" onClick={() => onOpenChange(false)}>
              Ir para Contas
            </Link>
          </Button>
        </div>
      )}
    </ResponsiveModal>
  )
}
