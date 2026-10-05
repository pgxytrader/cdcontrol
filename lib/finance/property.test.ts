import { describe, expect, it } from 'vitest'
import {
  correctionCents,
  expenseStatus,
  propertySchedule,
  propertySummary,
  totalsByType,
  type PropertyExpense,
} from './property'

const expense = (patch: Partial<PropertyExpense>): PropertyExpense => ({
  id: 'e',
  propertyId: 'p',
  expenseTypeId: 'monthly',
  description: 'Parcela mensal 1/36',
  payee: null,
  plannedAmountCents: 150_000,
  dueDate: '2026-11-10',
  status: 'planned',
  paidAmountCents: null,
  paidDate: null,
  fundingSource: 'own',
  transactionId: null,
  notes: null,
  ...patch,
})

const paid = (patch: Partial<PropertyExpense>) => expense({ status: 'paid', paidDate: '2026-10-05', paidAmountCents: 150_000, ...patch })

const KEYS = new Map<string, string | null>([
  ['monthly', 'monthly'],
  ['incc', 'incc'],
  ['taxa', 'construction_interest'],
  ['itbi', 'itbi'],
  ['custom', null],
])

describe('expenseStatus', () => {
  it('pago, atrasado (vencimento antes de hoje) e previsto (hoje ou depois)', () => {
    expect(expenseStatus(paid({ dueDate: '2026-01-01' }), '2026-10-05')).toBe('paid')
    expect(expenseStatus(expense({ dueDate: '2026-10-04' }), '2026-10-05')).toBe('overdue')
    expect(expenseStatus(expense({ dueDate: '2026-10-05' }), '2026-10-05')).toBe('planned')
  })
})

describe('correctionCents', () => {
  it('pago − previsto só em parcela paga da construtora', () => {
    expect(correctionCents(paid({ paidAmountCents: 153_000 }), 'monthly')).toBe(3_000)
    expect(correctionCents(paid({ paidAmountCents: 149_000 }), 'keys')).toBe(-1_000)
    expect(correctionCents(paid({ paidAmountCents: 150_000 }), 'down_payment')).toBe(0)
    expect(correctionCents(paid({ paidAmountCents: 200_000 }), 'itbi')).toBe(0)
    expect(correctionCents(paid({ paidAmountCents: 200_000 }), null)).toBe(0)
    expect(correctionCents(expense({}), 'monthly')).toBe(0)
  })
})

describe('propertySummary', () => {
  it('imóvel sem gastos: tudo zerado e sem próximo', () => {
    expect(propertySummary(50_000_000, [], KEYS)).toEqual({
      purchasePriceCents: 50_000_000,
      plannedCents: 0,
      paidCents: 0,
      toPayCents: 0,
      paidRatio: 0,
      inccCents: 0,
      constructionInterestCents: 0,
      bySource: {
        own: { paidCents: 0, toPayCents: 0 },
        fgts: { paidCents: 0, toPayCents: 0 },
        financing: { paidCents: 0, toPayCents: 0 },
      },
      next: null,
    })
  })

  it('totais, INCC, taxa de obra, fontes e % pago sobre (pago + a pagar)', () => {
    const expenses = [
      paid({ id: '1', paidAmountCents: 153_000 }),
      paid({ id: '2', expenseTypeId: 'incc', plannedAmountCents: 0, paidAmountCents: 5_000 }),
      paid({ id: '3', expenseTypeId: 'taxa', plannedAmountCents: 20_000, paidAmountCents: 21_000, fundingSource: 'financing' }),
      expense({ id: '4', expenseTypeId: 'itbi', plannedAmountCents: 800_000, fundingSource: 'fgts', dueDate: '2026-12-01' }),
      expense({ id: '5', dueDate: '2026-11-10', description: 'B' }),
      expense({ id: '6', dueDate: '2026-11-10', description: 'A' }),
    ]
    const summary = propertySummary(50_000_000, expenses, KEYS)
    expect(summary.plannedCents).toBe(150_000 + 0 + 20_000 + 800_000 + 150_000 + 150_000)
    expect(summary.paidCents).toBe(153_000 + 5_000 + 21_000)
    expect(summary.toPayCents).toBe(800_000 + 150_000 + 150_000)
    expect(summary.paidRatio).toBeCloseTo(179_000 / (179_000 + 1_100_000))
    expect(summary.inccCents).toBe(3_000 + 5_000)
    expect(summary.constructionInterestCents).toBe(21_000)
    expect(summary.bySource).toEqual({
      own: { paidCents: 158_000, toPayCents: 300_000 },
      fgts: { paidCents: 0, toPayCents: 800_000 },
      financing: { paidCents: 21_000, toPayCents: 0 },
    })
    expect(summary.next?.id).toBe('6')
  })

  it('o próximo pagamento inclui os atrasados', () => {
    const summary = propertySummary(0, [expense({ id: 'late', dueDate: '2026-01-10' }), expense({ id: 'later', dueDate: '2027-01-10' })], KEYS)
    expect(summary.next?.id).toBe('late')
  })
})

describe('totalsByType', () => {
  const types = [
    { id: 'monthly', name: 'Parcelas mensais', sortOrder: 2 },
    { id: 'itbi', name: 'ITBI', sortOrder: 11 },
    { id: 'custom', name: 'Móveis', sortOrder: 22 },
    { id: 'incc', name: 'Correção INCC', sortOrder: 5 },
  ]
  it('previsto, pago e quantidade na ordem dos tipos; tipos sem gasto ficam fora', () => {
    const result = totalsByType(
      [paid({ expenseTypeId: 'itbi', plannedAmountCents: 800_000, paidAmountCents: 800_000 }), expense({}), paid({ paidAmountCents: 151_000 })],
      types,
    )
    expect(result).toEqual([
      { typeId: 'monthly', name: 'Parcelas mensais', plannedCents: 300_000, paidCents: 151_000, count: 2 },
      { typeId: 'itbi', name: 'ITBI', plannedCents: 800_000, paidCents: 800_000, count: 1 },
    ])
  })
  it('sem gastos, lista vazia', () => {
    expect(totalsByType([], types)).toEqual([])
  })
})

describe('propertySchedule', () => {
  it('sem gastos, vazio', () => {
    expect(propertySchedule([], '2029-06-30', '2026-10-05')).toEqual([])
  })

  it('do primeiro mês ao último, inclusive meses vazios, até a entrega das chaves', () => {
    const months = propertySchedule(
      [
        expense({ dueDate: '2026-11-10' }),
        paid({ dueDate: '2026-12-10', paidDate: '2027-01-02', paidAmountCents: 151_000 }),
      ],
      '2027-03-15',
      '2026-12-20',
    )
    expect(months.map((month) => month.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
    expect(months[0]).toEqual({ ym: { year: 2026, month: 11 }, key: '2026-11', plannedCents: 150_000, paidCents: 0, isCurrent: false, isDelivery: false })
    expect(months[1]).toMatchObject({ plannedCents: 150_000, paidCents: 0, isCurrent: true })
    expect(months[2]).toMatchObject({ plannedCents: 0, paidCents: 151_000 })
    expect(months[4]).toMatchObject({ plannedCents: 0, paidCents: 0, isDelivery: true })
  })

  it('entrega antes do primeiro gasto não estende o começo', () => {
    const months = propertySchedule([expense({ dueDate: '2026-11-10' })], '2026-01-10', '2026-10-05')
    expect(months.map((month) => month.key)).toEqual(['2026-11'])
  })
})
