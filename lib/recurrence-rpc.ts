import { cycleColumns } from './card-rpc'
import type { BudgetChange } from './finance/budget'
import type { Occurrence, Series, SeriesChange, SeriesFields } from './finance/recurrence'

/** Campos da série nas colunas de recurrences (sem household_id e generated_until). */
export function seriesColumns(series: Series) {
  return {
    type: series.type,
    description: series.description,
    amount_cents: series.amountCents,
    category_id: series.categoryId,
    account_id: series.accountId,
    destination_account_id: series.destinationAccountId,
    credit_card_id: series.creditCardId,
    frequency: series.frequency,
    start_date: series.startDate,
    end_date: series.endDate,
    notes: series.notes,
  }
}

/** Linhas para os RPCs de série: campos da série, datas, status e, no cartão, o ciclo da fatura. `id` só na linha regravada. */
export function occurrenceRows(fields: SeriesFields, occurrences: Occurrence[]) {
  return occurrences.map((occurrence) => ({
    ...(occurrence.id ? { id: occurrence.id } : {}),
    type: fields.type,
    description: fields.description,
    amount_cents: fields.amountCents,
    date: occurrence.date,
    occurrence_date: occurrence.occurrenceDate,
    status: occurrence.status,
    category_id: fields.categoryId,
    account_id: fields.accountId,
    destination_account_id: fields.destinationAccountId,
    credit_card_id: fields.creditCardId,
    notes: fields.notes,
    ...(occurrence.cycle ? cycleColumns(occurrence.cycle) : {}),
  }))
}

export function createRecurrenceArgs(householdId: string, series: Series, created: { occurrences: Occurrence[]; generatedUntil: string }) {
  return {
    p_recurrence: { household_id: householdId, ...seriesColumns(series), generated_until: created.generatedUntil },
    p_rows: occurrenceRows(series, created.occurrences),
  }
}

export function generateArgs(recurrenceId: string, series: Series, occurrences: Occurrence[], generatedUntil: string) {
  return { p_recurrence_id: recurrenceId, p_rows: occurrenceRows(series, occurrences), p_generated_until: generatedUntil }
}

/** Estado completo da série (apply_recurrence_change substitui todos os campos). */
export function changeArgs(recurrenceId: string, change: SeriesChange) {
  return {
    p_recurrence_id: recurrenceId,
    p_patch: seriesColumns(change.series),
    p_delete_ids: change.deleteIds,
    p_rows: occurrenceRows(change.series, change.occurrences),
    p_generated_until: change.generatedUntil,
  }
}

export function budgetChangeArgs(categoryId: string, change: BudgetChange) {
  return {
    p_category_id: categoryId,
    p_upserts: change.upserts.map((upsert) => ({ month: upsert.month, amount_cents: upsert.amountCents, repeats: upsert.repeats })),
    p_delete_months: change.deleteMonths,
  }
}
