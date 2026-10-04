import type { LedgerTransaction, TransactionStatus, TransactionType } from '@/lib/finance/types'
import type { TransactionFormValues, TransactionInput } from '@/lib/validation/transaction'

export const TRANSACTION_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, notes, created_at'

export type TransactionRow = {
  id: string
  type: TransactionType
  description: string
  amount_cents: number
  date: string
  status: TransactionStatus
  category_id: string | null
  account_id: string
  destination_account_id: string | null
  notes: string | null
  created_at: string
}

export type TransactionInsertRow = {
  household_id: string
  type: TransactionType
  description: string
  amount_cents: number
  date: string
  status: TransactionStatus
  account_id: string
  category_id: string | null
  destination_account_id: string | null
  notes: string | null
}

export function rowToLedger(row: TransactionRow): LedgerTransaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    date: row.date,
    status: row.status,
    accountId: row.account_id,
    destinationAccountId: row.destination_account_id,
    createdAt: row.created_at,
  }
}

export function rowToInput(row: TransactionRow): TransactionInput {
  const base = {
    description: row.description,
    amountCents: row.amount_cents,
    date: row.date,
    status: row.status,
    accountId: row.account_id,
    notes: row.notes,
  }
  if (row.type === 'transfer') return { type: 'transfer', ...base, destinationAccountId: row.destination_account_id ?? '' }
  if (row.type === 'income') return { type: 'income', ...base, categoryId: row.category_id ?? '' }
  return { type: 'expense', ...base, categoryId: row.category_id ?? '' }
}

export function rowToFormValues(row: TransactionRow): TransactionFormValues {
  return {
    type: row.type,
    amountCents: row.amount_cents,
    description: row.description,
    categoryId: row.category_id ?? '',
    accountId: row.account_id,
    destinationAccountId: row.destination_account_id ?? '',
    date: row.date,
    status: row.status,
    notes: row.notes ?? '',
  }
}

/** Linha para insert/update; zera os campos que não pertencem ao tipo. */
export function inputToRow(input: TransactionInput, householdId: string): TransactionInsertRow {
  return {
    household_id: householdId,
    type: input.type,
    description: input.description,
    amount_cents: input.amountCents,
    date: input.date,
    status: input.status,
    account_id: input.accountId,
    notes: input.notes,
    category_id: input.type === 'transfer' ? null : input.categoryId,
    destination_account_id: input.type === 'transfer' ? input.destinationAccountId : null,
  }
}

/** Última conta usada, se ainda estiver na lista; senão a primeira. */
export function pickDefaultAccountId(accounts: { id: string }[], lastAccountId: string | null): string | null {
  if (lastAccountId && accounts.some((account) => account.id === lastAccountId)) return lastAccountId
  return accounts[0]?.id ?? null
}
