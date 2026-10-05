import { describe, expect, it } from 'vitest'
import { defaultStatus, effectiveStatus } from './status'

describe('defaultStatus', () => {
  it('hoje ou passado é pago', () => {
    expect(defaultStatus('2026-10-04', '2026-10-04')).toBe('paid')
    expect(defaultStatus('2026-09-30', '2026-10-04')).toBe('paid')
  })

  it('futuro é pendente', () => {
    expect(defaultStatus('2026-10-05', '2026-10-04')).toBe('pending')
    expect(defaultStatus('2027-01-01', '2026-12-31')).toBe('pending')
  })
})

describe('effectiveStatus', () => {
  const card = { type: 'expense' as const, status: 'pending' as const, date: '2026-10-04', accountId: null }

  it('receita e despesa no cartão seguem a data', () => {
    expect(effectiveStatus(card, '2026-10-04')).toBe('paid')
    expect(effectiveStatus({ ...card, status: 'paid', date: '2026-11-04' }, '2026-10-04')).toBe('pending')
    expect(effectiveStatus({ ...card, type: 'income' }, '2026-10-05')).toBe('paid')
  })

  it('lançamentos em conta e pagamentos de fatura usam o status salvo', () => {
    expect(effectiveStatus({ ...card, accountId: 'acc' }, '2026-12-01')).toBe('pending')
    expect(effectiveStatus({ ...card, type: 'invoice_payment', accountId: 'acc', date: '2026-01-01' }, '2026-12-01')).toBe('pending')
  })
})
