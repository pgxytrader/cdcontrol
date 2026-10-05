'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { ensureInvoiceArgs, purchaseRpcArgs } from '@/lib/card-rpc'
import { todayISO } from '@/lib/dates'
import { buildCardPurchase } from '@/lib/finance/installments'
import { cycleForDate } from '@/lib/finance/invoice'
import { defaultStatus } from '@/lib/finance/status'
import type { CardSchedule } from '@/lib/finance/types'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import { cardTransactionSchema, INSTALLMENT_SCOPES, installmentEditSchema, toCardPurchaseInput } from '@/lib/validation/transaction'
import {
  PLAN_RECORD_COLUMNS,
  TRANSACTION_RECORD_COLUMNS,
  type DeletionSnapshot,
  type PlanRecord,
  type TransactionRecord,
} from '@/lib/validation/transaction-record'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const scopeSchema = z.enum(INSTALLMENT_SCOPES)

function done() {
  revalidatePath('/', 'layout')
}

async function loadSchedule(supabase: SupabaseServer, cardId: string): Promise<CardSchedule | null> {
  const { data } = await supabase.from('credit_cards').select('closing_day, due_day').eq('id', cardId).maybeSingle()
  return data ? { closingDay: data.closing_day, dueDay: data.due_day } : null
}

async function loadInstallment(supabase: SupabaseServer, id: string) {
  const { data } = await supabase.from('transactions').select('installment_plan_id, installment_number').eq('id', id).maybeSingle()
  if (!data?.installment_plan_id || data.installment_number === null) return null
  return { planId: data.installment_plan_id, number: data.installment_number }
}

/** Compra à vista, parcelada, em andamento ou estorno no cartão — tudo numa transação (create_card_purchase). */
export async function createCardTransaction(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = cardTransactionSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: translateError({ message: 'NOT_AUTHENTICATED' }) }

  const supabase = await createClient()
  const schedule = await loadSchedule(supabase, parsed.data.creditCardId)
  if (!schedule) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }

  const purchase = buildCardPurchase(schedule, toCardPurchaseInput(parsed.data))
  const fields = {
    type: parsed.data.type,
    description: parsed.data.description,
    categoryId: parsed.data.categoryId,
    notes: parsed.data.notes,
  }
  const { data, error } = await supabase.rpc('create_card_purchase', purchaseRpcArgs(parsed.data.creditCardId, purchase, fields, todayISO()))
  if (error) return { ok: false, error: translateError(error) }

  // Lembra o cartão usado por quem lançou (falha aqui não desfaz a compra)
  await supabase.from('profiles').update({ last_credit_card_id: parsed.data.creditCardId, last_account_id: null }).eq('user_id', user.id)

  done()
  return { ok: true, data: { ids: data ?? [] } }
}

/** Edição completa de um lançamento no cartão sem parcelas (inclui trocar de cartão ou vir de uma conta). */
export async function updateCardTransaction(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = cardTransactionSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  if (parsed.data.installmentsCount !== 1 || parsed.data.currentInstallment !== null) {
    return { ok: false, error: 'Para parcelar, exclua e lance de novo.' }
  }

  const supabase = await createClient()
  if (await loadInstallment(supabase, parsedId.data)) return { ok: false, error: GENERIC_ERROR }
  const schedule = await loadSchedule(supabase, parsed.data.creditCardId)
  if (!schedule) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }

  const cycle = cycleForDate(schedule, parsed.data.date)
  const { data: invoiceId, error: invoiceError } = await supabase.rpc('ensure_invoice', ensureInvoiceArgs(parsed.data.creditCardId, cycle))
  if (invoiceError) return { ok: false, error: translateError(invoiceError) }

  const { data, error } = await supabase
    .from('transactions')
    .update({
      type: parsed.data.type,
      description: parsed.data.description,
      amount_cents: parsed.data.amountCents,
      date: parsed.data.date,
      status: defaultStatus(parsed.data.date, todayISO()),
      category_id: parsed.data.categoryId,
      notes: parsed.data.notes,
      account_id: null,
      destination_account_id: null,
      credit_card_id: parsed.data.creditCardId,
      invoice_id: invoiceId,
    })
    .eq('id', parsedId.data)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

/** Descrição, categoria e observação desta parcela ou desta e das futuras (spec: decisão "A"). */
export async function updateInstallments(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = installmentEditSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const installment = await loadInstallment(supabase, parsedId.data)
  if (!installment) return { ok: false, error: GENERIC_ERROR }

  const fields = { description: parsed.data.description, category_id: parsed.data.categoryId, notes: parsed.data.notes }
  const base = supabase.from('transactions').update(fields).eq('installment_plan_id', installment.planId)
  const query = parsed.data.scope === 'one' ? base.eq('id', parsedId.data) : base.gte('installment_number', installment.number)
  const { error } = await query.select('id')
  if (error) return { ok: false, error: translateError(error) }

  if (parsed.data.scope === 'future') {
    const { error: planError } = await supabase
      .from('installment_plans')
      .update({ description: parsed.data.description, category_id: parsed.data.categoryId })
      .eq('id', installment.planId)
    if (planError) return { ok: false, error: translateError(planError) }
  }

  done()
  return { ok: true, data: null }
}

/** Exclui esta parcela ou esta e as futuras; o plano vai junto se ficar vazio. Devolve o snapshot do "Desfazer". */
export async function deleteInstallments(id: unknown, scope: unknown): Promise<ActionResult<DeletionSnapshot>> {
  const parsedId = uuidSchema.safeParse(id)
  const parsedScope = scopeSchema.safeParse(scope)
  if (!parsedId.success || !parsedScope.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const installment = await loadInstallment(supabase, parsedId.data)
  if (!installment) return { ok: false, error: GENERIC_ERROR }

  const { data: plan, error: planError } = await supabase
    .from('installment_plans')
    .select(PLAN_RECORD_COLUMNS)
    .eq('id', installment.planId)
    .single()
  if (planError) return { ok: false, error: translateError(planError) }

  const base = supabase.from('transactions').delete().eq('installment_plan_id', installment.planId)
  const query = parsedScope.data === 'one' ? base.eq('id', parsedId.data) : base.gte('installment_number', installment.number)
  const { data: rows, error } = await query.select(TRANSACTION_RECORD_COLUMNS)
  if (error) return { ok: false, error: translateError(error) }
  if (rows.length === 0) return { ok: false, error: GENERIC_ERROR }

  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('installment_plan_id', installment.planId)
  let removedPlan: PlanRecord | null = null
  if (count === 0) {
    const { error: removeError } = await supabase.from('installment_plans').delete().eq('id', installment.planId)
    if (!removeError) removedPlan = plan as PlanRecord
  }

  done()
  return { ok: true, data: { plan: removedPlan, rows: rows as TransactionRecord[] } }
}
