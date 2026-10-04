import { resolveYearMonth } from '@/lib/dates'
import { PageHeader } from './page-header'

type PlaceholderPageProps = {
  title: string
  basePath: string
  searchParams: Promise<{ mes?: string | string[] }>
}

/** Tela da Fase 1: título, seletor de mês e aviso de "em breve". */
export async function PlaceholderPage({ title, basePath, searchParams }: PlaceholderPageProps) {
  const { mes } = await searchParams
  return (
    <>
      <PageHeader title={title} ym={resolveYearMonth(mes)} basePath={basePath} />
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
        Disponível em breve.
      </div>
    </>
  )
}
