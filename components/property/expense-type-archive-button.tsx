'use client'

import { Archive, ArchiveRestore } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { setExpenseTypeArchived } from '@/lib/actions/property-types'

export function ExpenseTypeArchiveButton({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const [pending, startTransition] = useTransition()
  function toggle() {
    startTransition(async () => {
      const result = await setExpenseTypeArchived(id, !archived)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(archived ? 'Tipo reativado.' : 'Tipo arquivado.')
    })
  }
  return (
    <Button variant="ghost" size="icon" onClick={toggle} disabled={pending} aria-label={archived ? `Reativar ${name}` : `Arquivar ${name}`}>
      {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
    </Button>
  )
}
