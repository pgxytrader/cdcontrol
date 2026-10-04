'use client'

import { Copy, RefreshCw } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createInvite } from '@/lib/actions/household'
import { formatDateBR } from '@/lib/dates'
import type { ActiveInvite } from '@/lib/household'

export function InviteCard({ invite }: { invite: ActiveInvite | null }) {
  const [current, setCurrent] = useState(invite)
  const [pending, startTransition] = useTransition()

  function generate() {
    startTransition(async () => {
      const result = await createInvite()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCurrent(result.data)
      toast.success('Código gerado.')
    })
  }

  async function copy() {
    if (!current) return
    try {
      await navigator.clipboard.writeText(current.code)
      toast.success('Código copiado.')
    } catch {
      toast.error('Não foi possível copiar. Copie o código manualmente.')
    }
  }

  if (!current) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Gere um código e envie para seu par. Ele vale por 7 dias e pode ser usado uma vez.
        </p>
        <Button onClick={generate} disabled={pending}>
          {pending ? 'Gerando…' : 'Gerar código'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p
        className="font-mono text-3xl font-semibold tracking-[0.3em]"
        aria-label={`Código ${current.code.split('').join(' ')}`}
      >
        {current.code}
      </p>
      <p className="text-sm text-muted-foreground">Válido até {formatDateBR(current.expiresAt)}.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>
          <Copy className="size-4" aria-hidden />
          Copiar
        </Button>
        <Button variant="outline" onClick={generate} disabled={pending}>
          <RefreshCw className="size-4" aria-hidden />
          {pending ? 'Gerando…' : 'Gerar novo código'}
        </Button>
      </div>
    </div>
  )
}
