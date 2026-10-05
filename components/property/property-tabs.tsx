import Link from 'next/link'
import { PROPERTY_TAB_LABELS, PROPERTY_TABS, propertyHref, type PropertyQuery } from '@/lib/property-filters'
import { cn } from '@/lib/utils'

export function PropertyTabs({ query }: { query: PropertyQuery }) {
  return (
    <nav aria-label="Seções do imóvel" className="mb-4 flex flex-wrap gap-1">
      {PROPERTY_TABS.map((tab) => {
        const active = tab === query.tab
        return (
          <Link
            key={tab}
            href={propertyHref(query, { tab })}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-surface-2',
            )}
          >
            {PROPERTY_TAB_LABELS[tab]}
          </Link>
        )
      })}
    </nav>
  )
}
