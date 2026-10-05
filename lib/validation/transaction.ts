import type { FieldErrors, Resolver } from 'react-hook-form'
import { z } from 'zod'
import { MAX_INSTALLMENTS, type CardPurchaseInput } from '@/lib/finance/installments'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { isoDateSchema } from './common'

const MAX_CENTS = 99_999_999_999

const description = z
  .string()
  .trim()
  .min(1, { error: 'Informe a descrição.' })
  .max(120, { error: 'Use no máximo 120 caracteres.' })

const amountCents = z
  .number({ error: 'Informe o valor.' })
  .int({ error: 'Informe o valor.' })
  .positive({ error: 'Informe um valor maior que zero.' })
  .max(MAX_CENTS, { error: 'Valor muito alto.' })

const notes = z
  .string()
  .trim()
  .max(500, { error: 'Use no máximo 500 caracteres.' })
  .nullable()
  .optional()
  .transform((value) => (value ? value : null))

const categoryId = z.uuid({ error: 'Escolha a categoria.' })

const baseFields = {
  description,
  amountCents,
  date: isoDateSchema,
  status: z.enum(['paid', 'pending'], { error: 'Escolha o status.' }),
  accountId: z.uuid({ error: 'Escolha a conta.' }),
  notes,
}

/** Lançamento em conta (receita, despesa ou transferência). */
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

const installmentNumber = z
  .number({ error: 'Escolha o número de parcelas.' })
  .int({ error: 'Escolha o número de parcelas.' })
  .min(1, { error: 'Escolha o número de parcelas.' })
  .max(MAX_INSTALLMENTS, { error: `Use no máximo ${MAX_INSTALLMENTS} parcelas.` })

/**
 * Receita (estorno) ou despesa no cartão. `amountCents` é o total da compra — ou o valor de cada parcela
 * quando `currentInstallment` vem preenchido (compra já em andamento).
 */
export const cardTransactionSchema = z
  .object({
    type: z.enum(['income', 'expense'], { error: 'Escolha o tipo.' }),
    description,
    amountCents,
    date: isoDateSchema,
    notes,
    categoryId,
    creditCardId: z.uuid({ error: 'Escolha o cartão.' }),
    installmentsCount: installmentNumber,
    currentInstallment: installmentNumber.nullable(),
  })
  .refine((value) => value.type === 'expense' || (value.installmentsCount === 1 && value.currentInstallment === null), {
    error: 'Estorno não pode ser parcelado.',
    path: ['installmentsCount'],
  })
  .refine((value) => value.currentInstallment === null || value.installmentsCount >= 2, {
    error: 'Informe o total de parcelas.',
    path: ['installmentsCount'],
  })
  .refine((value) => value.currentInstallment === null || value.currentInstallment <= value.installmentsCount, {
    error: 'A parcela atual não pode passar do total.',
    path: ['currentInstallment'],
  })
  .refine((value) => value.currentInstallment !== null || value.amountCents >= value.installmentsCount, {
    error: 'Valor pequeno demais para tantas parcelas.',
    path: ['amountCents'],
  })

export type CardTransactionInput = z.output<typeof cardTransactionSchema>

/** Entrada de buildCardPurchase a partir do formulário validado. */
export function toCardPurchaseInput(input: CardTransactionInput): CardPurchaseInput {
  if (input.currentInstallment !== null) {
    return {
      mode: 'in_progress',
      installmentCents: input.amountCents,
      current: input.currentInstallment,
      count: input.installmentsCount,
      date: input.date,
    }
  }
  if (input.installmentsCount > 1) {
    return { mode: 'installments', totalCents: input.amountCents, count: input.installmentsCount, date: input.date }
  }
  return { mode: 'single', amountCents: input.amountCents, date: input.date }
}

export const INSTALLMENT_SCOPES = ['one', 'future'] as const
export type InstallmentScope = (typeof INSTALLMENT_SCOPES)[number]

/** Edição de parcela: só os campos descritivos, nesta parcela ou nesta e nas futuras. */
export const installmentEditSchema = z.object({
  scope: z.enum(INSTALLMENT_SCOPES, { error: 'Escolha onde aplicar.' }),
  description,
  categoryId,
  notes,
})

export type InstallmentEditInput = z.input<typeof installmentEditSchema>

/** Pagamentos de fatura têm formulário próprio (tela da fatura). */
export type FormTransactionType = Exclude<TransactionType, 'invoice_payment'>

/** Estado plano do formulário (campos vazios = ''). */
export type TransactionFormValues = {
  type: FormTransactionType
  amountCents: number
  description: string
  categoryId: string
  accountId: string
  /** Preenchido quando "Pagar com" é um cartão (aí accountId fica ''). */
  creditCardId: string
  destinationAccountId: string
  date: string
  status: TransactionStatus
  notes: string
  installmentsCount: number
  /** Compra já em andamento: o valor passa a ser o de cada parcela. */
  inProgress: boolean
  currentInstallment: number
}

/** Receita/despesa com um cartão em "Pagar com". */
export function isCardForm(values: Pick<TransactionFormValues, 'type' | 'creditCardId'>): boolean {
  return values.type !== 'transfer' && values.creditCardId !== ''
}

/** Converte o formulário na entrada do schema de conta, mantendo só os campos do tipo escolhido. */
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

/** Converte o formulário na entrada do schema do cartão; receita nunca é parcelada. */
export function toCardTransactionInput(values: TransactionFormValues): unknown {
  const canSplit = values.type === 'expense'
  return {
    type: values.type,
    description: values.description,
    amountCents: values.amountCents,
    date: values.date,
    notes: values.notes,
    categoryId: values.categoryId || undefined,
    creditCardId: values.creditCardId || undefined,
    installmentsCount: canSplit ? values.installmentsCount : 1,
    currentInstallment: canSplit && values.inProgress ? values.currentInstallment : null,
  }
}

/** Resolver do react-hook-form que valida com o mesmo schema do servidor (conta ou cartão). */
export const transactionFormResolver: Resolver<TransactionFormValues> = async (values) => {
  const parsed = isCardForm(values)
    ? cardTransactionSchema.safeParse(toCardTransactionInput(values))
    : transactionSchema.safeParse(toTransactionInput(values))
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
