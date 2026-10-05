export type TransactionType = 'income' | 'expense' | 'transfer' | 'invoice_payment'
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
  /** Nulo nas receitas e despesas no cartão. */
  accountId: string | null
  destinationAccountId: string | null
  createdAt: string
}

/** Dias de fechamento e vencimento configurados no cartão (1–31). */
export type CardSchedule = { closingDay: number; dueDay: number }

/** Um ciclo de fatura. Datas em AAAA-MM-DD; meses sempre no dia 1 (AAAA-MM-01). */
export type InvoiceCycle = {
  /** Mês em que a fatura fecha — identidade do ciclo. */
  closingMonth: string
  closingDate: string
  dueDate: string
  /** Mês do vencimento ("fatura de novembro"), só para exibição. */
  referenceMonth: string
}
