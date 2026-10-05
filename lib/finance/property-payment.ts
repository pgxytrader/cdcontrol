// lib/finance/property-payment.ts
import { resolveCycleForDate } from './invoice'
import type { CardSchedule, InvoiceCycle } from './types'

export const PROPERTY_TX_PREFIX = 'Imóvel: '

/** "Imóvel: <descrição do gasto>", cortado no limite de 120 da descrição do lançamento. */
export function propertyTransactionDescription(description: string): string {
  return `${PROPERTY_TX_PREFIX}${description}`.slice(0, 120)
}

export type PaymentTarget =
  | { kind: 'account'; accountId: string }
  | { kind: 'card'; creditCardId: string; schedule: CardSchedule; stored: InvoiceCycle[] }

export type PaymentTransaction = {
  description: string
  amountCents: number
  date: string
  status: 'paid'
  categoryId: string
  accountId: string | null
  creditCardId: string | null
  cycle: InvoiceCycle | null
}

/** Lançamento de um gasto pago com recursos próprios. A data nunca é futura, então é sempre "pago". */
export function paymentTransaction(
  input: { description: string; paidAmountCents: number; paidDate: string; categoryId: string },
  target: PaymentTarget,
): PaymentTransaction {
  const base = {
    description: propertyTransactionDescription(input.description),
    amountCents: input.paidAmountCents,
    date: input.paidDate,
    status: 'paid' as const,
    categoryId: input.categoryId,
  }
  if (target.kind === 'account') return { ...base, accountId: target.accountId, creditCardId: null, cycle: null }
  return {
    ...base,
    accountId: null,
    creditCardId: target.creditCardId,
    cycle: resolveCycleForDate(target.schedule, input.paidDate, target.stored),
  }
}
