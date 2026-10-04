import { beforeEach, describe, expect, it } from 'vitest'
import { accountBalance, buildStatement, transactionDelta } from './balance'
import type { LedgerAccount, LedgerTransaction } from './types'

const account: LedgerAccount = { id: 'a1', initialBalanceCents: 100_000, initialBalanceDate: '2026-09-01' }

let seq = 0
function tx(partial: Partial<LedgerTransaction>): LedgerTransaction {
  seq += 1
  return {
    id: `t${seq}`,
    type: 'expense',
    amountCents: 1000,
    date: '2026-09-10',
    status: 'paid',
    accountId: 'a1',
    destinationAccountId: null,
    createdAt: `2026-09-01T00:00:${String(seq).padStart(2, '0')}Z`,
    ...partial,
  }
}

let scenario: LedgerTransaction[]

beforeEach(() => {
  seq = 0
  scenario = [
    tx({ type: 'income', amountCents: 50_000, date: '2026-09-05' }),
    tx({ type: 'expense', amountCents: 20_000, date: '2026-09-10' }),
    tx({ type: 'expense', amountCents: 5_000, date: '2026-09-12', status: 'pending' }),
    tx({ type: 'expense', amountCents: 7_000, date: '2026-08-20' }), // antes do saldo inicial
    tx({ type: 'transfer', amountCents: 10_000, date: '2026-09-15', destinationAccountId: 'a2' }),
    tx({ type: 'transfer', amountCents: 3_000, date: '2026-09-20', accountId: 'a2', destinationAccountId: 'a1' }),
    tx({ type: 'expense', amountCents: 999, date: '2026-09-25', accountId: 'a2' }), // outra conta
  ]
})

describe('transactionDelta', () => {
  it('dá o efeito do lançamento na conta', () => {
    expect(transactionDelta(tx({ type: 'income', amountCents: 500 }), 'a1')).toBe(500)
    expect(transactionDelta(tx({ type: 'expense', amountCents: 500 }), 'a1')).toBe(-500)
    expect(transactionDelta(tx({ type: 'transfer', amountCents: 500, destinationAccountId: 'a2' }), 'a1')).toBe(-500)
    expect(transactionDelta(tx({ type: 'transfer', amountCents: 500, destinationAccountId: 'a2' }), 'a2')).toBe(500)
    expect(transactionDelta(tx({ type: 'expense', amountCents: 500 }), 'a2')).toBe(0)
  })
})

describe('accountBalance', () => {
  it('soma só pagos a partir da data do saldo inicial, com transferências', () => {
    // 100.000 + 50.000 − 20.000 − 10.000 + 3.000
    expect(accountBalance(account, scenario)).toBe(123_000)
  })

  it('aceita saldo inicial negativo', () => {
    expect(accountBalance({ ...account, initialBalanceCents: -5_000 }, [])).toBe(-5_000)
  })

  it('calcula a outra conta pela mesma regra', () => {
    const other: LedgerAccount = { id: 'a2', initialBalanceCents: 0, initialBalanceDate: '2026-09-01' }
    // + 10.000 − 3.000 − 999
    expect(accountBalance(other, scenario)).toBe(6_001)
  })
})

describe('buildStatement', () => {
  it('monta o extrato do mês com saldo acumulado', () => {
    const statement = buildStatement(account, scenario, { year: 2026, month: 9 })
    expect(statement.beforeInitialDate).toBe(false)
    expect(statement.openingCents).toBe(100_000)
    expect(statement.rows.map((r) => [r.transaction.date, r.deltaCents, r.runningCents])).toEqual([
      ['2026-09-05', 50_000, 150_000],
      ['2026-09-10', -20_000, 130_000],
      ['2026-09-12', -5_000, null], // pendente não altera o acumulado
      ['2026-09-15', -10_000, 120_000],
      ['2026-09-20', 3_000, 123_000],
    ])
    expect(statement.closingCents).toBe(123_000)
  })

  it('abre o mês seguinte com o fechamento do anterior', () => {
    const statement = buildStatement(account, scenario, { year: 2026, month: 10 })
    expect(statement.openingCents).toBe(123_000)
    expect(statement.rows).toEqual([])
    expect(statement.closingCents).toBe(123_000)
  })

  it('marca o mês anterior ao saldo inicial e não soma seus lançamentos', () => {
    const statement = buildStatement(account, scenario, { year: 2026, month: 8 })
    expect(statement.beforeInitialDate).toBe(true)
    expect(statement.rows.map((r) => [r.deltaCents, r.runningCents])).toEqual([[-7_000, null]])
    expect(statement.closingCents).toBe(statement.openingCents)
  })

  it('ordena pela data e, no mesmo dia, pela criação', () => {
    const later = tx({ date: '2026-09-03', createdAt: '2026-09-03T10:00:00Z', amountCents: 1 })
    const earlier = tx({ date: '2026-09-03', createdAt: '2026-09-03T09:00:00Z', amountCents: 2 })
    const statement = buildStatement(account, [later, earlier], { year: 2026, month: 9 })
    expect(statement.rows.map((r) => r.transaction.amountCents)).toEqual([2, 1])
  })

  it('preserva campos extras do lançamento (genérico)', () => {
    const withExtra = [{ ...tx({ date: '2026-09-02' }), description: 'Padaria' }]
    const statement = buildStatement(account, withExtra, { year: 2026, month: 9 })
    expect(statement.rows[0].transaction.description).toBe('Padaria')
  })
})
