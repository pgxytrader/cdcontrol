import type { FieldErrors, Resolver } from 'react-hook-form'
import { z } from 'zod'
import {
  RECURRENCE_FREQUENCIES,
  type OccurrenceValues,
  type RecurrenceFrequency,
  type Series,
  type SeriesEditValues,
  type SeriesType,
} from '@/lib/finance/recurrence'
import { isoDateSchema } from './common'
import { amountCentsSchema, descriptionSchema, notesSchema } from './fields'
import type { CardTransactionInput, TransactionInput } from './transaction'

/** Alcance ao editar/excluir um lançamento de série. */
export const SERIES_SCOPES = ['one', 'following'] as const
export type SeriesScope = (typeof SERIES_SCOPES)[number]

/** De onde vêm os valores novos de "este e os próximos". */
export const SERIES_SOURCES = ['account', 'card'] as const
export type SeriesSource = (typeof SERIES_SOURCES)[number]

const optionalUuid = z.uuid({ error: 'Escolha uma opção válida.' }).nullable()

/** Edição pela tela Recorrências. O tipo não muda. */
export const recurrenceEditSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    description: descriptionSchema,
    amountCents: amountCentsSchema,
    categoryId: optionalUuid,
    accountId: optionalUuid,
    destinationAccountId: optionalUuid,
    creditCardId: optionalUuid,
    notes: notesSchema,
    frequency: z.enum(RECURRENCE_FREQUENCIES, { error: 'Escolha a frequência.' }),
    nextDate: isoDateSchema,
    endDate: isoDateSchema.nullable(),
  })
  .refine((value) => value.type === 'transfer' || value.categoryId !== null, { error: 'Escolha a categoria.', path: ['categoryId'] })
  .refine((value) => value.type === 'transfer' || (value.accountId === null) !== (value.creditCardId === null), {
    error: 'Escolha a conta ou o cartão.',
    path: ['accountId'],
  })
  .refine((value) => value.creditCardId === null || value.type === 'expense', {
    error: 'No cartão, só despesas se repetem.',
    path: ['accountId'],
  })
  .refine(
    (value) =>
      value.type !== 'transfer' ||
      (value.accountId !== null && value.destinationAccountId !== null && value.accountId !== value.destinationAccountId),
    { error: 'Escolha duas contas diferentes.', path: ['destinationAccountId'] },
  )
  .refine((value) => value.endDate === null || value.endDate >= value.nextDate, {
    error: 'A data final precisa ser igual ou depois da próxima data.',
    path: ['endDate'],
  })

export type RecurrenceEditInput = z.output<typeof recurrenceEditSchema>

/** Normaliza para o tipo: transferência sem categoria nem cartão; receita/despesa sem conta destino. */
export function toSeriesEditValues(input: RecurrenceEditInput): SeriesEditValues {
  const transfer = input.type === 'transfer'
  return {
    type: input.type,
    description: input.description,
    amountCents: input.amountCents,
    categoryId: transfer ? null : input.categoryId,
    accountId: input.accountId,
    destinationAccountId: transfer ? input.destinationAccountId : null,
    creditCardId: transfer ? null : input.creditCardId,
    notes: input.notes,
    frequency: input.frequency,
    nextDate: input.nextDate,
    endDate: input.endDate,
  }
}

function accountFields(input: TransactionInput) {
  const transfer = input.type === 'transfer'
  return {
    type: input.type,
    description: input.description,
    amountCents: input.amountCents,
    categoryId: transfer ? null : input.categoryId,
    accountId: input.accountId,
    destinationAccountId: transfer ? input.destinationAccountId : null,
    creditCardId: null,
    notes: input.notes,
  }
}

function cardFields(input: CardTransactionInput) {
  return {
    type: input.type,
    description: input.description,
    amountCents: input.amountCents,
    categoryId: input.categoryId,
    accountId: null,
    destinationAccountId: null,
    creditCardId: input.creditCardId,
    notes: input.notes,
  }
}

/** Série nova a partir do formulário rápido em conta: a data do lançamento é a âncora. */
export function seriesFromTransactionInput(input: TransactionInput): Series | null {
  if (!input.repeat) return null
  return { ...accountFields(input), frequency: input.repeat.frequency, startDate: input.date, endDate: input.repeat.endDate }
}

/** Série nova a partir do formulário rápido no cartão (só compra à vista chega aqui com repeat). */
export function seriesFromCardInput(input: CardTransactionInput): Series | null {
  if (!input.repeat) return null
  return { ...cardFields(input), frequency: input.repeat.frequency, startDate: input.date, endDate: input.repeat.endDate }
}

/** Valores novos de "editar este e os próximos". */
export function occurrenceValuesFromTransactionInput(input: TransactionInput): OccurrenceValues {
  return { ...accountFields(input), date: input.date, status: input.status }
}

/** No cartão o status segue a data; o valor aqui é ignorado por changeFollowing. */
export function occurrenceValuesFromCardInput(input: CardTransactionInput): OccurrenceValues {
  return { ...cardFields(input), date: input.date, status: 'pending' }
}

/** Estado plano do formulário da tela Recorrências (campos vazios = ''). */
export type RecurrenceFormValues = {
  type: SeriesType
  amountCents: number
  description: string
  categoryId: string
  accountId: string
  creditCardId: string
  destinationAccountId: string
  frequency: RecurrenceFrequency
  nextDate: string
  endDate: string
  notes: string
}

export function toRecurrenceEditInput(values: RecurrenceFormValues): unknown {
  const orNull = (value: string) => value || null
  return {
    type: values.type,
    description: values.description,
    amountCents: values.amountCents,
    categoryId: orNull(values.categoryId),
    accountId: orNull(values.accountId),
    destinationAccountId: orNull(values.destinationAccountId),
    creditCardId: orNull(values.creditCardId),
    notes: values.notes,
    frequency: values.frequency,
    nextDate: values.nextDate,
    endDate: orNull(values.endDate),
  }
}

/** Resolver do react-hook-form com o mesmo schema do servidor. */
export const recurrenceFormResolver: Resolver<RecurrenceFormValues> = async (values) => {
  const parsed = recurrenceEditSchema.safeParse(toRecurrenceEditInput(values))
  if (parsed.success) return { values, errors: {} }
  const errors: Record<string, { type: string; message: string }> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'root')
    if (!errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors: errors as FieldErrors<RecurrenceFormValues> }
}
