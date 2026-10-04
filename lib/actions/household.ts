'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentHousehold, type ActiveInvite } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { householdNameSchema, inviteCodeSchema } from '@/lib/validation/household'

export async function createHousehold(input: unknown): Promise<ActionResult> {
  const parsed = householdNameSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_household', { p_name: parsed.data.name })
  if (error) return { ok: false, error: translateError(error) }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

export async function joinHousehold(input: unknown): Promise<ActionResult> {
  const parsed = inviteCodeSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.rpc('redeem_invite', { p_code: parsed.data.code })
  if (error) return { ok: false, error: translateError(error) }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

export async function renameHousehold(input: unknown): Promise<ActionResult> {
  const parsed = householdNameSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('households')
    .update({ name: parsed.data.name })
    .eq('id', household.id)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

export async function createInvite(): Promise<ActionResult<ActiveInvite>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_invite')
  if (error) return { ok: false, error: translateError(error) }

  const row = data?.[0]
  if (!row) return { ok: false, error: GENERIC_ERROR }

  revalidatePath('/configuracoes')
  return { ok: true, data: { code: row.code, expiresAt: row.expires_at } }
}
