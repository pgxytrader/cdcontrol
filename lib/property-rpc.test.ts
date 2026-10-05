// lib/property-rpc.test.ts
import { describe, expect, it } from 'vitest'
import { expenseRows, payArgs, propertyColumns } from './property-rpc'

describe('propertyColumns', () => {
  it('converte para as colunas de properties', () => {
    expect(
      propertyColumns({
        name: 'Apê',
        developer: null,
        unit: 'Bloco B 302',
        address: null,
        purchasePriceCents: 50_000_000,
        contractDate: '2025-03-10',
        expectedDeliveryDate: '2029-06-30',
        phase: 'pre_keys',
        bank: 'Caixa',
        financedAmountCents: 40_000_000,
        termMonths: 420,
        amortizationSystem: 'sac',
        annualInterestRate: 9.5,
      }),
    ).toEqual({
      name: 'Apê',
      developer: null,
      unit: 'Bloco B 302',
      address: null,
      purchase_price_cents: 50_000_000,
      contract_date: '2025-03-10',
      expected_delivery_date: '2029-06-30',
      phase: 'pre_keys',
      bank: 'Caixa',
      financed_amount_cents: 40_000_000,
      term_months: 420,
      amortization_system: 'sac',
      annual_interest_rate: 9.5,
    })
  })
})

describe('expenseRows', () => {
  it('linhas do create_property_expenses', () => {
    expect(
      expenseRows([
        { expenseTypeId: 't', description: 'ITBI', payee: null, plannedAmountCents: 800_000, dueDate: '2026-12-01', fundingSource: 'fgts', notes: null },
      ]),
    ).toEqual([
      { expense_type_id: 't', description: 'ITBI', payee: null, planned_amount_cents: 800_000, due_date: '2026-12-01', funding_source: 'fgts', notes: null },
    ])
  })
})

describe('payArgs', () => {
  const paid = { paidAmountCents: 153_000, paidDate: '2026-10-02', fundingSource: 'own' as const }
  it('sem lançamento: p_transaction nulo', () => {
    expect(payArgs('e', { ...paid, fundingSource: 'fgts' }, null)).toEqual({
      p_expense_id: 'e',
      p_paid: { paid_amount_cents: 153_000, paid_date: '2026-10-02', funding_source: 'fgts' },
      p_transaction: null,
    })
  })
  it('na conta e no cartão (com o ciclo da fatura)', () => {
    const base = { description: 'Imóvel: X', amountCents: 153_000, date: '2026-10-02', status: 'paid' as const, categoryId: 'c' }
    expect(payArgs('e', paid, { ...base, accountId: 'a', creditCardId: null, cycle: null }).p_transaction).toEqual({
      description: 'Imóvel: X',
      amount_cents: 153_000,
      date: '2026-10-02',
      status: 'paid',
      category_id: 'c',
      account_id: 'a',
      credit_card_id: null,
    })
    const cycle = { closingMonth: '2026-10-01', closingDate: '2026-10-03', dueDate: '2026-10-10', referenceMonth: '2026-10-01' }
    expect(payArgs('e', paid, { ...base, accountId: null, creditCardId: 'k', cycle }).p_transaction).toEqual({
      description: 'Imóvel: X',
      amount_cents: 153_000,
      date: '2026-10-02',
      status: 'paid',
      category_id: 'c',
      account_id: null,
      credit_card_id: 'k',
      closing_month: '2026-10-01',
      closing_date: '2026-10-03',
      due_date: '2026-10-10',
      reference_month: '2026-10-01',
    })
  })
})
