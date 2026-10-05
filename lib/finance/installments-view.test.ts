import { describe, expect, it } from 'vitest'
import { groupInstallmentsByMonth, totalCommitted, type InstallmentEntry } from './installments-view'

function entry(partial: Partial<InstallmentEntry> & Pick<InstallmentEntry, 'id'>): InstallmentEntry {
  return {
    planId: 'p1',
    cardId: 'nubank',
    description: 'Geladeira',
    amountCents: 10_000,
    installmentNumber: 1,
    installmentsCount: 3,
    referenceMonth: '2026-11-01',
    ...partial,
  }
}

describe('groupInstallmentsByMonth', () => {
  const entries = [
    entry({ id: 'g3', installmentNumber: 3, referenceMonth: '2027-01-01' }),
    entry({ id: 'g2', installmentNumber: 2, referenceMonth: '2026-12-01' }),
    entry({ id: 't1', planId: 'p2', cardId: 'inter', description: 'TV', amountCents: 50_000, installmentNumber: 4, installmentsCount: 5, referenceMonth: '2026-12-01' }),
    entry({ id: 't2', planId: 'p2', cardId: 'inter', description: 'TV', amountCents: 50_000, installmentNumber: 5, installmentsCount: 5, referenceMonth: '2027-01-01' }),
  ]

  it('agrupa pelo mês de vencimento, em ordem, com totais por mês e por cartão', () => {
    const months = groupInstallmentsByMonth(entries)
    expect(months.map((month) => [month.referenceMonth, month.totalCents])).toEqual([
      ['2026-12-01', 60_000],
      ['2027-01-01', 60_000],
    ])
    expect(months[0].byCard).toEqual([
      { cardId: 'nubank', totalCents: 10_000 },
      { cardId: 'inter', totalCents: 50_000 },
    ])
    expect(months[0].items.map((item) => item.id)).toEqual(['g2', 't1'])
  })

  it('saldo restante = esta parcela + as seguintes do mesmo plano', () => {
    const items = groupInstallmentsByMonth(entries).flatMap((month) => month.items)
    const remaining = Object.fromEntries(items.map((item) => [item.id, item.remainingCents]))
    expect(remaining).toEqual({ g2: 20_000, g3: 10_000, t1: 100_000, t2: 50_000 })
  })

  it('lista vazia', () => {
    expect(groupInstallmentsByMonth([])).toEqual([])
  })
})

describe('totalCommitted', () => {
  it('soma todas as parcelas', () => {
    expect(totalCommitted([{ amountCents: 100 }, { amountCents: 250 }])).toBe(350)
  })
})
