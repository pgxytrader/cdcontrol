'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
      <p className="mb-4 text-muted-foreground">Não foi possível carregar esta tela.</p>
      <Button onClick={() => retry()}>Tentar de novo</Button>
    </div>
  )
}
