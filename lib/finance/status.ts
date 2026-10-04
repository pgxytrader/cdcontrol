import type { TransactionStatus } from './types'

/** Status sugerido para um lançamento novo: hoje ou passado → pago; futuro → pendente. */
export function defaultStatus(date: string, today: string): TransactionStatus {
  return date <= today ? 'paid' : 'pending'
}
