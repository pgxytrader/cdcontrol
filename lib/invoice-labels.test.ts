import { describe, expect, it } from 'vitest'
import { invoiceHref, invoiceTitle, parseInvoiceParam, paymentDescription } from './invoice-labels'

describe('rótulos da fatura', () => {
  it('descrição do pagamento', () => {
    expect(paymentDescription('Nubank', '2026-11-01')).toBe('Pagamento fatura Nubank (nov/2026)')
    expect(paymentDescription('Inter', '2027-03-01')).toBe('Pagamento fatura Inter (mar/2027)')
  })

  it('título pelo mês do vencimento', () => {
    expect(invoiceTitle('2026-11-01')).toBe('Fatura de Novembro 2026')
  })

  it('?fatura= aceita só AAAA-MM válido', () => {
    expect(parseInvoiceParam('2026-11')).toBe('2026-11-01')
    expect(parseInvoiceParam(['2026-12', 'x'])).toBe('2026-12-01')
    expect(parseInvoiceParam('xyz')).toBeNull()
    expect(parseInvoiceParam('2026-13')).toBeNull()
    expect(parseInvoiceParam(undefined)).toBeNull()
  })

  it('link da fatura', () => {
    expect(invoiceHref('card-1', '2026-11-01')).toBe('/cartoes/card-1?fatura=2026-11')
  })
})
