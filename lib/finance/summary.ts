import type { LedgerTransaction } from './types'

export type MonthSummary = {
  income: { paid: number; pending: number }
  expense: { paid: number; pending: number }
  balancePaid: number
  balanceProjected: number
}

/** Receitas e despesas do mês, realizado x previsto. Transferências não entram (PRD 8.5). */
export function summarizeMonth(transactions: Pick<LedgerTransaction, 'type' | 'status' | 'amountCents'>[]): MonthSummary {
  const income = { paid: 0, pending: 0 }
  const expense = { paid: 0, pending: 0 }
  for (const tx of transactions) {
    if (tx.type === 'transfer') continue
    const bucket = tx.type === 'income' ? income : expense
    bucket[tx.status] += tx.amountCents
  }
  return {
    income,
    expense,
    balancePaid: income.paid - expense.paid,
    balanceProjected: income.paid + income.pending - (expense.paid + expense.pending),
  }
}
