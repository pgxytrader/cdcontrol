import { describe, expect, it } from 'vitest'
import {
  applyEffectiveStatus,
  decodeSource,
  encodeSource,
  inputToRow,
  installmentInfo,
  pickDefaultAccountId,
  pickDefaultSource,
  rowToFormValues,
  rowToLedger,
  seriesInfo,
  type TransactionRow,
} from './transaction-mappers'
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
  credit_card_id: null,
  invoice_id: null,
  installment_plan_id: null,
  installment_number: null,
  notes: null,
  created_at: '2026-10-04T12:00:00Z',
  installment_plans: null,
  card_invoices: null,
  recurrence_id: null,
  occurrence_date: null,
  recurrences: null,
  source: 'manual',
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

  it('rowToFormValues', () => {
    expect(rowToFormValues({ ...row, type: 'transfer', category_id: null, destination_account_id: 'acc-2' })).toEqual({
      type: 'transfer',
      amountCents: 1250,
      description: 'Padaria',
      categoryId: '',
      accountId: 'acc-1',
      creditCardId: '',
      destinationAccountId: 'acc-2',
      date: '2026-10-04',
      status: 'paid',
      notes: '',
      installmentsCount: 1,
      inProgress: false,
      currentInstallment: 1,
      repeatFrequency: '',
      repeatEndDate: '',
    })
  })

  it('rowToFormValues de uma parcela no cartão', () => {
    const installment = {
      ...row,
      account_id: null,
      credit_card_id: 'card-1',
      invoice_id: 'inv-1',
      installment_plan_id: 'plan-1',
      installment_number: 3,
      installment_plans: { installments_count: 10 },
    }
    expect(rowToFormValues(installment)).toMatchObject({
      accountId: '',
      creditCardId: 'card-1',
      installmentsCount: 10,
      currentInstallment: 3,
    })
  })

  it('inputToRow zera os campos do outro tipo e os do cartão', () => {
    const transfer: TransactionInput = {
      type: 'transfer',
      description: 'Reserva',
      amountCents: 500,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      notes: null,
      repeat: null,
      destinationAccountId: 'acc-2',
    }
    expect(inputToRow(transfer, 'house-1')).toMatchObject({ category_id: null, destination_account_id: 'acc-2' })

    const expense: TransactionInput = {
      type: 'expense',
      description: 'Padaria',
      amountCents: 1250,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      notes: null,
      repeat: null,
      categoryId: 'cat-1',
    }
    expect(inputToRow(expense, 'house-1')).toEqual({
      household_id: 'house-1',
      type: 'expense',
      description: 'Padaria',
      amount_cents: 1250,
      date: '2026-10-04',
      status: 'paid',
      account_id: 'acc-1',
      notes: null,
      category_id: 'cat-1',
      destination_account_id: null,
      credit_card_id: null,
      invoice_id: null,
    })
  })

  it('encodeSource e decodeSource', () => {
    expect(encodeSource({ accountId: 'a', creditCardId: '' })).toBe('account:a')
    expect(encodeSource({ accountId: '', creditCardId: 'c' })).toBe('card:c')
    expect(encodeSource({ accountId: '', creditCardId: '' })).toBe('')
    expect(decodeSource('card:c')).toEqual({ accountId: '', creditCardId: 'c' })
    expect(decodeSource('account:a')).toEqual({ accountId: 'a', creditCardId: '' })
    expect(decodeSource('outra-coisa')).toEqual({ accountId: '', creditCardId: '' })
  })

  it('pickDefaultSource: último cartão ou conta da pessoa, senão a primeira conta, senão o primeiro cartão', () => {
    const accounts = [{ id: 'a' }]
    const cards = [{ id: 'c' }]
    expect(pickDefaultSource(accounts, cards, null, 'c')).toEqual({ accountId: '', creditCardId: 'c' })
    expect(pickDefaultSource(accounts, cards, 'a', 'arquivado')).toEqual({ accountId: 'a', creditCardId: '' })
    expect(pickDefaultSource([], cards, null, null)).toEqual({ accountId: '', creditCardId: 'c' })
    expect(pickDefaultSource([], [], null, null)).toEqual({ accountId: '', creditCardId: '' })
  })

  it('installmentInfo', () => {
    expect(installmentInfo(row)).toBeUndefined()
    expect(
      installmentInfo({ ...row, installment_plan_id: 'plan-1', installment_number: 3, installment_plans: { installments_count: 10 } }),
    ).toEqual({ number: 3, count: 10 })
  })

  it('pickDefaultAccountId usa a última conta se ainda estiver disponível', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }]
    expect(pickDefaultAccountId(accounts, 'b')).toBe('b')
    expect(pickDefaultAccountId(accounts, 'arquivada')).toBe('a')
    expect(pickDefaultAccountId(accounts, null)).toBe('a')
    expect(pickDefaultAccountId([], 'b')).toBeNull()
  })

  it('applyEffectiveStatus: compra no cartão segue a data; em conta, o status salvo', () => {
    const card = { ...row, account_id: null, credit_card_id: 'card-1', invoice_id: 'inv-1', status: 'pending' as const }
    expect(applyEffectiveStatus(card, '2026-10-04').status).toBe('paid')
    expect(applyEffectiveStatus({ ...card, date: '2026-11-04', status: 'paid' }, '2026-10-04').status).toBe('pending')
    expect(applyEffectiveStatus({ ...row, status: 'pending' }, '2026-12-01').status).toBe('pending')
    expect(applyEffectiveStatus(row, '2026-10-04')).toBe(row)
  })
})

describe('seriesInfo', () => {
  it('só existe em lançamentos de série', () => {
    expect(seriesInfo(row)).toBeUndefined()
    expect(
      seriesInfo({ ...row, recurrence_id: '77777777-7777-4777-8777-777777777777', occurrence_date: '2026-10-10', recurrences: { frequency: 'monthly' } }),
    ).toEqual({ frequency: 'monthly' })
  })
})
