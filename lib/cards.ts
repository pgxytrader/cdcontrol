import 'server-only'
import { todayISO } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import { cardUsage, type CardUsage } from '@/lib/finance/card'
import { cycleForDate } from '@/lib/finance/invoice'
import type { CardSchedule, InvoiceCycle } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'
import type { CardBrand, CardOption } from '@/lib/validation/card'

export type InvoiceTotals = {
  invoiceId: string
  creditCardId: string
  cycle: InvoiceCycle
  chargesCents: number
  creditsCents: number
  totalCents: number
  paidCents: number
}

export type Card = CardOption & {
  brand: CardBrand
  lastFour: string | null
  limitCents: number
  defaultPaymentAccountId: string | null
}

export type CardWithUsage = Card & { usage: CardUsage; currentCycle: InvoiceCycle; currentTotalCents: number }

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const CARD_COLUMNS = 'id, name, brand, last_four, limit_cents, closing_day, due_day, default_payment_account_id, color, archived'

type CardRow = {
  id: string
  name: string
  brand: string
  last_four: string | null
  limit_cents: number
  closing_day: number
  due_day: number
  default_payment_account_id: string | null
  color: string
  archived: boolean
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand as CardBrand,
    lastFour: row.last_four,
    limitCents: row.limit_cents,
    closingDay: row.closing_day,
    dueDay: row.due_day,
    defaultPaymentAccountId: row.default_payment_account_id,
    color: row.color,
    archived: row.archived,
  }
}

export function toSchedule(card: { closingDay: number; dueDay: number }): CardSchedule {
  return { closingDay: card.closingDay, dueDay: card.dueDay }
}

async function loadInvoiceTotals(supabase: SupabaseServer, cardId?: string): Promise<InvoiceTotals[]> {
  const rows = await fetchAllPages((from, to) => {
    let query = supabase
      .from('v_invoice_totals')
      .select('invoice_id, credit_card_id, closing_month, closing_date, due_date, reference_month, charges_cents, credits_cents, total_cents, paid_cents')
    if (cardId) query = query.eq('credit_card_id', cardId)
    return query.order('closing_month').order('invoice_id').range(from, to)
  })
  return rows.map((row) => ({
    invoiceId: row.invoice_id as string,
    creditCardId: row.credit_card_id as string,
    cycle: {
      closingMonth: row.closing_month as string,
      closingDate: row.closing_date as string,
      dueDate: row.due_date as string,
      referenceMonth: row.reference_month as string,
    },
    chargesCents: Number(row.charges_cents ?? 0),
    creditsCents: Number(row.credits_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    paidCents: Number(row.paid_cents ?? 0),
  }))
}

/** Uso do limite e a fatura do ciclo atual (vazia se ainda não existe). */
function withUsage(card: Card, invoices: InvoiceTotals[], today: string): CardWithUsage {
  const mine = invoices.filter((invoice) => invoice.creditCardId === card.id)
  const computed = cycleForDate(toSchedule(card), today)
  const current = mine.find((invoice) => invoice.cycle.closingMonth === computed.closingMonth)
  return {
    ...card,
    usage: cardUsage(card.limitCents, mine),
    currentCycle: current?.cycle ?? computed,
    currentTotalCents: current?.totalCents ?? 0,
  }
}

export async function listCards({ includeArchived = false }: { includeArchived?: boolean } = {}): Promise<CardWithUsage[]> {
  const supabase = await createClient()
  let query = supabase.from('credit_cards').select(CARD_COLUMNS).order('name')
  if (!includeArchived) query = query.eq('archived', false)
  const [{ data, error }, invoices] = await Promise.all([query, loadInvoiceTotals(supabase)])
  if (error) throw error
  const today = todayISO()
  return data.map((row) => withUsage(toCard(row), invoices, today))
}

export async function getCard(id: string): Promise<{ card: CardWithUsage; invoices: InvoiceTotals[] } | null> {
  const supabase = await createClient()
  const [{ data, error }, invoices] = await Promise.all([
    supabase.from('credit_cards').select(CARD_COLUMNS).eq('id', id).maybeSingle(),
    loadInvoiceTotals(supabase, id),
  ])
  if (error) throw error
  if (!data) return null
  return { card: withUsage(toCard(data), invoices, todayISO()), invoices }
}

/** Cartões para o formulário rápido e filtros (inclui arquivados, para edição de lançamentos antigos). */
export async function listCardOptions(): Promise<CardOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('credit_cards').select('id, name, color, archived, closing_day, due_day').order('name')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    archived: row.archived,
    closingDay: row.closing_day,
    dueDay: row.due_day,
  }))
}
