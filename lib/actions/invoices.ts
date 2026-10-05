'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { todayISO } from '@/lib/dates'
import { defaultStatus } from '@/lib/finance/status'
import { getCurrentHousehold } from '@/lib/household'
import { paymentDescription } from '@/lib/invoice-labels'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import { invoicePaymentSchema } from '@/lib/validation/invoice-payment'

function done() {
  revalidatePath('/', 'layout')
}

/** Pagamento total ou parcial da fatura a partir de uma conta: sai do saldo, mas não é despesa (PRD 8.5). */
export async function payInvoice(invoiceId: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsedId = uuidSchema.safeParse(invoiceId)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = invoicePaymentSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data: invoice, error: invoiceError } = await supabase
    .from('card_invoices')
    .select('id, credit_card_id, reference_month, credit_cards(name)')
    .eq('id', parsedId.data)
    .maybeSingle()
  if (invoiceError) return { ok: false, error: translateError(invoiceError) }
  if (!invoice) return { ok: false, error: GENERIC_ERROR }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      household_id: household.id,
      type: 'invoice_payment',
      description: paymentDescription(invoice.credit_cards?.name ?? 'cartão', invoice.reference_month),
      amount_cents: parsed.data.amountCents,
      date: parsed.data.date,
      status: defaultStatus(parsed.data.date, todayISO()),
      account_id: parsed.data.accountId,
      credit_card_id: invoice.credit_card_id,
      invoice_id: invoice.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateInvoicePayment(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = invoicePaymentSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .update({
      account_id: parsed.data.accountId,
      amount_cents: parsed.data.amountCents,
      date: parsed.data.date,
      status: defaultStatus(parsed.data.date, todayISO()),
    })
    .eq('id', parsedId.data)
    .eq('type', 'invoice_payment')
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
