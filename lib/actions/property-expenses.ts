// lib/actions/property-expenses.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { loadCardContext } from '@/lib/card-context'
import { todayISO } from '@/lib/dates'
import { paymentTransaction, propertyTransactionDescription, type PaymentTarget, type PaymentTransaction } from '@/lib/finance/property-payment'
import { buildPaymentPlan } from '@/lib/finance/property-plan'
import { getCurrentHousehold } from '@/lib/household'
import { expenseRows, payArgs } from '@/lib/property-rpc'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import {
  EXPENSE_RECORD_COLUMNS,
  expenseSchema,
  paymentSchema,
  planSchema,
  propertySnapshotSchema,
  type ExpenseRecord,
  type PropertySnapshot,
} from '@/lib/validation/property'
import { TRANSACTION_RECORD_COLUMNS, type TransactionRecord } from '@/lib/validation/transaction-record'

function done() {
  revalidatePath('/', 'layout')
}

const fail = (message: string) => ({ ok: false as const, error: translateError({ message }) })

export async function createExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const { propertyId, ...row } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_property_expenses', { p_property_id: propertyId, p_rows: expenseRows([row]) })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: { id: (data as string[])[0] } }
}

/** Edita os dados do gasto. Num gasto pago a fonte não muda aqui (muda em "Editar pagamento"); a descrição do lançamento ligado acompanha. */
export async function updateExpense(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from('property_expenses')
    .select('status, transaction_id')
    .eq('id', parsedId.data)
    .maybeSingle()
  if (readError) return { ok: false, error: translateError(readError) }
  if (!current) return fail('INVALID_EXPENSE')

  const { error } = await supabase
    .from('property_expenses')
    .update({
      expense_type_id: parsed.data.expenseTypeId,
      description: parsed.data.description,
      payee: parsed.data.payee,
      planned_amount_cents: parsed.data.plannedAmountCents,
      due_date: parsed.data.dueDate,
      notes: parsed.data.notes,
      ...(current.status === 'paid' ? {} : { funding_source: parsed.data.fundingSource }),
    })
    .eq('id', parsedId.data)
  if (error) return { ok: false, error: translateError(error) }

  if (current.transaction_id) {
    const { error: txError } = await supabase
      .from('transactions')
      .update({ description: propertyTransactionDescription(parsed.data.description) })
      .eq('id', current.transaction_id)
    if (txError) return { ok: false, error: translateError(txError) }
  }
  done()
  return { ok: true, data: null }
}

/** Cria os gastos previstos do plano numa transação; devolve os ids para o "Desfazer". */
export async function generatePlan(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const { propertyId, ...plan } = parsed.data

  const supabase = await createClient()
  const { data: types, error: typesError } = await supabase
    .from('property_expense_types')
    .select('id, system_key')
    .in('system_key', ['monthly', 'intermediate', 'keys'])
  if (typesError) return { ok: false, error: translateError(typesError) }
  const typeOf = new Map(types.map((type) => [type.system_key as string, type.id]))

  const rows = buildPaymentPlan(plan)
  if (rows.some((row) => !typeOf.has(row.systemKey))) return fail('INVALID_EXPENSE_TYPE')
  const { data, error } = await supabase.rpc('create_property_expenses', {
    p_property_id: propertyId,
    p_rows: expenseRows(
      rows.map((row) => ({
        expenseTypeId: typeOf.get(row.systemKey) as string,
        description: row.description,
        payee: null,
        plannedAmountCents: row.plannedAmountCents,
        dueDate: row.dueDate,
        fundingSource: row.fundingSource,
        notes: null,
      })),
    ),
  })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: { ids: data as string[] } }
}

/** Pagar ou editar o pagamento. Recursos próprios com "Lançar" cria/atualiza o lançamento ligado; senão, apaga o que houver. */
export async function payExpense(input: unknown): Promise<ActionResult<{ transactionId: string | null }>> {
  const parsed = paymentSchema(todayISO()).safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const payment = parsed.data

  const user = await getCurrentUser()
  if (!user) return fail('NOT_AUTHENTICATED')

  const supabase = await createClient()
  const { data: expense, error: readError } = await supabase
    .from('property_expenses')
    .select('description')
    .eq('id', payment.expenseId)
    .maybeSingle()
  if (readError) return { ok: false, error: translateError(readError) }
  if (!expense) return fail('INVALID_EXPENSE')

  let tx: PaymentTransaction | null = null
  if (payment.launch && payment.source && payment.categoryId) {
    let target: PaymentTarget
    if (payment.source.kind === 'account') {
      target = { kind: 'account', accountId: payment.source.id }
    } else {
      const card = await loadCardContext(supabase, payment.source.id)
      if (!card) return fail('INVALID_CARD')
      target = { kind: 'card', creditCardId: payment.source.id, schedule: card.schedule, stored: card.stored }
    }
    tx = paymentTransaction(
      { description: expense.description, paidAmountCents: payment.paidAmountCents, paidDate: payment.paidDate, categoryId: payment.categoryId },
      target,
    )
  }

  const { data, error } = await supabase.rpc('pay_property_expense', payArgs(payment.expenseId, payment, tx))
  if (error) return { ok: false, error: translateError(error) }

  if (tx && payment.source) {
    await supabase
      .from('profiles')
      .update(
        payment.source.kind === 'account'
          ? { last_account_id: payment.source.id, last_credit_card_id: null }
          : { last_credit_card_id: payment.source.id, last_account_id: null },
      )
      .eq('user_id', user.id)
  }
  done()
  return { ok: true, data: { transactionId: (data as string | null) ?? null } }
}

export async function unpayExpense(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const supabase = await createClient()
  const { error } = await supabase.rpc('unpay_property_expense', { p_expense_id: parsedId.data })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: null }
}

const idsSchema = z.array(uuidSchema).min(1).max(500)

/** Exclui gastos (e os lançamentos ligados) e devolve o que precisa para o "Desfazer". */
export async function deleteExpenses(ids: unknown): Promise<ActionResult<PropertySnapshot>> {
  const parsed = idsSchema.safeParse(ids)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data: expenses, error } = await supabase.from('property_expenses').select(EXPENSE_RECORD_COLUMNS).in('id', parsed.data)
  if (error) return { ok: false, error: translateError(error) }
  if (expenses.length === 0) return fail('INVALID_EXPENSE')

  const txIds = expenses.map((row) => row.transaction_id).filter((value): value is string => Boolean(value))
  let transactions: TransactionRecord[] = []
  if (txIds.length > 0) {
    const { data, error: txError } = await supabase.from('transactions').select(TRANSACTION_RECORD_COLUMNS).in('id', txIds)
    if (txError) return { ok: false, error: translateError(txError) }
    transactions = data as TransactionRecord[]
  }

  const { error: rpcError } = await supabase.rpc('delete_property_expenses', { p_ids: parsed.data })
  if (rpcError) return { ok: false, error: translateError(rpcError) }
  done()
  return { ok: true, data: { expenses: expenses as ExpenseRecord[], transactions } }
}

export async function restoreExpenses(snapshot: unknown): Promise<ActionResult> {
  const parsed = propertySnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }
  const household = await getCurrentHousehold()
  if (!household) return fail('NO_HOUSEHOLD')

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_property_expenses', {
    p_expenses: parsed.data.expenses.map((row) => ({ ...row, household_id: household.id })),
    p_transactions: parsed.data.transactions.map((row) => ({ ...row, household_id: household.id })),
  })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: null }
}

/** Exclui o lançamento ligado (por Lançamentos); o trigger volta o gasto para previsto. Sem Desfazer. */
export async function deleteLinkedTransaction(transactionId: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(transactionId)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').delete().eq('id', parsedId.data).eq('source', 'property').select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }
  done()
  return { ok: true, data: null }
}
