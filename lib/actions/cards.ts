'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { scheduleRpcArgs } from '@/lib/card-rpc'
import { todayISO } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import { rescheduleCard } from '@/lib/finance/card'
import type { CardSchedule } from '@/lib/finance/types'
import { getCurrentHousehold } from '@/lib/household'
import { hasActiveRecurrence } from '@/lib/recurrence-server'
import { ARCHIVE_BLOCKED, CARD_IN_USE, GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { cardSchema, type CardOutput } from '@/lib/validation/card'
import { uuidSchema } from '@/lib/validation/common'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

function toRow(input: CardOutput) {
  return {
    name: input.name,
    brand: input.brand,
    last_four: input.lastFour,
    limit_cents: input.limitCents,
    closing_day: input.closingDay,
    due_day: input.dueDay,
    default_payment_account_id: input.defaultPaymentAccountId,
    color: input.color,
  }
}

function done() {
  revalidatePath('/', 'layout')
}

export async function createCard(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = cardSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('credit_cards')
    .insert({ household_id: household.id, ...toRow(parsed.data) })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: { id: data.id } }
}

/** Faturas abertas e seus lançamentos → rescheduleCard → apply_card_schedule (lança em caso de erro). */
async function applySchedule(supabase: SupabaseServer, cardId: string, schedule: CardSchedule): Promise<void> {
  const today = todayISO()
  const { data: invoices, error } = await supabase
    .from('card_invoices')
    .select('id, closing_month, closing_date')
    .eq('credit_card_id', cardId)
  if (error) throw error

  const openIds = invoices.filter((invoice) => today < invoice.closing_date).map((invoice) => invoice.id)
  const transactions =
    openIds.length === 0
      ? []
      : await fetchAllPages((from, to) =>
          supabase
            .from('transactions')
            .select('id, invoice_id, date, installment_plan_id, installment_number')
            .in('invoice_id', openIds)
            .in('type', ['income', 'expense'])
            .order('id')
            .range(from, to),
        )

  const planIds = [...new Set(transactions.map((tx) => tx.installment_plan_id).filter((id): id is string => id !== null))]
  let plans: { id: string; purchase_date: string; first_installment_number: number; first_closing_month: string }[] = []
  if (planIds.length > 0) {
    const result = await supabase
      .from('installment_plans')
      .select('id, purchase_date, first_installment_number, first_closing_month')
      .in('id', planIds)
    if (result.error) throw result.error
    plans = result.data
  }

  const change = rescheduleCard(
    schedule,
    invoices.map((invoice) => ({ id: invoice.id, closingMonth: invoice.closing_month, closingDate: invoice.closing_date })),
    transactions.map((tx) => ({
      id: tx.id,
      invoiceId: tx.invoice_id as string,
      date: tx.date,
      installmentPlanId: tx.installment_plan_id,
      installmentNumber: tx.installment_number,
    })),
    plans.map((plan) => ({
      id: plan.id,
      purchaseDate: plan.purchase_date,
      firstInstallmentNumber: plan.first_installment_number,
      firstClosingMonth: plan.first_closing_month,
    })),
    today,
  )
  const { error: rpcError } = await supabase.rpc('apply_card_schedule', scheduleRpcArgs(cardId, schedule, change))
  if (rpcError) throw rpcError
}

export async function updateCard(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = cardSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data: current, error: currentError } = await supabase
    .from('credit_cards')
    .select('closing_day, due_day')
    .eq('id', parsedId.data)
    .maybeSingle()
  if (currentError) return { ok: false, error: translateError(currentError) }
  if (!current) return { ok: false, error: GENERIC_ERROR }

  // Os dias só mudam por apply_card_schedule, junto com as faturas abertas
  const { closing_day: closingDay, due_day: dueDay, ...rest } = toRow(parsed.data)
  const { error } = await supabase.from('credit_cards').update(rest).eq('id', parsedId.data)
  if (error) return { ok: false, error: translateError(error) }

  if (closingDay !== current.closing_day || dueDay !== current.due_day) {
    try {
      await applySchedule(supabase, parsedId.data, { closingDay, dueDay })
    } catch (scheduleError) {
      return { ok: false, error: translateError(scheduleError as { code?: string; message?: string }) }
    }
  }

  done()
  return { ok: true, data: null }
}

export async function setCardArchived(id: unknown, archived: boolean): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  if (archived) {
    const active = await hasActiveRecurrence(supabase, 'credit_card_id', parsedId.data, todayISO())
    if (active === null) return { ok: false, error: GENERIC_ERROR }
    if (active) return { ok: false, error: ARCHIVE_BLOCKED.card }
  }
  const { data, error } = await supabase.from('credit_cards').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function deleteCard(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('credit_cards').delete().eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: error.code === '23503' ? CARD_IN_USE : translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
