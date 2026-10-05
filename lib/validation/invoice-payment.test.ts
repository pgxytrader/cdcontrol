import { describe, expect, it } from 'vitest'
import { invoicePaymentSchema } from './invoice-payment'

const ACC = '11111111-1111-4111-8111-111111111111'

describe('invoicePaymentSchema', () => {
  it('aceita conta, valor, data e status', () => {
    expect(invoicePaymentSchema.parse({ accountId: ACC, amountCents: 3334, date: '2026-10-10', status: 'pending' })).toEqual({
      accountId: ACC,
      amountCents: 3334,
      date: '2026-10-10',
      status: 'pending',
    })
    expect(invoicePaymentSchema.parse({ accountId: ACC, amountCents: 3334, date: '2026-10-10', status: 'paid' }).status).toBe('paid')
  })

  it('exige o status', () => {
    expect(invoicePaymentSchema.safeParse({ accountId: ACC, amountCents: 10, date: '2026-10-10' }).error?.issues[0].message).toBe(
      'Escolha o status.',
    )
    expect(
      invoicePaymentSchema.safeParse({ accountId: ACC, amountCents: 10, date: '2026-10-10', status: 'cancelled' }).error?.issues[0].message,
    ).toBe('Escolha o status.')
  })

  it('recusa valor zero e conta ausente', () => {
    expect(invoicePaymentSchema.safeParse({ accountId: ACC, amountCents: 0, date: '2026-10-10', status: 'paid' }).error?.issues[0].message).toBe(
      'Informe um valor maior que zero.',
    )
    expect(invoicePaymentSchema.safeParse({ accountId: '', amountCents: 10, date: '2026-10-10', status: 'paid' }).error?.issues[0].message).toBe(
      'Escolha a conta.',
    )
  })
})
