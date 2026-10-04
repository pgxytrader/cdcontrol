import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Defina ${name} em .env.test.local`)
  return value
}

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const publishableKey = requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

// Cliente administrativo: só para criar e limpar dados de teste. Nunca usado pelo app.
const admin = createClient(url, serviceKey, noSession)

type TestUser = { id: string; client: SupabaseClient }

const createdUserIds: string[] = []
const createdHouseholdIds: string[] = []

async function newUser(label: string): Promise<TestUser> {
  const email = `rls-${label}-${crypto.randomUUID()}@example.com`
  const password = `Senha-${crypto.randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  createdUserIds.push(data.user.id)

  const client = createClient(url, publishableKey, noSession)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, client }
}

async function createHousehold(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.client.rpc('create_household', { p_name: name })
  if (error) throw error
  createdHouseholdIds.push(data as string)
  return data as string
}

async function createInvite(user: TestUser): Promise<string> {
  const { data, error } = await user.client.rpc('create_invite')
  if (error) throw error
  return (data as { code: string }[])[0].code
}

describe('casa compartilhada: RLS e convites', () => {
  let a: TestUser // dono da casa A
  let b: TestUser // entra na casa A pelo convite
  let c: TestUser // dono da casa C
  let d: TestUser // sem casa
  let householdA: string
  let codeA: string

  beforeAll(async () => {
    ;[a, b, c, d] = await Promise.all([newUser('a'), newUser('b'), newUser('c'), newUser('d')])
  })

  afterAll(async () => {
    if (createdHouseholdIds.length > 0) {
      await admin.from('households').delete().in('id', createdHouseholdIds)
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id)
    }
  })

  it('cria o perfil automaticamente para novos usuários', async () => {
    const { data, error } = await a.client.from('profiles').select('user_id, display_name').eq('user_id', a.id)
    expect(error).toBeNull()
    expect(data).toEqual([{ user_id: a.id, display_name: null }])
  })

  it('A cria a casa e gera um convite válido', async () => {
    householdA = await createHousehold(a, 'Casa RLS A')
    codeA = await createInvite(a)
    expect(codeA).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)

    const { data } = await a.client.from('household_members').select('user_id, role').eq('household_id', householdA)
    expect(data).toEqual([{ user_id: a.id, role: 'owner' }])
  })

  it('B, de fora da casa, não lê nada da casa de A', async () => {
    const households = await b.client.from('households').select('id').eq('id', householdA)
    const members = await b.client.from('household_members').select('user_id').eq('household_id', householdA)
    const invites = await b.client.from('household_invites').select('code').eq('household_id', householdA)
    const profiles = await b.client.from('profiles').select('user_id').eq('user_id', a.id)

    for (const result of [households, members, invites, profiles]) {
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    }
  })

  it('B não consegue se inserir na casa nem renomeá-la diretamente', async () => {
    const insert = await b.client
      .from('household_members')
      .insert({ household_id: householdA, user_id: b.id, role: 'member' })
    expect(insert.error).not.toBeNull()

    await b.client.from('households').update({ name: 'Invadida' }).eq('id', householdA)
    const { data } = await admin.from('households').select('name').eq('id', householdA).single()
    expect(data?.name).toBe('Casa RLS A')
  })

  it('B resgata o código digitado em minúsculas e com espaço e passa a ver a casa', async () => {
    const messy = ` ${codeA.slice(0, 3).toLowerCase()} ${codeA.slice(3).toLowerCase()} `
    const { data, error } = await b.client.rpc('redeem_invite', { p_code: messy })
    expect(error).toBeNull()
    expect(data).toBe(householdA)

    const households = await b.client.from('households').select('id, name').eq('id', householdA)
    expect(households.data).toEqual([{ id: householdA, name: 'Casa RLS A' }])

    const members = await b.client.from('household_members').select('user_id').eq('household_id', householdA)
    expect(members.data).toHaveLength(2)

    const profiles = await b.client.from('profiles').select('user_id').eq('user_id', a.id)
    expect(profiles.data).toHaveLength(1)
  })

  it('um código já usado não funciona de novo', async () => {
    const { error } = await d.client.rpc('redeem_invite', { p_code: codeA })
    expect(error?.message).toBe('INVITE_USED')
  })

  it('casa cheia não gera novo convite', async () => {
    const { error } = await a.client.rpc('create_invite')
    expect(error?.message).toBe('HOUSEHOLD_FULL')
  })

  it('membro não altera o perfil do outro nem troca o próprio user_id', async () => {
    await b.client.from('profiles').update({ display_name: 'Invasor' }).eq('user_id', a.id)
    const { data } = await admin.from('profiles').select('display_name').eq('user_id', a.id).single()
    expect(data?.display_name).toBeNull()

    const swap = await b.client.from('profiles').update({ user_id: a.id }).eq('user_id', b.id)
    expect(swap.error).not.toBeNull()
  })

  it('membro só edita o nome da casa, não o created_by', async () => {
    const { error } = await a.client.from('households').update({ created_by: b.id }).eq('id', householdA)
    expect(error).not.toBeNull()
  })

  it('membro não escreve diretamente em convites', async () => {
    const insert = await a.client
      .from('household_invites')
      .insert({ household_id: householdA, code: 'ABCDEF', expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    expect(insert.error).not.toBeNull()

    const update = await a.client.from('household_invites').update({ used_at: null }).eq('household_id', householdA)
    expect(update.error).not.toBeNull()
  })

  it('anônimo não lê nenhuma tabela', async () => {
    const anon = createClient(url, publishableKey, noSession)
    for (const table of ['households', 'household_members', 'household_invites', 'profiles']) {
      const { data } = await anon.from(table).select('*')
      expect(data ?? []).toEqual([])
    }
  })

  it('quem já tem casa não cria outra nem entra em outra', async () => {
    await createHousehold(c, 'Casa RLS C')

    const again = await c.client.rpc('create_household', { p_name: 'Outra casa' })
    expect(again.error?.message).toBe('ALREADY_MEMBER')

    const codeC = await createInvite(c)
    const join = await b.client.rpc('redeem_invite', { p_code: codeC })
    expect(join.error?.message).toBe('ALREADY_MEMBER')
  })

  it('gerar um novo convite invalida o anterior', async () => {
    const first = await createInvite(c)
    await createInvite(c)
    const { error } = await d.client.rpc('redeem_invite', { p_code: first })
    expect(error?.message).toBe('INVITE_EXPIRED')
  })

  it('código expirado é recusado', async () => {
    const code = await createInvite(c)
    await admin
      .from('household_invites')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('code', code)
    const { error } = await d.client.rpc('redeem_invite', { p_code: code })
    expect(error?.message).toBe('INVITE_EXPIRED')
  })

  it('código inexistente é recusado', async () => {
    const { error } = await d.client.rpc('redeem_invite', { p_code: '222222' })
    expect(error?.message).toBe('INVITE_NOT_FOUND')
  })

  it('nome de casa vazio é recusado pelo banco', async () => {
    const { error } = await d.client.rpc('create_household', { p_name: '   ' })
    expect(error?.message).toBe('INVALID_NAME')
  })

  it('o cadastro público está desligado', async () => {
    const anon = createClient(url, publishableKey, noSession)
    const { data, error } = await anon.auth.signUp({
      email: `rls-signup-${crypto.randomUUID()}@example.com`,
      password: 'Senha-forte-12345',
    })
    if (data.user) createdUserIds.push(data.user.id)
    expect(error).not.toBeNull()
  })
})
