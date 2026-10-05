import { describe, expect, it } from 'vitest'
import { buildPaymentPlan, planPreview, type PaymentPlanInput } from './property-plan'

const base: PaymentPlanInput = { monthly: null, intermediate: null, keys: null, fundingSource: 'own' }

describe('buildPaymentPlan', () => {
  it('mensais: mesmo dia de cada mês, descrições k/n', () => {
    const rows = buildPaymentPlan({ ...base, monthly: { amountCents: 150_000, count: 3, firstDueDate: '2026-11-10' } })
    expect(rows).toEqual([
      { systemKey: 'monthly', description: 'Parcela mensal 1/3', plannedAmountCents: 150_000, dueDate: '2026-11-10', fundingSource: 'own' },
      { systemKey: 'monthly', description: 'Parcela mensal 2/3', plannedAmountCents: 150_000, dueDate: '2026-12-10', fundingSource: 'own' },
      { systemKey: 'monthly', description: 'Parcela mensal 3/3', plannedAmountCents: 150_000, dueDate: '2027-01-10', fundingSource: 'own' },
    ])
  })

  it('mensal no dia 31 atravessa fevereiro de ano bissexto e volta a 31', () => {
    const rows = buildPaymentPlan({ ...base, monthly: { amountCents: 1, count: 3, firstDueDate: '2028-01-31' } })
    expect(rows.map((row) => row.dueDate)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
  })

  it('intermediárias a cada 6 e a cada 12 meses', () => {
    const six = buildPaymentPlan({ ...base, intermediate: { amountCents: 1_000_000, count: 3, firstDueDate: '2026-12-15', everyMonths: 6 } })
    expect(six.map((row) => [row.description, row.dueDate])).toEqual([
      ['Intermediária 1/3', '2026-12-15'],
      ['Intermediária 2/3', '2027-06-15'],
      ['Intermediária 3/3', '2027-12-15'],
    ])
    const yearly = buildPaymentPlan({ ...base, intermediate: { amountCents: 1, count: 2, firstDueDate: '2028-02-29', everyMonths: 12 } })
    expect(yearly.map((row) => row.dueDate)).toEqual(['2028-02-29', '2029-02-28'])
  })

  it('só chaves, com a fonte escolhida', () => {
    expect(buildPaymentPlan({ ...base, keys: { amountCents: 5_000_000, dueDate: '2029-06-30' }, fundingSource: 'financing' })).toEqual([
      { systemKey: 'keys', description: 'Parcela das chaves', plannedAmountCents: 5_000_000, dueDate: '2029-06-30', fundingSource: 'financing' },
    ])
  })

  it('sem blocos, nada', () => {
    expect(buildPaymentPlan(base)).toEqual([])
  })
})

describe('planPreview', () => {
  it('por bloco, na ordem mensais → intermediárias → chaves, e total geral', () => {
    const rows = buildPaymentPlan({
      ...base,
      keys: { amountCents: 5_000_000, dueDate: '2029-06-30' },
      monthly: { amountCents: 150_000, count: 36, firstDueDate: '2026-11-10' },
      intermediate: { amountCents: 1_000_000, count: 6, firstDueDate: '2026-12-15', everyMonths: 6 },
    })
    expect(planPreview(rows)).toEqual({
      blocks: [
        { systemKey: 'monthly', count: 36, firstDate: '2026-11-10', lastDate: '2029-10-10', totalCents: 5_400_000 },
        { systemKey: 'intermediate', count: 6, firstDate: '2026-12-15', lastDate: '2029-06-15', totalCents: 6_000_000 },
        { systemKey: 'keys', count: 1, firstDate: '2029-06-30', lastDate: '2029-06-30', totalCents: 5_000_000 },
      ],
      count: 43,
      totalCents: 16_400_000,
    })
  })
  it('vazio', () => {
    expect(planPreview([])).toEqual({ blocks: [], count: 0, totalCents: 0 })
  })
})
