import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Orçamento' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Orçamento" basePath="/orcamento" searchParams={searchParams} />
}
