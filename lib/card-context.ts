import 'server-only'
import type { CardContext } from '@/lib/finance/recurrence'
import type { CardSchedule, InvoiceCycle } from '@/lib/finance/types'
import type { createClient } from '@/lib/supabase/server'

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export async function loadSchedule(supabase: SupabaseServer, cardId: string): Promise<CardSchedule | null> {
  const { data } = await supabase.from('credit_cards').select('closing_day, due_day').eq('id', cardId).maybeSingle()
  return data ? { closingDay: data.closing_day, dueDay: data.due_day } : null
}

/** Faturas já salvas do cartão: o fechamento salvo vence o calculado (resolveCycleForDate). */
export async function loadStoredCycles(supabase: SupabaseServer, cardId: string): Promise<InvoiceCycle[] | null> {
  const { data, error } = await supabase
    .from('card_invoices')
    .select('closing_month, closing_date, due_date, reference_month')
    .eq('credit_card_id', cardId)
  if (error) return null
  return data.map((row) => ({
    closingMonth: row.closing_month,
    closingDate: row.closing_date,
    dueDate: row.due_date,
    referenceMonth: row.reference_month,
  }))
}

/** Dias do cartão e faturas salvas, para gerar ocorrências no cartão. Null se o cartão não existe ou a leitura falhou. */
export async function loadCardContext(supabase: SupabaseServer, cardId: string): Promise<CardContext | null> {
  const [schedule, stored] = await Promise.all([loadSchedule(supabase, cardId), loadStoredCycles(supabase, cardId)])
  return schedule && stored ? { schedule, stored } : null
}
