'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { todayISO } from '@/lib/dates'
import {
  changeFollowing,
  changeSeries,
  endSeries,
  removeFollowing,
  type OccurrenceValues,
  type SeriesChange,
  type SeriesState,
  type SeriesTransaction,
} from '@/lib/finance/recurrence'
import { getCurrentHousehold } from '@/lib/household'
import { changeArgs } from '@/lib/recurrence-rpc'
import { cardContextFor, loadOccurrence, loadSeries, loadSeriesTransactions } from '@/lib/recurrence-server'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import {
  occurrenceValuesFromCardInput,
  occurrenceValuesFromTransactionInput,
  recurrenceEditSchema,
  SERIES_SOURCES,
  toSeriesEditValues,
} from '@/lib/validation/recurrence'
import { cardTransactionSchema, transactionSchema } from '@/lib/validation/transaction'
import {
  recurrenceSnapshotSchema,
  TRANSACTION_RECORD_COLUMNS,
  type RecurrenceRecord,
  type RecurrenceSnapshot,
  type TransactionRecord,
} from '@/lib/validation/transaction-record'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const sourceSchema = z.enum(SERIES_SOURCES)

function done() {
  revalidatePath('/', 'layout')
}

type LoadedSeries = { state: SeriesState; record: RecurrenceRecord; transactions: SeriesTransaction[] }

async function loadWithTransactions(supabase: SupabaseServer, recurrenceId: string): Promise<LoadedSeries | null> {
  const [series, transactions] = await Promise.all([loadSeries(supabase, recurrenceId), loadSeriesTransactions(supabase, recurrenceId)])
  if (!series || !transactions) return null
  return { ...series, transactions }
}

async function apply(supabase: SupabaseServer, recurrenceId: string, change: SeriesChange): Promise<ActionResult> {
  const { error } = await supabase.rpc('apply_recurrence_change', changeArgs(recurrenceId, change))
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: null }
}

/** Valores novos do formulário rápido, validados pelo mesmo schema do lançamento. */
function parseOccurrenceValues(input: unknown, source: 'account' | 'card'): { ok: true; values: OccurrenceValues } | { ok: false; result: ActionResult } {
  if (source === 'card') {
    const parsed = cardTransactionSchema.safeParse(input)
    if (!parsed.success) return { ok: false, result: invalidInput(parsed.error) }
    if (parsed.data.type !== 'expense' || parsed.data.installmentsCount !== 1 || parsed.data.currentInstallment !== null) {
      return { ok: false, result: { ok: false, error: 'No cartão, só compras à vista se repetem.' } }
    }
    return { ok: true, values: occurrenceValuesFromCardInput(parsed.data) }
  }
  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, result: invalidInput(parsed.error) }
  return { ok: true, values: occurrenceValuesFromTransactionInput(parsed.data) }
}

/** "Editar este e os próximos" a partir de um lançamento da série. */
export async function updateSeriesFollowing(id: unknown, input: unknown, source: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  const parsedSource = sourceSchema.safeParse(source)
  if (!parsedId.success || !parsedSource.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = parseOccurrenceValues(input, parsedSource.data)
  if (!parsed.ok) return parsed.result

  const supabase = await createClient()
  const found = await loadOccurrence(supabase, parsedId.data)
  if (!found) return { ok: false, error: GENERIC_ERROR }
  const loaded = await loadWithTransactions(supabase, found.recurrenceId)
  if (!loaded) return { ok: false, error: GENERIC_ERROR }
  const context = await cardContextFor(supabase, parsed.values.creditCardId)
  if (!context.ok) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }

  const change = changeFollowing(loaded.state, found.occurrence, parsed.values, {
    transactions: loaded.transactions,
    today: todayISO(),
    card: context.card,
  })
  return apply(supabase, loaded.state.id, change)
}

/** "Excluir este e os próximos". Devolve o snapshot do "Desfazer". */
export async function deleteSeriesFollowing(id: unknown): Promise<ActionResult<RecurrenceSnapshot>> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const found = await loadOccurrence(supabase, parsedId.data)
  if (!found) return { ok: false, error: GENERIC_ERROR }
  const loaded = await loadWithTransactions(supabase, found.recurrenceId)
  if (!loaded) return { ok: false, error: GENERIC_ERROR }

  const change = removeFollowing(loaded.state, found.occurrence, { transactions: loaded.transactions, today: todayISO(), card: null })
  const { data: rows, error: rowsError } = await supabase.from('transactions').select(TRANSACTION_RECORD_COLUMNS).in('id', change.deleteIds)
  if (rowsError) return { ok: false, error: translateError(rowsError) }

  const result = await apply(supabase, loaded.state.id, change)
  if (!result.ok) return result
  return { ok: true, data: { recurrence: loaded.record, rows: rows as TransactionRecord[] } }
}

/** "Desfazer": devolve a série como estava e as linhas apagadas, com os mesmos ids. */
export async function restoreSeries(snapshot: unknown): Promise<ActionResult> {
  const parsed = recurrenceSnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_recurrence', {
    p_recurrence: { ...parsed.data.recurrence, household_id: household.id },
    p_rows: parsed.data.rows.map((row) => ({ ...row, household_id: household.id })),
  })
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: null }
}

/** Edição pela tela Recorrências: vale das não realizadas de hoje em diante. Série encerrada não se edita. */
export async function updateRecurrence(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = recurrenceEditSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const today = todayISO()
  if (parsed.data.nextDate < today) {
    return { ok: false, error: 'Verifique os campos destacados.', fieldErrors: { nextDate: ['Escolha hoje ou uma data futura.'] } }
  }

  const supabase = await createClient()
  const loaded = await loadWithTransactions(supabase, parsedId.data)
  if (!loaded) return { ok: false, error: GENERIC_ERROR }
  if (loaded.state.endDate !== null && loaded.state.endDate < today) return { ok: false, error: 'Esta recorrência já foi encerrada.' }

  const values = toSeriesEditValues(parsed.data)
  const context = await cardContextFor(supabase, values.creditCardId)
  if (!context.ok) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }

  return apply(supabase, loaded.state.id, changeSeries(loaded.state, values, { transactions: loaded.transactions, today, card: context.card }))
}

/** Encerra hoje: as não realizadas depois de hoje saem; as pagas ficam. */
export async function endRecurrence(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const loaded = await loadWithTransactions(supabase, parsedId.data)
  if (!loaded) return { ok: false, error: GENERIC_ERROR }

  const today = todayISO()
  if (loaded.state.endDate !== null && loaded.state.endDate < today) return { ok: false, error: 'Esta recorrência já foi encerrada.' }

  return apply(supabase, loaded.state.id, endSeries(loaded.state, { transactions: loaded.transactions, today, card: null }))
}
