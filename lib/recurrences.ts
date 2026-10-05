import 'server-only'
import { fetchAllPages } from '@/lib/fetch-all'
import { nextOccurrenceDate, sortRecurrenceItems, type RecurrenceItem, type SeriesTransaction } from '@/lib/finance/recurrence'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { rowToSeries } from '@/lib/recurrence-server'
import { createClient } from '@/lib/supabase/server'
import { RECURRENCE_RECORD_COLUMNS, type RecurrenceRecord } from '@/lib/validation/transaction-record'

/** Séries ativas (sem fim ou terminando hoje ou depois) e encerradas, com a próxima data. */
export async function listRecurrences(today: string): Promise<{ active: RecurrenceItem[]; ended: RecurrenceItem[] }> {
  const supabase = await createClient()
  const [{ data, error }, upcoming] = await Promise.all([
    supabase.from('recurrences').select(RECURRENCE_RECORD_COLUMNS).order('description'),
    fetchAllPages((from, to) =>
      supabase
        .from('transactions')
        .select('id, recurrence_id, occurrence_date, type, status, date, account_id')
        .not('recurrence_id', 'is', null)
        .gte('occurrence_date', today)
        .order('id')
        .range(from, to),
    ),
  ])
  if (error) throw error

  const bySeries = new Map<string, SeriesTransaction[]>()
  for (const row of upcoming) {
    const list = bySeries.get(row.recurrence_id as string) ?? []
    list.push({
      id: row.id as string,
      occurrenceDate: row.occurrence_date as string,
      type: row.type as TransactionType,
      status: row.status as TransactionStatus,
      date: row.date as string,
      accountId: row.account_id as string | null,
    })
    bySeries.set(row.recurrence_id as string, list)
  }

  const items = (data as RecurrenceRecord[]).map((record) => {
    const state = rowToSeries(record)
    return { ...state, nextDate: nextOccurrenceDate(bySeries.get(state.id) ?? [], today) }
  })
  const isActive = (item: RecurrenceItem) => item.endDate === null || item.endDate >= today
  return {
    active: sortRecurrenceItems(items.filter(isActive)),
    ended: items.filter((item) => !isActive(item)).sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '')),
  }
}
