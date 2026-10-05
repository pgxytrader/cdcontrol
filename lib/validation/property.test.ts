// lib/validation/property.test.ts
import { describe, expect, it } from 'vitest'
import { expenseSchema, expenseTypeSchema, paymentSchema, planSchema, propertySchema } from './property'

const UUID = '0b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'
const UUID2 = '1b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'

describe('propertySchema', () => {
  it('só nome e valor obrigatórios; vazios viram null', () => {
    const parsed = propertySchema.parse({ name: ' Apê Centro ', purchasePriceCents: 50_000_000, developer: '', unit: '', address: '', bank: '' })
    expect(parsed).toMatchObject({
      name: 'Apê Centro',
      developer: null,
      unit: null,
      address: null,
      contractDate: null,
      expectedDeliveryDate: null,
      phase: 'pre_keys',
      bank: null,
      financedAmountCents: null,
      termMonths: null,
      amortizationSystem: null,
      annualInterestRate: null,
    })
  })
  it('recusa nome vazio, prazo acima de 600 e juros acima de 100', () => {
    expect(propertySchema.safeParse({ name: '', purchasePriceCents: 1 }).success).toBe(false)
    expect(propertySchema.safeParse({ name: 'A', purchasePriceCents: 1, termMonths: 601 }).success).toBe(false)
    expect(propertySchema.safeParse({ name: 'A', purchasePriceCents: 1, annualInterestRate: 100.5 }).success).toBe(false)
  })
})

describe('expenseSchema', () => {
  it('aceita previsto 0 e normaliza favorecido vazio', () => {
    const parsed = expenseSchema.parse({
      propertyId: UUID,
      expenseTypeId: UUID2,
      description: 'ITBI',
      payee: '',
      plannedAmountCents: 0,
      dueDate: '2026-12-01',
      fundingSource: 'fgts',
      notes: '',
    })
    expect(parsed).toMatchObject({ payee: null, notes: null, plannedAmountCents: 0, fundingSource: 'fgts' })
  })
})

describe('paymentSchema', () => {
  const base = { expenseId: UUID, paidAmountCents: 153_000, paidDate: '2026-10-05', fundingSource: 'own', launch: true, source: { kind: 'account', id: UUID2 }, categoryId: UUID }
  it('pagamento com data futura é recusado no campo da data', () => {
    const result = paymentSchema('2026-10-05').safeParse({ ...base, paidDate: '2026-10-06' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['paidDate'])
  })
  it('recursos próprios com "Lançar" exige conta/cartão e categoria', () => {
    const result = paymentSchema('2026-10-05').safeParse({ ...base, source: null, categoryId: null })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(['categoryId', 'source'])
  })
  it('FGTS nunca lança, mesmo com launch ligado', () => {
    const parsed = paymentSchema('2026-10-05').parse({ ...base, fundingSource: 'fgts', source: null, categoryId: null })
    expect(parsed.launch).toBe(false)
  })
})

describe('planSchema', () => {
  it('exige ao menos um bloco', () => {
    expect(planSchema.safeParse({ propertyId: UUID, fundingSource: 'own', monthly: null, intermediate: null, keys: null }).success).toBe(false)
  })
  it('limites de quantidade e intervalo das intermediárias', () => {
    const ok = { propertyId: UUID, fundingSource: 'own', monthly: { amountCents: 1, count: 360, firstDueDate: '2026-11-10' }, intermediate: null, keys: null }
    expect(planSchema.safeParse(ok).success).toBe(true)
    expect(planSchema.safeParse({ ...ok, monthly: { ...ok.monthly, count: 361 } }).success).toBe(false)
    expect(
      planSchema.safeParse({ ...ok, intermediate: { amountCents: 1, count: 2, firstDueDate: '2026-12-15', everyMonths: 3 } }).success,
    ).toBe(false)
  })
})

describe('datas fora de 2000–2100', () => {
  const MSG = 'Use uma data entre 2000 e 2100.'
  const plan = { propertyId: UUID, fundingSource: 'own', monthly: null, intermediate: null, keys: null }
  it('expenseSchema recusa vencimento em 2206', () => {
    const result = expenseSchema.safeParse({
      propertyId: UUID,
      expenseTypeId: UUID2,
      description: 'X',
      plannedAmountCents: 1,
      dueDate: '2206-03-10',
      fundingSource: 'own',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.find((i) => i.path[0] === 'dueDate')?.message).toBe(MSG)
  })
  it('planSchema recusa chaves em 2101', () => {
    const result = planSchema.safeParse({ ...plan, keys: { amountCents: 1, dueDate: '2101-01-10' } })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path.join('.') === 'keys.dueDate' && i.message === MSG)).toBe(true)
  })
  it('planSchema recusa mensais cuja última parcela passa de 2100', () => {
    const result = planSchema.safeParse({ ...plan, monthly: { amountCents: 1, count: 360, firstDueDate: '2080-01-10' } })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path.join('.') === 'monthly.firstDueDate' && i.message === MSG)).toBe(true)
  })
  it('planSchema recusa intermediárias cuja última passa de 2100', () => {
    const result = planSchema.safeParse({ ...plan, intermediate: { amountCents: 1, count: 60, firstDueDate: '2050-01-10', everyMonths: 12 } })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path.join('.') === 'intermediate.firstDueDate')).toBe(true)
  })
  it('plano normal passa', () => {
    expect(
      planSchema.safeParse({ ...plan, monthly: { amountCents: 1, count: 360, firstDueDate: '2026-11-10' }, keys: { amountCents: 1, dueDate: '2100-12-31' } }).success,
    ).toBe(true)
  })
})

describe('expenseTypeSchema', () => {
  it('nome 1–60 e fase típica válida', () => {
    expect(expenseTypeSchema.safeParse({ name: 'Móveis', typicalPhase: 'post_keys' }).success).toBe(true)
    expect(expenseTypeSchema.safeParse({ name: '', typicalPhase: 'post_keys' }).success).toBe(false)
    expect(expenseTypeSchema.safeParse({ name: 'X', typicalPhase: 'nunca' }).success).toBe(false)
  })
})
