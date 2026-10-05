import { Building2, LogOut, Tags } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { DisplayNameForm } from '@/components/profile/display-name-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/lib/actions/auth'
import { getCurrentUser } from '@/lib/auth'
import { getActiveInvite, getCurrentHousehold, getHouseholdMembers } from '@/lib/household'
import { getMyProfile } from '@/lib/profile'
import { MAX_HOUSEHOLD_MEMBERS } from '@/lib/validation/household'
import { HouseholdNameForm } from './household-name-form'
import { InviteCard } from './invite-card'
import { MembersList } from './members-list'

export const metadata: Metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  const [user, household] = await Promise.all([getCurrentUser(), getCurrentHousehold()])
  if (!user || !household) redirect('/bem-vindo')

  const [members, invite, profile] = await Promise.all([
    getHouseholdMembers(household.id),
    getActiveInvite(household.id),
    getMyProfile(),
  ])
  const canInvite = members.length < MAX_HOUSEHOLD_MEMBERS

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Casa</CardTitle>
          </CardHeader>
          <CardContent>
            <HouseholdNameForm defaultValue={household.name} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seu perfil</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <DisplayNameForm defaultValue={profile?.display_name ?? ''} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Membros</CardTitle>
            <CardDescription>
              {members.length} de {MAX_HOUSEHOLD_MEMBERS}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MembersList members={members} currentUserId={user.id} />
          </CardContent>
        </Card>

        {canInvite ? (
          <Card>
            <CardHeader>
              <CardTitle>Convidar</CardTitle>
            </CardHeader>
            <CardContent>
              <InviteCard invite={invite} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Categorias</CardTitle>
            <CardDescription>Receitas e despesas, com subcategorias, ícones e cores.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/configuracoes/categorias">
                <Tags className="size-4" aria-hidden />
                Gerenciar categorias
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tipos de gasto do imóvel</CardTitle>
            <CardDescription>Sinal, parcelas, ITBI, cartório e os demais tipos usados no Imóvel.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/configuracoes/tipos-de-gasto">
                <Building2 className="size-4" aria-hidden />
                Gerenciar tipos
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessão</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                <LogOut className="size-4" aria-hidden />
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
