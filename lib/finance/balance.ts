import { monthBounds, type YearMonth } from '@/lib/dates'
import type { LedgerAccount, LedgerTransaction } from './types'

/** Efeito do lançamento no saldo da conta (0 se não a envolve). */
export function transactionDelta(tx: LedgerTransaction, accountId: string): number {
  if (tx.type === 'income') return tx.accountId === accountId ? tx.amountCents : 0
  if (tx.type === 'expense') return tx.accountId === accountId ? -tx.amountCents : 0
  let delta = 0
  if (tx.accountId === accountId) delta -= tx.amountCents
  if (tx.destinationAccountId === accountId) delta += tx.amountCents
  return delta
}

/** Só pagos, com data igual ou posterior à do saldo inicial (mesma regra da view v_account_balances). */
function countsForBalance(tx: LedgerTransaction, account: LedgerAccount): boolean {
  return tx.status === 'paid' && tx.date >= account.initialBalanceDate
}

export function accountBalance(account: LedgerAccount, transactions: LedgerTransaction[]): number {
  return transactions.reduce(
    (sum, tx) => (countsForBalance(tx, account) ? sum + transactionDelta(tx, account.id) : sum),
    account.initialBalanceCents,
  )
}

export type StatementRow<T> = { transaction: T; deltaCents: number; runningCents: number | null }

export type Statement<T> = {
  openingCents: number
  rows: StatementRow<T>[]
  closingCents: number
  beforeInitialDate: boolean
}

function involves(tx: LedgerTransaction, accountId: string): boolean {
  return tx.accountId === accountId || tx.destinationAccountId === accountId
}

/** Extrato do mês: abertura, linhas com saldo acumulado (pendentes e anteriores ao saldo inicial = null) e fechamento. */
export function buildStatement<T extends LedgerTransaction>(
  account: LedgerAccount,
  transactions: T[],
  ym: YearMonth,
): Statement<T> {
  const { start, end } = monthBounds(ym)
  const mine = transactions.filter((tx) => involves(tx, account.id))

  let openingCents = account.initialBalanceCents
  for (const tx of mine) {
    if (tx.date < start && countsForBalance(tx, account)) openingCents += transactionDelta(tx, account.id)
  }

  const inMonth = mine
    .filter((tx) => tx.date >= start && tx.date < end)
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))

  let running = openingCents
  const rows = inMonth.map((tx) => {
    const deltaCents = transactionDelta(tx, account.id)
    if (!countsForBalance(tx, account)) return { transaction: tx, deltaCents, runningCents: null }
    running += deltaCents
    return { transaction: tx, deltaCents, runningCents: running }
  })

  return { openingCents, rows, closingCents: running, beforeInitialDate: end <= account.initialBalanceDate }
}
