import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Lançamentos' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Lançamentos" basePath="/lancamentos" searchParams={searchParams} />
}
