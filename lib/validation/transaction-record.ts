import { z } from 'zod'
import { RECURRENCE_FREQUENCIES } from '@/lib/finance/recurrence'
import { isoDateSchema } from './common'

/** Colunas de transactions que o "Desfazer" recria (sem embeds: servem também para delete().select()). */
export const TRANSACTION_RECORD_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, source, external_id, notes, recurrence_id, occurrence_date'

export const PLAN_RECORD_COLUMNS =
  'id, credit_card_id, category_id, description, total_amount_cents, installments_count, first_installment_number, purchase_date, first_closing_month'

const nullableUuid = z.uuid().nullable()

export const transactionRecordSchema = z.object({
  id: z.uuid(),
  type: z.enum(['income', 'expense', 'transfer', 'invoice_payment']),
  description: z.string().min(1).max(120),
  amount_cents: z.number().int().positive(),
  date: isoDateSchema,
  status: z.enum(['paid', 'pending']),
  category_id: nullableUuid,
  account_id: nullableUuid,
  destination_account_id: nullableUuid,
  credit_card_id: nullableUuid,
  invoice_id: nullableUuid,
  installment_plan_id: nullableUuid,
  installment_number: z.number().int().min(1).max(24).nullable(),
  source: z.enum(['manual', 'recurrence', 'property', 'import']),
  external_id: z.string().max(200).nullable(),
  notes: z.string().max(500).nullable(),
  recurrence_id: nullableUuid,
  occurrence_date: isoDateSchema.nullable(),
})

export const planRecordSchema = z.object({
  id: z.uuid(),
  credit_card_id: z.uuid(),
  category_id: z.uuid(),
  description: z.string().min(1).max(120),
  total_amount_cents: z.number().int().positive(),
  installments_count: z.number().int().min(2).max(24),
  first_installment_number: z.number().int().min(1).max(24),
  purchase_date: isoDateSchema,
  first_closing_month: isoDateSchema,
})

/** O que uma exclusão devolve para o "Desfazer": o plano (se foi apagado junto) e as linhas. */
export const deletionSnapshotSchema = z.object({
  plan: planRecordSchema.nullable(),
  rows: z.array(transactionRecordSchema).min(1).max(24),
})

export type TransactionRecord = z.output<typeof transactionRecordSchema>
export type PlanRecord = z.output<typeof planRecordSchema>
export type DeletionSnapshot = z.output<typeof deletionSnapshotSchema>

export const RECURRENCE_RECORD_COLUMNS =
  'id, type, description, amount_cents, category_id, account_id, destination_account_id, credit_card_id, frequency, start_date, end_date, generated_until, notes'

export const recurrenceRecordSchema = z.object({
  id: z.uuid(),
  type: z.enum(['income', 'expense', 'transfer']),
  description: z.string().min(1).max(120),
  amount_cents: z.number().int().positive(),
  category_id: nullableUuid,
  account_id: nullableUuid,
  destination_account_id: nullableUuid,
  credit_card_id: nullableUuid,
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  start_date: isoDateSchema,
  end_date: isoDateSchema.nullable(),
  generated_until: isoDateSchema,
  notes: z.string().max(500).nullable(),
})

/** "Desfazer" de "excluir este e os próximos": a série como estava e as linhas apagadas. */
export const recurrenceSnapshotSchema = z.object({
  recurrence: recurrenceRecordSchema,
  rows: z.array(transactionRecordSchema).min(1).max(1000),
})

export type RecurrenceRecord = z.output<typeof recurrenceRecordSchema>
export type RecurrenceSnapshot = z.output<typeof recurrenceSnapshotSchema>
