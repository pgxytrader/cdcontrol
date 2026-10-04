import { describe, expect, it } from 'vitest'
import { summarizeMonth } from './summary'

describe('summarizeMonth', () => {
  it('separa realizado e previsto e ignora transferências', () => {
    const summary = summarizeMonth([
      { type: 'income', status: 'paid', amountCents: 50_000 },
      { type: 'income', status: 'pending', amountCents: 2_000 },
      { type: 'expense', status: 'paid', amountCents: 20_000 },
      { type: 'expense', status: 'pending', amountCents: 5_000 },
      { type: 'transfer', status: 'paid', amountCents: 10_000 },
    ])
    expect(summary).toEqual({
      income: { paid: 50_000, pending: 2_000 },
      expense: { paid: 20_000, pending: 5_000 },
      balancePaid: 30_000,
      balanceProjected: 27_000,
    })
  })

  it('mês vazio zera tudo', () => {
    expect(summarizeMonth([])).toEqual({
      income: { paid: 0, pending: 0 },
      expense: { paid: 0, pending: 0 },
      balancePaid: 0,
      balanceProjected: 0,
    })
  })
})
