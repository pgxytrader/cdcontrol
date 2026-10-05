import { z } from 'zod'
import { isoDateSchema } from './common'

/** Colunas de transactions que o "Desfazer" recria (sem embeds: servem também para delete().select()). */
export const TRANSACTION_RECORD_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, source, external_id, notes'

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
