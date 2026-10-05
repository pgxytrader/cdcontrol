import 'server-only'
import type { ActionResult } from '@/lib/action-result'
import { loadCardContext, type SupabaseServer } from '@/lib/card-context'
import { fetchAllPages } from '@/lib/fetch-all'
import { createSeries, type CardContext, type Series, type SeriesState, type SeriesTransaction } from '@/lib/finance/recurrence'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { createRecurrenceArgs } from '@/lib/recurrence-rpc'
import { translateError } from '@/lib/supabase/errors'
import { RECURRENCE_RECORD_COLUMNS, type RecurrenceRecord } from '@/lib/validation/transaction-record'

export function rowToSeries(record: RecurrenceRecord): SeriesState {
  return {
    id: record.id,
    type: record.type,
    description: record.description,
    amountCents: record.amount_cents,
    categoryId: record.category_id,
    accountId: record.account_id,
    destinationAccountId: record.destination_account_id,
    creditCardId: record.credit_card_id,
    notes: record.notes,
    frequency: record.frequency,
    startDate: record.start_date,
    endDate: record.end_date,
    generatedUntil: record.generated_until,
  }
}

export async function loadSeries(supabase: SupabaseServer, id: string): Promise<{ state: SeriesState; record: RecurrenceRecord } | null> {
  const { data, error } = await supabase.from('recurrences').select(RECURRENCE_RECORD_COLUMNS).eq('id', id).maybeSingle()
  if (error || !data) return null
  const record = data as RecurrenceRecord
  return { state: rowToSeries(record), record }
}

type SeriesTransactionRow = {
  id: string
  occurrence_date: string | null
  type: string
  status: string
  date: string
  account_id: string | null
}

const toSeriesTransaction = (row: SeriesTransactionRow): SeriesTransaction => ({
  id: row.id,
  occurrenceDate: row.occurrence_date ?? row.date,
  type: row.type as TransactionType,
  status: row.status as TransactionStatus,
  date: row.date,
  accountId: row.account_id,
})

const SERIES_TRANSACTION_COLUMNS = 'id, occurrence_date, type, status, date, account_id'

/** Todos os lançamentos da série (paginado). Null se a leitura falhar. */
export async function loadSeriesTransactions(supabase: SupabaseServer, recurrenceId: string): Promise<SeriesTransaction[] | null> {
  try {
    const rows = await fetchAllPages((from, to) =>
      supabase.from('transactions').select(SERIES_TRANSACTION_COLUMNS).eq('recurrence_id', recurrenceId).order('id').range(from, to),
    )
    return (rows as SeriesTransactionRow[]).map(toSeriesTransaction)
  } catch (error) {
    console.error('loadSeriesTransactions', error)
    return null
  }
}

/** O lançamento aberto e a série dele; null se não for de uma série. */
export async function loadOccurrence(
  supabase: SupabaseServer,
  transactionId: string,
): Promise<{ recurrenceId: string; occurrence: SeriesTransaction } | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select(`recurrence_id, ${SERIES_TRANSACTION_COLUMNS}`)
    .eq('id', transactionId)
    .maybeSingle()
  if (error || !data?.recurrence_id) return null
  return { recurrenceId: data.recurrence_id, occurrence: toSeriesTransaction(data as SeriesTransactionRow) }
}

/** Contexto do cartão dos valores novos: null em conta; falha se o cartão não existe. */
export async function cardContextFor(
  supabase: SupabaseServer,
  creditCardId: string | null,
): Promise<{ ok: true; card: CardContext | null } | { ok: false }> {
  if (creditCardId === null) return { ok: true, card: null }
  const card = await loadCardContext(supabase, creditCardId)
  return card ? { ok: true, card } : { ok: false }
}

/** Série nova + primeira ocorrência + as seguintes até o horizonte, numa transação (create_recurrence). */
export async function insertSeries(
  supabase: SupabaseServer,
  householdId: string,
  series: Series,
  firstStatus: TransactionStatus,
  today: string,
): Promise<ActionResult<{ id: string }>> {
  const context = await cardContextFor(supabase, series.creditCardId)
  if (!context.ok) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }
  const { data, error } = await supabase.rpc(
    'create_recurrence',
    createRecurrenceArgs(householdId, series, createSeries(series, firstStatus, context.card, today)),
  )
  if (error) return { ok: false, error: translateError(error) }
  return { ok: true, data: { id: data as string } }
}

/** Há recorrência ativa (sem fim ou terminando depois de hoje) usando o item (ou algum dos itens)? Null se a consulta falhar. */
export async function hasActiveRecurrence(
  supabase: SupabaseServer,
  column: 'account_id' | 'destination_account_id' | 'credit_card_id' | 'category_id',
  ids: string | string[],
  today: string,
): Promise<boolean | null> {
  const { count, error } = await supabase
    .from('recurrences')
    .select('id', { count: 'exact', head: true })
    .in(column, typeof ids === 'string' ? [ids] : ids)
    .or(`end_date.is.null,end_date.gt.${today}`)
  if (error) return null
  return (count ?? 0) > 0
}
