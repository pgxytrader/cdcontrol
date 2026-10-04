'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ALL_NAV, isActive } from './nav-items'
import { QuickAddButton } from './quick-add'

/** Menu lateral fixo do desktop (≥ 1024px). */
export function Sidebar({ householdName }: { householdName: string }) {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 lg:flex">
      <div>
        <p className="text-lg font-semibold">CD</p>
        <p className="truncate text-sm text-muted-foreground">{householdName}</p>
      </div>
      <QuickAddButton />
      <nav aria-label="Navegação principal">
        <ul className="space-y-1">
          {ALL_NAV.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-surface-2 font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
