'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { todayISO } from '@/lib/dates'
import { getCurrentHousehold } from '@/lib/household'
import { hasActiveRecurrence } from '@/lib/recurrence-server'
import { ARCHIVE_BLOCKED, GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { accountSchema, type AccountOutput } from '@/lib/validation/account'
import { uuidSchema } from '@/lib/validation/common'

function toRow(input: AccountOutput) {
  return {
    name: input.name,
    institution: input.institution,
    type: input.type,
    initial_balance_cents: input.initialBalanceCents,
    initial_balance_date: input.initialBalanceDate,
    color: input.color,
  }
}

function done() {
  revalidatePath('/', 'layout')
}

export async function createAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = accountSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accounts')
    .insert({ household_id: household.id, ...toRow(parsed.data) })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateAccount(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = accountSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase.from('accounts').update(toRow(parsed.data)).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function setAccountArchived(id: unknown, archived: boolean): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  if (archived) {
    const today = todayISO()
    const [asSource, asDestination] = await Promise.all([
      hasActiveRecurrence(supabase, 'account_id', parsedId.data, today),
      hasActiveRecurrence(supabase, 'destination_account_id', parsedId.data, today),
    ])
    if (asSource === null || asDestination === null) return { ok: false, error: GENERIC_ERROR }
    if (asSource || asDestination) return { ok: false, error: ARCHIVE_BLOCKED.account }
  }
  const { data, error } = await supabase.from('accounts').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function deleteAccount(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('accounts').delete().eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
