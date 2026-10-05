import 'server-only'
import { currentYearMonth, monthBounds } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import type { InstallmentEntry } from '@/lib/finance/installments-view'
import { createClient } from '@/lib/supabase/server'
import { TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'

export type UpcomingInstallment = InstallmentEntry & { row: TransactionRow }

/** Parcelas cujas faturas vencem do mês atual em diante (todos os cartões ou um). `cardId` já validado como uuid. */
export async function listUpcomingInstallments({ cardId }: { cardId?: string } = {}): Promise<UpcomingInstallment[]> {
  const supabase = await createClient()
  const { start } = monthBounds(currentYearMonth())
  let invoiceQuery = supabase.from('card_invoices').select('id, reference_month').gte('reference_month', start)
  if (cardId) invoiceQuery = invoiceQuery.eq('credit_card_id', cardId)
  const { data: invoices, error } = await invoiceQuery
  if (error) throw error
  if (invoices.length === 0) return []

  const referenceOf = new Map(invoices.map((invoice) => [invoice.id, invoice.reference_month]))
  const rows = (await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .in('invoice_id', [...referenceOf.keys()])
      .not('installment_plan_id', 'is', null)
      .order('id')
      .range(from, to),
  )) as TransactionRow[]

  return rows.map((row) => ({
    id: row.id,
    planId: row.installment_plan_id as string,
    cardId: row.credit_card_id as string,
    description: row.description,
    amountCents: row.amount_cents,
    installmentNumber: row.installment_number as number,
    installmentsCount: row.installment_plans?.installments_count ?? (row.installment_number as number),
    referenceMonth: referenceOf.get(row.invoice_id as string) as string,
    row,
  }))
}
