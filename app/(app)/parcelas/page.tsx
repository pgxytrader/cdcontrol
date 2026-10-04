import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Parcelas' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Parcelas" basePath="/parcelas" searchParams={searchParams} />
}
