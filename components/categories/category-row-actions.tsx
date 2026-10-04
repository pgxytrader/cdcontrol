'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteCategory, setCategoryArchived } from '@/lib/actions/categories'

export function CategoryRowActions({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggleArchive() {
    startTransition(async () => {
      const result = await setCategoryArchived(id, !archived)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(archived ? 'Categoria reativada.' : 'Categoria arquivada.')
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm(`Excluir a categoria "${name}"? Só é possível se ela não tiver lançamentos nem subcategorias.`)) return
    startTransition(async () => {
      const result = await deleteCategory(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Categoria excluída.')
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={toggleArchive} disabled={pending} aria-label={archived ? `Reativar ${name}` : `Arquivar ${name}`}>
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      </Button>
      <Button variant="ghost" size="icon" onClick={remove} disabled={pending} aria-label={`Excluir ${name}`} className="text-expense">
        <Trash2 aria-hidden />
      </Button>
    </>
  )
}
