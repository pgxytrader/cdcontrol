'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { TransactionModal } from '@/components/transactions/transaction-modal'
import { Button } from '@/components/ui/button'

const TITLE = 'Novo lançamento'

/** Botão "+" central da barra inferior (celular). */
export function QuickAddFab() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="icon" className="size-12 rounded-full shadow-lg" aria-label={TITLE} onClick={() => setOpen(true)}>
        <Plus className="size-6" aria-hidden />
      </Button>
      <TransactionModal open={open} onOpenChange={setOpen} />
    </>
  )
}

/** Botão "Novo lançamento" do menu lateral (desktop). */
export function QuickAddButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {TITLE}
      </Button>
      <TransactionModal open={open} onOpenChange={setOpen} />
    </>
  )
}
