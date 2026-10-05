import { z } from 'zod'
import { RECURRENCE_FREQUENCIES } from '@/lib/finance/recurrence'
import { isoDateSchema } from './common'

export const MAX_CENTS = 99_999_999_999

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, { error: 'Informe a descrição.' })
  .max(120, { error: 'Use no máximo 120 caracteres.' })

export const amountCentsSchema = z
  .number({ error: 'Informe o valor.' })
  .int({ error: 'Informe o valor.' })
  .positive({ error: 'Informe um valor maior que zero.' })
  .max(MAX_CENTS, { error: 'Valor muito alto.' })

export const notesSchema = z
  .string()
  .trim()
  .max(500, { error: 'Use no máximo 500 caracteres.' })
  .nullable()
  .optional()
  .transform((value) => (value ? value : null))

export const categoryIdSchema = z.uuid({ error: 'Escolha a categoria.' })

/** Bloco "Repetir" do formulário rápido; ausente ou nulo = não repete. */
export const repeatSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES, { error: 'Escolha a frequência.' }),
    endDate: isoDateSchema.nullable(),
  })
  .nullable()
  .optional()
  .transform((value) => value ?? null)
