import { describe, expect, it } from 'vitest'
import { buildCardPurchase, installmentLabel, splitInstallments } from './installments'
import { cycleForClosingMonth, cycleForDate } from './invoice'

const card = { closingDay: 3, dueDay: 10 }

describe('splitInstallments (PRD 8.3)', () => {
  it('o resto dos centavos vai para a primeira parcela', () => {
    expect(splitInstallments(10_000, 3)).toEqual([3334, 3333, 3333])
  })

  it('divisão exata', () => {
    expect(splitInstallments(12_000, 3)).toEqual([4000, 4000, 4000])
  })

  it('24 parcelas somam o total', () => {
    const parts = splitInstallments(100_000, 24)
    expect(parts).toHaveLength(24)
    expect(parts[0]).toBe(4182)
    expect(parts.slice(1).every((value) => value === 4166)).toBe(true)
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(100_000)
  })

  it('valor menor que o número de parcelas gera parcela zero (o schema recusa antes)', () => {
    expect(splitInstallments(1, 2)).toEqual([1, 0])
  })
})

describe('buildCardPurchase', () => {
  it('à vista: uma linha na fatura da data, sem plano', () => {
    expect(buildCardPurchase(card, { mode: 'single', amountCents: 5000, date: '2026-10-02' })).toEqual({
      plan: null,
      rows: [{ amountCents: 5000, date: '2026-10-02', installmentNumber: null, cycle: cycleForDate(card, '2026-10-02') }],
    })
  })

  it('R$ 100,00 em 3x: 33,34 + 33,33 + 33,33 em três faturas consecutivas', () => {
    const { plan, rows } = buildCardPurchase(card, { mode: 'installments', totalCents: 10_000, count: 3, date: '2026-10-02' })
    expect(plan).toEqual({
      totalAmountCents: 10_000,
      installmentsCount: 3,
      firstInstallmentNumber: 1,
      purchaseDate: '2026-10-02',
      firstClosingMonth: '2026-10-01',
    })
    expect(rows.map((row) => [row.installmentNumber, row.amountCents, row.date, row.cycle.closingDate])).toEqual([
      [1, 3334, '2026-10-02', '2026-10-03'],
      [2, 3333, '2026-11-02', '2026-11-03'],
      [3, 3333, '2026-12-02', '2026-12-03'],
    ])
  })

  it('compra em 29/01 com fechamento 30: a parcela 2 não pula a fatura de fevereiro', () => {
    const late = { closingDay: 30, dueDay: 7 }
    const { rows } = buildCardPurchase(late, { mode: 'installments', totalCents: 20_000, count: 2, date: '2027-01-29' })
    expect(rows[0].cycle.closingDate).toBe('2027-01-30')
    expect(rows[1].date).toBe('2027-02-28')
    expect(rows[1].cycle.closingMonth).toBe('2027-02-01')
    // Pela data da parcela, ela cairia em março — por isso a fatura vem da contagem
    expect(cycleForDate(late, rows[1].date).closingMonth).toBe('2027-03-01')
  })

  it('compra em andamento: cria da parcela atual em diante, a atual na fatura da data', () => {
    const { plan, rows } = buildCardPurchase(card, {
      mode: 'in_progress',
      installmentCents: 15_000,
      current: 3,
      count: 10,
      date: '2026-10-04',
    })
    expect(plan).toEqual({
      totalAmountCents: 150_000,
      installmentsCount: 10,
      firstInstallmentNumber: 3,
      purchaseDate: '2026-08-04',
      firstClosingMonth: '2026-09-01',
    })
    expect(rows).toHaveLength(8)
    expect(rows[0]).toMatchObject({ installmentNumber: 3, amountCents: 15_000, date: '2026-10-04' })
    expect(rows[0].cycle).toEqual(cycleForDate(card, '2026-10-04'))
    expect(rows[7]).toMatchObject({ installmentNumber: 10, date: '2027-05-04' })
    expect(rows[7].cycle.closingMonth).toBe('2027-06-01')
  })
})

describe('buildCardPurchase com faturas salvas (fechamento aumentado)', () => {
  // Fechava dia 15; hoje 20/10 passou a fechar dia 25. Outubro já fechou em 15/10; novembro já existe.
  const raised = { closingDay: 25, dueDay: 5 }
  const stored = [
    { closingMonth: '2026-10-01', closingDate: '2026-10-15', dueDate: '2026-11-05', referenceMonth: '2026-11-01' },
    { closingMonth: '2026-11-01', closingDate: '2026-11-25', dueDate: '2026-12-05', referenceMonth: '2026-12-01' },
  ]

  it('parcelada em 21/10 começa em novembro, não na fatura de outubro já fechada', () => {
    const { plan, rows } = buildCardPurchase(raised, { mode: 'installments', totalCents: 30_000, count: 3, date: '2026-10-21' }, stored)
    expect(plan?.firstClosingMonth).toBe('2026-11-01')
    expect(rows.map((row) => row.cycle)).toEqual([stored[1], cycleForClosingMonth(raised, '2026-12-01'), cycleForClosingMonth(raised, '2027-01-01')])
  })

  it('à vista e em andamento seguem a mesma regra', () => {
    expect(buildCardPurchase(raised, { mode: 'single', amountCents: 1000, date: '2026-10-21' }, stored).rows[0].cycle).toEqual(stored[1])
    const inProgress = buildCardPurchase(raised, { mode: 'in_progress', installmentCents: 1000, current: 2, count: 3, date: '2026-10-21' }, stored)
    expect(inProgress.plan?.firstClosingMonth).toBe('2026-10-01')
    expect(inProgress.rows.map((row) => [row.installmentNumber, row.cycle.closingMonth])).toEqual([
      [2, '2026-11-01'],
      [3, '2026-12-01'],
    ])
  })

  it('compra esquecida antes do fechamento salvo fica em outubro', () => {
    expect(buildCardPurchase(raised, { mode: 'single', amountCents: 1000, date: '2026-10-10' }, stored).rows[0].cycle).toEqual(stored[0])
  })
})

describe('installmentLabel', () => {
  it('acrescenta (k/N) às parcelas', () => {
    expect(installmentLabel('Geladeira', 3, 10)).toBe('Geladeira (3/10)')
    expect(installmentLabel('Padaria', null, null)).toBe('Padaria')
  })
})
