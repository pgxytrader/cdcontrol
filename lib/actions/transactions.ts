'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { getCurrentHousehold } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { inputToRow, rowToInput, TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'
import { uuidSchema } from '@/lib/validation/common'
import { transactionSchema, transactionSnapshotSchema, type TransactionSnapshot } from '@/lib/validation/transaction'

function done() {
  revalidatePath('/', 'layout')
}

export async function createTransaction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const [user, household] = await Promise.all([getCurrentUser(), getCurrentHousehold()])
  if (!user || !household) return { ok: false, error: translateError({ message: 'NOT_AUTHENTICATED' }) }

  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').insert(inputToRow(parsed.data, household.id)).select('id').single()
  if (error) return { ok: false, error: translateError(error) }

  // Lembra a conta usada por quem lançou (falha aqui não desfaz o lançamento)
  await supabase.from('profiles').update({ last_account_id: parsed.data.accountId }).eq('user_id', user.id)

  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateTransaction(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .update(inputToRow(parsed.data, household.id))
    .eq('id', parsedId.data)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function deleteTransaction(id: unknown): Promise<ActionResult<TransactionSnapshot>> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').delete().eq('id', parsedId.data).select(TRANSACTION_COLUMNS)
  if (error) return { ok: false, error: translateError(error) }
  const row = (data as TransactionRow[])[0]
  if (!row) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: { id: row.id, input: rowToInput(row) } }
}

export async function restoreTransaction(snapshot: unknown): Promise<ActionResult> {
  const parsed = transactionSnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { error } = await supabase
    .from('transactions')
    .insert({ id: parsed.data.id, ...inputToRow(parsed.data.input, household.id) })
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: null }
}
