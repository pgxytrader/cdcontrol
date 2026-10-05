import { cn } from '@/lib/utils'

type LegendItem = { id?: string; label: string; color: string; faded?: boolean; line?: boolean }

/** Legenda em texto (também é a alternativa acessível às cores do gráfico). */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.id ?? item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn('inline-block shrink-0', item.line ? 'h-0.5 w-3' : 'size-2.5 rounded-sm', item.faded && 'opacity-40')}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
