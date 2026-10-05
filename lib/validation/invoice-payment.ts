import { z } from 'zod'
import { isoDateSchema } from './common'

const MAX_CENTS = 99_999_999_999

export const invoicePaymentSchema = z.object({
  accountId: z.uuid({ error: 'Escolha a conta.' }),
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int({ error: 'Informe o valor.' })
    .positive({ error: 'Informe um valor maior que zero.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  date: isoDateSchema,
})

export type InvoicePaymentInput = z.output<typeof invoicePaymentSchema>
