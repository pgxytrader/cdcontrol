import { z } from 'zod'
import { COLOR_PALETTE } from '@/lib/categories'

export const CARD_BRANDS = ['visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other'] as const
export type CardBrand = (typeof CARD_BRANDS)[number]

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
  other: 'Outra',
}

/** Cartão como o formulário rápido precisa (seguro para componentes de cliente). */
export type CardOption = { id: string; name: string; color: string; archived: boolean; closingDay: number; dueDay: number }

const MAX_CENTS = 99_999_999_999

function day(label: string) {
  const error = `Escolha o dia de ${label}.`
  return z.number({ error }).int({ error }).min(1, { error }).max(31, { error })
}

export const cardSchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome do cartão.' }).max(40, { error: 'Use no máximo 40 caracteres.' }),
  brand: z.enum(CARD_BRANDS, { error: 'Escolha a bandeira.' }),
  lastFour: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, { error: 'Informe os 4 últimos dígitos.' })
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  limitCents: z
    .number({ error: 'Informe o limite.' })
    .int({ error: 'Informe o limite.' })
    .min(0, { error: 'O limite não pode ser negativo.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  closingDay: day('fechamento'),
  dueDay: day('vencimento'),
  defaultPaymentAccountId: z
    .union([z.uuid({ error: 'Conta inválida.' }), z.literal('')])
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  color: z.enum(COLOR_PALETTE, { error: 'Escolha uma cor.' }),
})

export type CardFormInput = z.input<typeof cardSchema>
export type CardOutput = z.output<typeof cardSchema>

/** "Visa · •••• 1234 · arquivado". */
export function cardSubtitle(card: { brand: CardBrand; lastFour: string | null; archived: boolean }): string {
  return [CARD_BRAND_LABELS[card.brand], card.lastFour ? `•••• ${card.lastFour}` : null, card.archived ? 'arquivado' : null]
    .filter(Boolean)
    .join(' · ')
}
