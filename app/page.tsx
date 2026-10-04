import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">CD — Controle de Danos</h1>
      <p className="text-muted-foreground">Tema escuro carregado.</p>
      <p className="tabular-nums">
        <span className="text-income">+ R$ 1.000,00</span> · <span className="text-expense">− R$ 250,00</span>
      </p>
      <Button>Botão primário</Button>
    </main>
  )
}
