import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Imóvel' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Imóvel" basePath="/imovel" searchParams={searchParams} />
}
