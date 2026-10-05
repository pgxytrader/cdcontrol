import 'server-only'
import { fetchAllPages } from '@/lib/fetch-all'
import { toReportRow, type ReportRow } from '@/lib/finance/reports'
import { createClient } from '@/lib/supabase/server'

/** Lançamentos com data em [start, end), só as colunas dos relatórios, com o status efetivo. */
export async function loadReportRows(start: string, end: string, today: string): Promise<ReportRow[]> {
  const supabase = await createClient()
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select('id, type, status, date, amount_cents, category_id, account_id, credit_card_id')
      .gte('date', start)
      .lt('date', end)
      .order('id')
      .range(from, to),
  )
  return rows.map((row) => toReportRow(row, today))
}
