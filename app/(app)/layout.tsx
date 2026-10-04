import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Sidebar } from '@/components/layout/sidebar'
import { getCurrentHousehold } from '@/lib/household'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const household = await getCurrentHousehold()
  if (!household) redirect('/bem-vindo')

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar householdName={household.name} />
      <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-10">
        <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 lg:px-8 lg:pt-8">{children}</div>
      </main>
      <BottomNav />
    </div>
  )
}
