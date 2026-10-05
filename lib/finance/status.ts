import type { TransactionStatus, TransactionType } from './types'

/** Status sugerido para um lançamento novo: hoje ou passado → pago; futuro → pendente. */
export function defaultStatus(date: string, today: string): TransactionStatus {
  return date <= today ? 'paid' : 'pending'
}

/**
 * Status usado na leitura. Receitas e despesas no cartão (sem conta) seguem a data — uma parcela futura
 * vira "realizada" quando chega o dia. Lançamentos em conta e pagamentos de fatura usam o status salvo.
 */
export function effectiveStatus(
  tx: { type: TransactionType; status: TransactionStatus; date: string; accountId: string | null },
  today: string,
): TransactionStatus {
  if (tx.accountId === null && (tx.type === 'income' || tx.type === 'expense')) return defaultStatus(tx.date, today)
  return tx.status
}
