export type TransactionType = 'income' | 'expense' | 'transfer'
export type TransactionStatus = 'paid' | 'pending'

export type LedgerAccount = {
  id: string
  initialBalanceCents: number
  initialBalanceDate: string
}

export type LedgerTransaction = {
  id: string
  type: TransactionType
  amountCents: number
  date: string
  status: TransactionStatus
  accountId: string
  destinationAccountId: string | null
  createdAt: string
}
