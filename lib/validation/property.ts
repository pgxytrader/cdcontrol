// lib/validation/property.ts
import { z } from 'zod'
import {
  AMORTIZATION_SYSTEMS,
  FUNDING_SOURCES,
  PROPERTY_PHASES,
  TYPICAL_PHASES,
  type AmortizationSystem,
  type PropertyExpense,
  type PropertyPhase,
} from '@/lib/finance/property'
import { addMonthsClamped } from '@/lib/finance/invoice'
import { isoDateSchema, uuidSchema } from './common'
import { MAX_CENTS, descriptionSchema, notesSchema } from './fields'
import { transactionRecordSchema } from './transaction-record'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Use no máximo ${max} caracteres.` })
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))

const centsSchema = z
  .number({ error: 'Informe o valor.' })
  .int({ error: 'Informe o valor.' })
  .min(0, { error: 'Informe um valor válido.' })
  .max(MAX_CENTS, { error: 'Valor muito alto.' })

const positiveCents = centsSchema.refine((value) => value > 0, { error: 'Informe um valor maior que zero.' })

const optionalDate = isoDateSchema
  .nullable()
  .optional()
  .transform((value) => value ?? null)

export const propertySchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome.' }).max(80, { error: 'Use no máximo 80 caracteres.' }),
  developer: optionalText(200),
  unit: optionalText(200),
  address: optionalText(200),
  purchasePriceCents: centsSchema,
  contractDate: optionalDate,
  expectedDeliveryDate: optionalDate,
  phase: z.enum(PROPERTY_PHASES, { error: 'Escolha a fase.' }).default('pre_keys'),
  bank: optionalText(80),
  financedAmountCents: centsSchema.nullable().optional().transform((value) => value ?? null),
  termMonths: z
    .number()
    .int({ error: 'Informe meses inteiros.' })
    .min(1, { error: 'Prazo entre 1 e 600 meses.' })
    .max(600, { error: 'Prazo entre 1 e 600 meses.' })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  amortizationSystem: z
    .enum(AMORTIZATION_SYSTEMS, { error: 'Escolha SAC ou Price.' })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  annualInterestRate: z
    .number({ error: 'Informe a taxa.' })
    .min(0, { error: 'Taxa entre 0 e 100% ao ano.' })
    .max(100, { error: 'Taxa entre 0 e 100% ao ano.' })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
})

export type PropertyInput = z.input<typeof propertySchema>
export type PropertyOutput = z.output<typeof propertySchema>

const DATE_RANGE_ERROR = 'Use uma data entre 2000 e 2100.'

/** Data de calendário válida com ano entre 2000 e 2100 (a tela e os cálculos de mês assumem esse intervalo). */
const boundedDateSchema = isoDateSchema.refine((value) => value >= '2000-01-01' && value <= '2100-12-31', { error: DATE_RANGE_ERROR })

export const expenseSchema = z.object({
  propertyId: uuidSchema,
  expenseTypeId: z.uuid({ error: 'Escolha o tipo.' }),
  description: descriptionSchema,
  payee: optionalText(80),
  plannedAmountCents: centsSchema,
  dueDate: boundedDateSchema,
  fundingSource: z.enum(FUNDING_SOURCES, { error: 'Escolha a fonte.' }),
  notes: notesSchema,
})

export type ExpenseInput = z.input<typeof expenseSchema>
export type ExpenseOutput = z.output<typeof expenseSchema>

const sourceSchema = z
  .object({ kind: z.enum(['account', 'card']), id: z.uuid({ error: 'Escolha a conta ou o cartão.' }) })
  .nullable()
  .optional()
  .transform((value) => value ?? null)

/** `today` (AAAA-MM-DD) impede pagamento com data futura. Só recursos próprios lança nas finanças. */
export function paymentSchema(today: string) {
  return z
    .object({
      expenseId: uuidSchema,
      paidAmountCents: positiveCents,
      paidDate: isoDateSchema.refine((value) => value <= today, { error: 'A data do pagamento não pode ser futura.' }),
      fundingSource: z.enum(FUNDING_SOURCES, { error: 'Escolha a fonte.' }),
      launch: z.boolean(),
      source: sourceSchema,
      categoryId: z.uuid({ error: 'Escolha a categoria.' }).nullable().optional().transform((value) => value ?? null),
    })
    .transform((value) => ({ ...value, launch: value.launch && value.fundingSource === 'own' }))
    .superRefine((value, ctx) => {
      if (!value.launch) return
      if (!value.source) ctx.addIssue({ code: 'custom', path: ['source'], message: 'Escolha a conta ou o cartão.' })
      if (!value.categoryId) ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Escolha a categoria.' })
    })
}

export type PaymentInput = z.input<ReturnType<typeof paymentSchema>>
export type PaymentOutput = z.output<ReturnType<typeof paymentSchema>>

const blockCount = (max: number) =>
  z
    .number({ error: 'Informe a quantidade.' })
    .int({ error: 'Informe a quantidade.' })
    .min(1, { error: `Entre 1 e ${max}.` })
    .max(max, { error: `Entre 1 e ${max}.` })

export const planSchema = z
  .object({
    propertyId: uuidSchema,
    fundingSource: z.enum(FUNDING_SOURCES, { error: 'Escolha a fonte.' }),
    monthly: z.object({ amountCents: positiveCents, count: blockCount(360), firstDueDate: boundedDateSchema }).nullable(),
    intermediate: z
      .object({
        amountCents: positiveCents,
        count: blockCount(60),
        firstDueDate: boundedDateSchema,
        everyMonths: z.union([z.literal(6), z.literal(12)], { error: 'A cada 6 ou 12 meses.' }),
      })
      .nullable(),
    keys: z.object({ amountCents: positiveCents, dueDate: boundedDateSchema }).nullable(),
  })
  .refine((value) => value.monthly || value.intermediate || value.keys, {
    error: 'Preencha ao menos um bloco: mensais, intermediárias ou chaves.',
    path: ['monthly'],
  })
  .superRefine((value, ctx) => {
    const { monthly, intermediate } = value
    if (monthly && addMonthsClamped(monthly.firstDueDate, monthly.count - 1) > '2100-12-31')
      ctx.addIssue({ code: 'custom', path: ['monthly', 'firstDueDate'], message: DATE_RANGE_ERROR })
    if (intermediate && addMonthsClamped(intermediate.firstDueDate, (intermediate.count - 1) * intermediate.everyMonths) > '2100-12-31')
      ctx.addIssue({ code: 'custom', path: ['intermediate', 'firstDueDate'], message: DATE_RANGE_ERROR })
  })

export type PlanInput = z.input<typeof planSchema>
export type PlanOutput = z.output<typeof planSchema>

export const expenseTypeSchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome.' }).max(60, { error: 'Use no máximo 60 caracteres.' }),
  typicalPhase: z.enum(TYPICAL_PHASES, { error: 'Escolha a fase típica.' }),
})

export type ExpenseTypeInput = z.input<typeof expenseTypeSchema>

/** Colunas de property_expenses que o "Desfazer" recria. */
export const EXPENSE_RECORD_COLUMNS =
  'id, property_id, expense_type_id, description, payee, planned_amount_cents, due_date, status, paid_amount_cents, paid_date, funding_source, transaction_id, notes'

export const expenseRecordSchema = z.object({
  id: z.uuid(),
  property_id: z.uuid(),
  expense_type_id: z.uuid(),
  description: z.string().min(1).max(120),
  payee: z.string().max(80).nullable(),
  planned_amount_cents: z.number().int().min(0),
  due_date: isoDateSchema,
  status: z.enum(['planned', 'paid']),
  paid_amount_cents: z.number().int().positive().nullable(),
  paid_date: isoDateSchema.nullable(),
  funding_source: z.enum(FUNDING_SOURCES),
  transaction_id: z.uuid().nullable(),
  notes: z.string().max(500).nullable(),
})

export const propertySnapshotSchema = z.object({
  expenses: z.array(expenseRecordSchema).min(1).max(500),
  transactions: z.array(transactionRecordSchema).max(500),
})

export type ExpenseRecord = z.output<typeof expenseRecordSchema>
export type PropertySnapshot = z.output<typeof propertySnapshotSchema>

/** Conta/cartão e categoria do lançamento ligado (para pré-preencher "Editar pagamento"). */
export type LinkedTransaction = { accountId: string | null; creditCardId: string | null; categoryId: string | null }
export type ExpenseView = PropertyExpense & { linked: LinkedTransaction | null }

/** Imóvel como a tela usa (camelCase). */
export type PropertyRecord = {
  id: string
  name: string
  developer: string | null
  unit: string | null
  address: string | null
  purchasePriceCents: number
  contractDate: string | null
  expectedDeliveryDate: string | null
  phase: PropertyPhase
  bank: string | null
  financedAmountCents: number | null
  termMonths: number | null
  amortizationSystem: AmortizationSystem | null
  annualInterestRate: number | null
}
