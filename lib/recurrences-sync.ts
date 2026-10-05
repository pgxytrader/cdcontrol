import 'server-only'
import { loadCardContext } from '@/lib/card-context'
import { buildOccurrences, generationWindow, horizonDate, occurrenceDates } from '@/lib/finance/recurrence'
import { generateArgs } from '@/lib/recurrence-rpc'
import { rowToSeries } from '@/lib/recurrence-server'
import { createClient } from '@/lib/supabase/server'
import { RECURRENCE_RECORD_COLUMNS, type RecurrenceRecord } from '@/lib/validation/transaction-record'

/**
 * Gera as ocorrências que faltam até hoje + 12 meses (PRD 8.6). Roda no layout a cada carregamento:
 * normalmente a consulta volta vazia. Nunca lança — um erro fica no log e a próxima carga tenta de novo
 * (o índice único impede duplicatas).
 */
export async function syncRecurrences(today: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('recurrences')
      .select(RECURRENCE_RECORD_COLUMNS)
      .lt('generated_until', horizonDate(today))
    if (error) throw error

    for (const record of data as RecurrenceRecord[]) {
      const series = rowToSeries(record)
      const window = generationWindow(series.generatedUntil, series.endDate, today)
      if (!window) continue
      try {
        const card = series.creditCardId ? await loadCardContext(supabase, series.creditCardId) : null
        if (series.creditCardId && !card) continue
        const occurrences = buildOccurrences(occurrenceDates(series, window.from, window.until), card, today)
        const { error: rpcError } = await supabase.rpc('generate_recurrence_occurrences', generateArgs(series.id, series, occurrences, window.until))
        if (rpcError) console.error('syncRecurrences', series.id, rpcError.message)
      } catch (cause) {
        console.error('syncRecurrences', series.id, cause)
      }
    }
  } catch (cause) {
    console.error('syncRecurrences', cause)
  }
}
