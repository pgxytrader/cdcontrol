import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentHousehold } from '@/lib/household'
import { getMyProfile } from '@/lib/profile'
import { WelcomeFlow } from './welcome-flow'

export const metadata: Metadata = { title: 'Bem-vindo' }

export default async function WelcomePage() {
  if (await getCurrentHousehold()) redirect('/inicio')
  const profile = await getMyProfile()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Bem-vindo ao CD</h1>
        <p className="text-muted-foreground">Vamos configurar a casa de vocês.</p>
      </div>
      <WelcomeFlow initialName={profile?.display_name ?? null} />
    </main>
  )
}
