'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { translateError } from '@/lib/supabase/errors'
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
