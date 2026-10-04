'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const TITLE = 'Novo lançamento'
const DESCRIPTION = 'O formulário de lançamento chega na próxima fase. Em breve!'

/** Botão "+" central da barra inferior (celular): abre um bottom sheet. */
export function QuickAddSheetButton() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon" className="size-12 rounded-full shadow-lg" aria-label={TITLE}>
          <Plus className="size-6" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{TITLE}</SheetTitle>
          <SheetDescription>{DESCRIPTION}</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}

/** Botão "Novo lançamento" do menu lateral (desktop): abre um modal. */
export function QuickAddDialogButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Plus className="size-4" aria-hidden />
          {TITLE}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
