import 'server-only'
import { cache } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type HouseholdRole = 'owner' | 'member'
export type CurrentHousehold = { id: string; name: string; role: HouseholdRole }
export type HouseholdMember = { userId: string; role: HouseholdRole; displayName: string | null }
export type ActiveInvite = { code: string; expiresAt: string }

/** Casa do usuário logado (no MVP, no máximo uma), ou null. */
export const getCurrentHousehold = cache(async (): Promise<CurrentHousehold | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('household_members')
    .select('role, households!inner(id, name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return { id: data.households.id, name: data.households.name, role: data.role as HouseholdRole }
})

export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  const supabase = await createClient()
  const { data: members, error } = await supabase
    .from('household_members')
    .select('user_id, role')
    .eq('household_id', householdId)
    .order('created_at')
  if (error) throw error

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .in(
      'user_id',
      members.map((member) => member.user_id),
    )
  if (profilesError) throw profilesError

  const names = new Map(profiles.map((profile) => [profile.user_id, profile.display_name]))
  return members.map((member) => ({
    userId: member.user_id,
    role: member.role as HouseholdRole,
    displayName: names.get(member.user_id) ?? null,
  }))
}

export async function getActiveInvite(householdId: string): Promise<ActiveInvite | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('household_invites')
    .select('code, expires_at')
    .eq('household_id', householdId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { code: data.code, expiresAt: data.expires_at } : null
}
