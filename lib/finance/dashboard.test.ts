import { describe, expect, it } from 'vitest'
import { dashboardInvoices } from './dashboard'
import type { InvoiceCycle } from './types'

const cycle = (closingMonth: string, closingDate: string, dueDate: string): InvoiceCycle => ({
  closingMonth,
  closingDate,
  dueDate,
  referenceMonth: `${dueDate.slice(0, 7)}-01`,
})

const SEP = cycle('2026-09-01', '2026-09-03', '2026-09-10')
const OCT = cycle('2026-10-01', '2026-10-03', '2026-10-10')
const NOV = cycle('2026-11-01', '2026-11-03', '2026-11-10')
const DEC = cycle('2026-12-01', '2026-12-03', '2026-12-10')
const card = { id: 'nubank', name: 'Nubank', color: '#a855f7', currentCycle: NOV }

describe('dashboardInvoices', () => {
  it('fechadas não quitadas antes (vencida e fechada), depois a do ciclo atual; pagas e futuras fora', () => {
    const result = dashboardInvoices(
      [card],
      [
        { creditCardId: 'nubank', cycle: SEP, totalCents: 1000, paidCents: 1000 },
        { creditCardId: 'nubank', cycle: OCT, totalCents: 5000, paidCents: 2000 },
        { creditCardId: 'nubank', cycle: NOV, totalCents: 3000, paidCents: 0 },
        { creditCardId: 'nubank', cycle: DEC, totalCents: 800, paidCents: 0 },
        { creditCardId: 'outro', cycle: OCT, totalCents: 7000, paidCents: 0 },
      ],
      '2026-10-12',
    )
    expect(result).toEqual([
      { cardId: 'nubank', cardName: 'Nubank', cardColor: '#a855f7', cycle: OCT, totalCents: 5000, remainingCents: 3000, status: 'overdue' },
      { cardId: 'nubank', cardName: 'Nubank', cardColor: '#a855f7', cycle: NOV, totalCents: 3000, remainingCents: 3000, status: 'open' },
    ])
  })
  it('fatura fechada dentro do prazo aparece como "closed"', () => {
    const result = dashboardInvoices([card], [{ creditCardId: 'nubank', cycle: OCT, totalCents: 5000, paidCents: 0 }], '2026-10-05')
    expect(result[0].status).toBe('closed')
  })
  it('ciclo atual ainda sem fatura sai zerado', () => {
    expect(dashboardInvoices([card], [], '2026-10-12')).toEqual([
      { cardId: 'nubank', cardName: 'Nubank', cardColor: '#a855f7', cycle: NOV, totalCents: 0, remainingCents: 0, status: 'open' },
    ])
  })
  it('sem cartões, lista vazia', () => {
    expect(dashboardInvoices([], [], '2026-10-12')).toEqual([])
  })
})
