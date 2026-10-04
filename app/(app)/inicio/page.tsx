import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Início' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Início" basePath="/inicio" searchParams={searchParams} />
}
