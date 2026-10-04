'use server'

import { redirect } from 'next/navigation'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validation/auth'

export async function signIn(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, error: translateError(error) }

  return { ok: true, data: null }
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
