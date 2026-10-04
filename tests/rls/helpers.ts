import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type TestUser = { id: string; client: SupabaseClient }

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Defina ${name} em .env.test.local`)
  return value
}

/** Usuários e casas de teste, com limpeza no fim. O cliente admin nunca é usado pelo app. */
export function createTestContext() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const publishableKey = requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(url, serviceKey, noSession)
  const userIds: string[] = []
  const householdIds: string[] = []

  async function newUser(label: string): Promise<TestUser> {
    const email = `rls-${label}-${crypto.randomUUID()}@example.com`
    const password = `Senha-${crypto.randomUUID()}`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    userIds.push(data.user.id)
    const client = createClient(url, publishableKey, noSession)
    const { error: signInError } = await client.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
    return { id: data.user.id, client }
  }

  async function createHousehold(user: TestUser, name: string): Promise<string> {
    const { data, error } = await user.client.rpc('create_household', { p_name: name })
    if (error) throw error
    householdIds.push(data as string)
    return data as string
  }

  async function cleanup() {
    if (householdIds.length > 0) await admin.from('households').delete().in('id', householdIds)
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  }

  return { url, publishableKey, noSession, admin, newUser, createHousehold, cleanup }
}
