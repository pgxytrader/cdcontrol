// lib/finance/property-payment.test.ts
import { describe, expect, it } from 'vitest'
import { paymentTransaction, propertyTransactionDescription } from './property-payment'

const input = { description: 'Parcela mensal 3/36', paidAmountCents: 153_000, paidDate: '2026-10-02', categoryId: 'imovel' }

describe('propertyTransactionDescription', () => {
  it('prefixo "Imóvel: " e corte em 120', () => {
    expect(propertyTransactionDescription('ITBI')).toBe('Imóvel: ITBI')
    const long = propertyTransactionDescription('x'.repeat(120))
    expect(long).toHaveLength(120)
    expect(long.startsWith('Imóvel: x')).toBe(true)
  })
})

describe('paymentTransaction', () => {
  it('na conta: pago, na data e no valor do pagamento, sem fatura', () => {
    expect(paymentTransaction(input, { kind: 'account', accountId: 'itau' })).toEqual({
      description: 'Imóvel: Parcela mensal 3/36',
      amountCents: 153_000,
      date: '2026-10-02',
      status: 'paid',
      categoryId: 'imovel',
      accountId: 'itau',
      creditCardId: null,
      cycle: null,
    })
  })

  it('no cartão: antes do fechamento cai na fatura do mês; no dia, na seguinte', () => {
    const card = { kind: 'card' as const, creditCardId: 'nubank', schedule: { closingDay: 3, dueDay: 10 }, stored: [] }
    const before = paymentTransaction(input, card)
    expect(before).toMatchObject({ accountId: null, creditCardId: 'nubank', status: 'paid' })
    expect(before.cycle).toMatchObject({ closingDate: '2026-10-03', dueDate: '2026-10-10' })
    const onClosing = paymentTransaction({ ...input, paidDate: '2026-10-03' }, card)
    expect(onClosing.cycle).toMatchObject({ closingDate: '2026-11-03', dueDate: '2026-11-10' })
  })
})
