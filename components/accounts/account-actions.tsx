'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteAccount, setAccountArchived } from '@/lib/actions/accounts'
import type { AccountFormInput } from '@/lib/validation/account'
import { AccountFormButton } from './account-form'

type AccountActionsProps = { id: string; archived: boolean; initial: AccountFormInput }

export function AccountActions({ id, archived, initial }: AccountActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggleArchive() {
    startTransition(async () => {
      const result = await setAccountArchived(id, !archived)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(archived ? 'Conta reativada.' : 'Conta arquivada.')
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm('Excluir esta conta? Só é possível se ela não tiver lançamentos.')) return
    startTransition(async () => {
      const result = await deleteAccount(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Conta excluída.')
      router.push('/contas')
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <AccountFormButton accountId={id} initial={initial} label="Editar" variant="outline" />
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
