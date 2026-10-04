import { z } from 'zod'
import { COLOR_PALETTE } from '@/lib/categories'
import { isoDateSchema } from './common'

export const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'investment'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Carteira',
  investment: 'Investimento',
}

const MAX_CENTS = 99_999_999_999

export const accountSchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome da conta.' }).max(60, { error: 'Use no máximo 60 caracteres.' }),
  institution: z
    .string()
    .trim()
    .max(60, { error: 'Use no máximo 60 caracteres.' })
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  type: z.enum(ACCOUNT_TYPES, { error: 'Escolha o tipo.' }),
  initialBalanceCents: z
    .number({ error: 'Informe o saldo inicial.' })
    .int({ error: 'Informe o saldo inicial.' })
    .min(-MAX_CENTS, { error: 'Valor muito alto.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  initialBalanceDate: isoDateSchema,
  color: z.enum(COLOR_PALETTE, { error: 'Escolha uma cor.' }),
})

export type AccountFormInput = z.input<typeof accountSchema>
export type AccountOutput = z.output<typeof accountSchema>
