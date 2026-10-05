import { z } from 'zod'
import { BUDGET_MODES } from '@/lib/finance/budget'
import { isoDateSchema } from './common'
import { MAX_CENTS } from './fields'

export const budgetSchema = z.object({
  categoryId: z.uuid({ error: 'Categoria inválida.' }),
  month: isoDateSchema.refine((value) => value.endsWith('-01'), { error: 'Mês inválido.' }),
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int({ error: 'Informe o valor.' })
    .min(0, { error: 'Informe um valor válido.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  mode: z.enum(BUDGET_MODES, { error: 'Escolha onde aplicar.' }),
})

export type BudgetInput = z.input<typeof budgetSchema>
