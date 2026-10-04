import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Contas' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Contas" basePath="/contas" searchParams={searchParams} />
}
