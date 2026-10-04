import type { FieldErrors, Resolver } from 'react-hook-form'
import { z } from 'zod'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { isoDateSchema } from './common'

const MAX_CENTS = 99_999_999_999

const baseFields = {
  description: z
    .string()
    .trim()
    .min(1, { error: 'Informe a descrição.' })
    .max(120, { error: 'Use no máximo 120 caracteres.' }),
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int({ error: 'Informe o valor.' })
    .positive({ error: 'Informe um valor maior que zero.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  date: isoDateSchema,
  status: z.enum(['paid', 'pending'], { error: 'Escolha o status.' }),
  accountId: z.uuid({ error: 'Escolha a conta.' }),
  notes: z
    .string()
    .trim()
    .max(500, { error: 'Use no máximo 500 caracteres.' })
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
}

const categoryId = z.uuid({ error: 'Escolha a categoria.' })

export const transactionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('income'), ...baseFields, categoryId }),
  z.object({ type: z.literal('expense'), ...baseFields, categoryId }),
  z
    .object({ type: z.literal('transfer'), ...baseFields, destinationAccountId: z.uuid({ error: 'Escolha a conta de destino.' }) })
    .refine((value) => value.destinationAccountId !== value.accountId, {
      error: 'Escolha uma conta diferente da origem.',
      path: ['destinationAccountId'],
    }),
])

export type TransactionInput = z.output<typeof transactionSchema>

/** Estado plano do formulário (campos vazios = ''). */
export type TransactionFormValues = {
  type: TransactionType
  amountCents: number
  description: string
  categoryId: string
  accountId: string
  destinationAccountId: string
  date: string
  status: TransactionStatus
  notes: string
}

/** Converte o formulário na entrada do schema, mantendo só os campos do tipo escolhido. */
export function toTransactionInput(values: TransactionFormValues): unknown {
  const base = {
    description: values.description,
    amountCents: values.amountCents,
    date: values.date,
    status: values.status,
    accountId: values.accountId || undefined,
    notes: values.notes,
  }
  if (values.type === 'transfer') {
    return { type: 'transfer', ...base, destinationAccountId: values.destinationAccountId || undefined }
  }
  return { type: values.type, ...base, categoryId: values.categoryId || undefined }
}

/** Resolver do react-hook-form que valida com o mesmo schema do servidor. */
export const transactionFormResolver: Resolver<TransactionFormValues> = async (values) => {
  const parsed = transactionSchema.safeParse(toTransactionInput(values))
  if (parsed.success) return { values, errors: {} }
  const errors: Record<string, { type: string; message: string }> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'root')
    if (!errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors: errors as FieldErrors<TransactionFormValues> }
}

export const transactionSnapshotSchema = z.object({ id: z.uuid(), input: transactionSchema })
export type TransactionSnapshot = { id: string; input: TransactionInput }
