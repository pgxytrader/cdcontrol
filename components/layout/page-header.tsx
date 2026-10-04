import type { YearMonth } from '@/lib/dates'
import { MonthSelector } from './month-selector'

type PageHeaderProps = { title: string; ym?: YearMonth; basePath?: string }

export function PageHeader({ title, ym, basePath }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {ym && basePath ? <MonthSelector ym={ym} basePath={basePath} /> : null}
    </header>
  )
}
