import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Relatórios' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Relatórios" basePath="/relatorios" searchParams={searchParams} />
}
