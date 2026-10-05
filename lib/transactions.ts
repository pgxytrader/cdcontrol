import 'server-only'
import { monthBounds, type YearMonth } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'
import { escapeLike, statusFilter } from '@/lib/transaction-filters'
import { TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'

/** Todos os lançamentos que envolvem a conta (origem ou destino), em ordem cronológica. `accountId` já validado como uuid. */
export async function listAccountTransactions(accountId: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  // Paginado: o PostgREST devolve no máximo 1000 linhas por resposta
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .or(`account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
      .order('date')
      .order('created_at')
      .order('id')
      .range(from, to),
  )
  return rows as TransactionRow[]
}

export const SEARCH_LIMIT = 200

export type TransactionQueryFilters = {
  type?: TransactionType
  categoryIds?: string[]
  accountId?: string
  cardId?: string
  status?: TransactionStatus
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/** Filtros já validados (uuid/enum) por parseTransactionsQuery. `today` define o status das compras no cartão. */
function filteredQuery(supabase: SupabaseServer, filters: TransactionQueryFilters, today: string) {
  let query = supabase.from('transactions').select(TRANSACTION_COLUMNS)
  if (filters.type) query = query.eq('type', filters.type)
  if (filters.cardId) query = query.eq('credit_card_id', filters.cardId)
  if (filters.categoryIds) query = query.in('category_id', filters.categoryIds)
  if (filters.accountId) {
    query = query.or(`account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`)
    // Com filtro de conta só vêm linhas com conta: vale o status salvo
    if (filters.status) query = query.eq('status', filters.status)
  } else if (filters.status) {
    query = query.or(statusFilter(filters.status, today))
  }
  return query
}

export async function listMonthTransactions(ym: YearMonth, filters: TransactionQueryFilters, today: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { start, end } = monthBounds(ym)
  const rows = await fetchAllPages((from, to) =>
    filteredQuery(supabase, filters, today)
      .gte('date', start)
      .lt('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  return rows as TransactionRow[]
}

/** Busca por descrição em todo o histórico (texto literal, sem curingas). */
export async function searchTransactions(q: string, filters: TransactionQueryFilters, today: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { data, error } = await filteredQuery(supabase, filters, today)
    .ilike('description', `%${escapeLike(q)}%`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(SEARCH_LIMIT)
  if (error) throw error
  return data as TransactionRow[]
}

/** Lançamentos de uma fatura (compras, parcelas, estornos e pagamentos), em ordem cronológica. */
export async function listInvoiceTransactions(invoiceId: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('invoice_id', invoiceId)
      .order('date')
      .order('created_at')
      .order('id')
      .range(from, to),
  )
  return rows as TransactionRow[]
}
