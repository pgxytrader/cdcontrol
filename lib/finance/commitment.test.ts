import { describe, expect, it } from 'vitest'
import { futureCommitment } from './commitment'

const ym = (year: number, month: number) => ({ year, month })
const months = [ym(2026, 10), ym(2026, 11), ym(2026, 12)]

describe('futureCommitment', () => {
  it('sem lançamentos: meses zerados e máximo 0', () => {
    const result = futureCommitment([], months)
    expect(result.months.map((month) => month.totalCents)).toEqual([0, 0, 0])
    expect(result.maxTotalCents).toBe(0)
    expect(result.totalCents).toBe(0)
  })
  it('separa parcelas e assinaturas pelo mês de vencimento e ignora meses fora da janela', () => {
    const result = futureCommitment(
      [
        { amountCents: 10000, referenceMonth: '2026-10-01', kind: 'installment' },
        { amountCents: 4000, referenceMonth: '2026-10-01', kind: 'recurrence' },
        { amountCents: 10000, referenceMonth: '2026-11-01', kind: 'installment' },
        { amountCents: 9999, referenceMonth: '2027-05-01', kind: 'installment' },
      ],
      months,
    )
    expect(result.months[0]).toEqual({ ym: ym(2026, 10), key: '2026-10', installmentsCents: 10000, recurrencesCents: 4000, totalCents: 14000 })
    expect(result.months[1].totalCents).toBe(10000)
    expect(result.months[2].totalCents).toBe(0)
    expect(result.maxTotalCents).toBe(14000)
    expect(result.totalCents).toBe(24000)
  })
})
