'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { displayNameSchema } from '@/lib/validation/household'

export async function updateDisplayName(input: unknown): Promise<ActionResult> {
  const parsed = displayNameSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: translateError({ message: 'NOT_AUTHENTICATED' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data.displayName })
    .eq('user_id', user.id)
    .select('user_id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}
