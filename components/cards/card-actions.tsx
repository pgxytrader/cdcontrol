'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteCard, setCardArchived } from '@/lib/actions/cards'
import type { CardFormInput } from '@/lib/validation/card'
import { CardFormButton } from './card-form'

type CardActionsProps = { id: string; archived: boolean; initial: CardFormInput }

export function CardActions({ id, archived, initial }: CardActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggleArchive() {
    startTransition(async () => {
      const result = await setCardArchived(id, !archived)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(archived ? 'Cartão reativado.' : 'Cartão arquivado.')
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm('Excluir este cartão? Só é possível se ele não tiver lançamentos.')) return
    startTransition(async () => {
      const result = await deleteCard(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Cartão excluído.')
      router.push('/cartoes')
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <CardFormButton cardId={id} initial={initial} label="Editar" variant="outline" />
      <Button variant="outline" onClick={toggleArchive} disabled={pending}>
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {archived ? 'Desarquivar' : 'Arquivar'}
      </Button>
      <Button variant="outline" onClick={remove} disabled={pending} className="text-expense">
        <Trash2 aria-hidden />
        Excluir
      </Button>
    </div>
  )
}
