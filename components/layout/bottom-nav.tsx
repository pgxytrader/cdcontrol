'use client'

import { Ellipsis } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { isActive, MORE_NAV, NAV, type NavItem } from './nav-items'
import { QuickAddSheetButton } from './quick-add'

function itemClass(active: boolean) {
  return cn(
    'flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] transition-colors',
    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
  )
}

function BottomNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
      <item.icon className="size-5" aria-hidden />
      <span>{item.label}</span>
    </Link>
  )
}

function MoreSheet({ pathname }: { pathname: string }) {
  const active = MORE_NAV.some((item) => isActive(pathname, item.href))
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className={itemClass(active)}>
          <Ellipsis className="size-5" aria-hidden />
          <span>Mais</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>Mais</SheetTitle>
          <SheetDescription className="sr-only">Outras telas do app</SheetDescription>
        </SheetHeader>
        <ul className="grid grid-cols-3 gap-2 px-4">
          {MORE_NAV.map((item) => {
            const itemActive = isActive(pathname, item.href)
            return (
              <li key={item.href}>
                <SheetClose asChild>
                  <Link
                    href={item.href}
                    aria-current={itemActive ? 'page' : undefined}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg p-3 text-center text-xs transition-colors',
                      itemActive ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:bg-surface-2',
                    )}
                  >
                    <item.icon className="size-6" aria-hidden />
                    {item.label}
                  </Link>
                </SheetClose>
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}

/** Barra inferior fixa do celular (< 1024px). */
export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
        <li>
          <BottomNavLink item={NAV.inicio} pathname={pathname} />
        </li>
        <li>
          <BottomNavLink item={NAV.lancamentos} pathname={pathname} />
        </li>
        <li className="flex items-center justify-center">
          <QuickAddSheetButton />
        </li>
        <li>
          <BottomNavLink item={NAV.cartoes} pathname={pathname} />
        </li>
        <li>
          <MoreSheet pathname={pathname} />
        </li>
      </ul>
    </nav>
  )
}
