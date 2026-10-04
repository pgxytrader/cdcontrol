import { describe, expect, it } from 'vitest'
import { inputToRow, pickDefaultAccountId, rowToFormValues, rowToInput, rowToLedger, type TransactionRow } from './transaction-mappers'
import type { TransactionInput } from './validation/transaction'

const row: TransactionRow = {
  id: 'tx-1',
  type: 'expense',
  description: 'Padaria',
  amount_cents: 1250,
  date: '2026-10-04',
  status: 'paid',
  category_id: 'cat-1',
  account_id: 'acc-1',
  destination_account_id: null,
  notes: null,
  created_at: '2026-10-04T12:00:00Z',
}

describe('mapeadores de lançamento', () => {
  it('rowToLedger', () => {
    expect(rowToLedger(row)).toEqual({
      id: 'tx-1',
      type: 'expense',
      amountCents: 1250,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      destinationAccountId: null,
      createdAt: '2026-10-04T12:00:00Z',
    })
  })

  it('rowToInput e rowToFormValues', () => {
    expect(rowToInput(row)).toEqual({
      type: 'expense',
      description: 'Padaria',
      amountCents: 1250,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      notes: null,
      categoryId: 'cat-1',
    })
    expect(rowToFormValues({ ...row, type: 'transfer', category_id: null, destination_account_id: 'acc-2' })).toEqual({
      type: 'transfer',
      amountCents: 1250,
      description: 'Padaria',
      categoryId: '',
      accountId: 'acc-1',
      destinationAccountId: 'acc-2',
      date: '2026-10-04',
      status: 'paid',
      notes: '',
    })
  })

  it('inputToRow zera os campos do outro tipo (despesa ↔ transferência)', () => {
    const transfer: TransactionInput = {
      type: 'transfer',
      description: 'Reserva',
      amountCents: 500,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      notes: null,
      destinationAccountId: 'acc-2',
    }
    expect(inputToRow(transfer, 'house-1')).toMatchObject({ category_id: null, destination_account_id: 'acc-2' })

    const expense: TransactionInput = { ...rowToInput(row) }
    expect(inputToRow(expense, 'house-1')).toMatchObject({
      household_id: 'house-1',
      category_id: 'cat-1',
      destination_account_id: null,
    })
  })

  it('pickDefaultAccountId usa a última conta se ainda estiver disponível', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }]
    expect(pickDefaultAccountId(accounts, 'b')).toBe('b')
    expect(pickDefaultAccountId(accounts, 'arquivada')).toBe('a')
    expect(pickDefaultAccountId(accounts, null)).toBe('a')
    expect(pickDefaultAccountId([], 'b')).toBeNull()
  })
})
