'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { getCurrentHousehold } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { inputToRow } from '@/lib/transaction-mappers'
import { uuidSchema } from '@/lib/validation/common'
import { transactionSchema } from '@/lib/validation/transaction'
import {
  deletionSnapshotSchema,
  TRANSACTION_RECORD_COLUMNS,
  type DeletionSnapshot,
  type TransactionRecord,
} from '@/lib/validation/transaction-record'

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
  await supabase.from('profiles').update({ last_account_id: parsed.data.accountId, last_credit_card_id: null }).eq('user_id', user.id)

  done()
  return { ok: true, data: { id: data.id } }
}

/** Atualiza um lançamento em conta (também converte uma compra à vista no cartão em lançamento em conta). */
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
    .is('installment_plan_id', null)
    // Pagamento de fatura só muda por updateInvoicePayment
    .neq('type', 'invoice_payment')
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

/** Exclui um lançamento sem plano (conta, cartão à vista, estorno ou pagamento de fatura). Parcelas: deleteInstallments. */
export async function deleteTransaction(id: unknown): Promise<ActionResult<DeletionSnapshot>> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', parsedId.data)
    .is('installment_plan_id', null)
    .select(TRANSACTION_RECORD_COLUMNS)
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: { plan: null, rows: data as TransactionRecord[] } }
}

/** "Desfazer": recria o plano (se veio) e as linhas com os mesmos ids. */
export async function restoreTransactions(snapshot: unknown): Promise<ActionResult> {
  const parsed = deletionSnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_transactions', {
    p_plan: parsed.data.plan ? { ...parsed.data.plan, household_id: household.id } : null,
    p_rows: parsed.data.rows.map((row) => ({ ...row, household_id: household.id })),
  })
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: null }
}
