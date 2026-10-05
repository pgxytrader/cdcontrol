import { describe, expect, it } from 'vitest'
import {
  addMonthsClamped,
  cycleForClosingMonth,
  cycleForDate,
  daysInMonth,
  invoiceStatus,
  resolveCycleForDate,
  shiftClosingMonth,
  summarizeInvoice,
} from './invoice'

const card = { closingDay: 3, dueDay: 10 }

describe('daysInMonth e addMonthsClamped', () => {
  it('sabe quantos dias tem o mês', () => {
    expect(daysInMonth(2027, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it('soma meses ajustando para o último dia', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-11-15', 2)).toBe('2027-01-15')
    expect(addMonthsClamped('2026-01-29', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-10-04', 0)).toBe('2026-10-04')
  })

  it('desloca o mês de fechamento', () => {
    expect(shiftClosingMonth('2026-12-01', 1)).toBe('2027-01-01')
    expect(shiftClosingMonth('2026-01-01', -2)).toBe('2025-11-01')
  })
})

describe('cycleForDate (PRD 8.2)', () => {
  it('compra antes do fechamento cai na fatura que fecha no mesmo mês', () => {
    expect(cycleForDate(card, '2026-10-02')).toEqual({
      closingMonth: '2026-10-01',
      closingDate: '2026-10-03',
      dueDate: '2026-10-10',
      referenceMonth: '2026-10-01',
    })
  })

  it('compra no dia do fechamento vai para a fatura seguinte', () => {
    expect(cycleForDate(card, '2026-10-03')).toEqual({
      closingMonth: '2026-11-01',
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
      referenceMonth: '2026-11-01',
    })
  })

  it('vencimento menor ou igual ao fechamento vence no mês seguinte', () => {
    expect(cycleForDate({ closingDay: 25, dueDay: 5 }, '2026-10-10')).toEqual({
      closingMonth: '2026-10-01',
      closingDate: '2026-10-25',
      dueDate: '2026-11-05',
      referenceMonth: '2026-11-01',
    })
    expect(cycleForClosingMonth({ closingDay: 10, dueDay: 10 }, '2026-10-01').dueDate).toBe('2026-11-10')
  })

  it('vira o ano', () => {
    expect(cycleForDate(card, '2026-12-15')).toEqual({
      closingMonth: '2027-01-01',
      closingDate: '2027-01-03',
      dueDate: '2027-01-10',
      referenceMonth: '2027-01-01',
    })
    expect(cycleForDate({ closingDay: 25, dueDay: 5 }, '2026-12-26')).toMatchObject({
      closingDate: '2027-01-25',
      dueDate: '2027-02-05',
      referenceMonth: '2027-02-01',
    })
  })

  it('fechamento 31 em fevereiro usa o último dia (ano normal e bissexto)', () => {
    const late = { closingDay: 31, dueDay: 8 }
    expect(cycleForClosingMonth(late, '2027-02-01')).toEqual({
      closingMonth: '2027-02-01',
      closingDate: '2027-02-28',
      dueDate: '2027-03-08',
      referenceMonth: '2027-03-01',
    })
    expect(cycleForClosingMonth(late, '2028-02-01').closingDate).toBe('2028-02-29')
    expect(cycleForDate(late, '2027-02-27').closingDate).toBe('2027-02-28')
    expect(cycleForDate(late, '2027-02-28').closingDate).toBe('2027-03-31')
  })

  it('vencimento 31 em mês curto também usa o último dia', () => {
    expect(cycleForClosingMonth({ closingDay: 20, dueDay: 31 }, '2026-11-01').dueDate).toBe('2026-11-30')
  })
})

describe('resolveCycleForDate (fechamento salvo vence)', () => {
  // Fechava dia 15; hoje 20/10 passou a fechar dia 25. A fatura de outubro já fechou em 15/10.
  const raised = { closingDay: 25, dueDay: 5 }
  const octClosed = { closingMonth: '2026-10-01', closingDate: '2026-10-15', dueDate: '2026-11-05', referenceMonth: '2026-11-01' }

  it('compra depois do fechamento salvo vai para a fatura seguinte', () => {
    expect(cycleForDate(raised, '2026-10-21').closingMonth).toBe('2026-10-01')
    expect(resolveCycleForDate(raised, '2026-10-21', [octClosed])).toEqual(cycleForClosingMonth(raised, '2026-11-01'))
  })

  it('no dia do fechamento salvo também vai para a seguinte', () => {
    expect(resolveCycleForDate(raised, '2026-10-15', [octClosed]).closingMonth).toBe('2026-11-01')
  })

  it('compra esquecida, antes do fechamento salvo, fica na fatura fechada', () => {
    expect(resolveCycleForDate(raised, '2026-10-10', [octClosed])).toEqual(octClosed)
  })

  it('sem faturas salvas é o mesmo que cycleForDate', () => {
    for (const date of ['2026-10-02', '2026-10-03', '2026-12-15', '2027-02-28']) {
      expect(resolveCycleForDate(card, date, [])).toEqual(cycleForDate(card, date))
    }
  })

  it('fatura salva aberta usa as datas salvas', () => {
    const storedNov = { closingMonth: '2026-11-01', closingDate: '2026-11-04', dueDate: '2026-11-12', referenceMonth: '2026-11-01' }
    expect(resolveCycleForDate(card, '2026-10-20', [storedNov])).toEqual(storedNov)
  })

  it('a fatura seguinte, se salva, também vem com as datas salvas', () => {
    const novStored = { closingMonth: '2026-11-01', closingDate: '2026-11-24', dueDate: '2026-12-04', referenceMonth: '2026-12-01' }
    expect(resolveCycleForDate(raised, '2026-10-21', [novStored, octClosed])).toEqual(novStored)
  })
})

describe('invoiceStatus (PRD 8.4)', () => {
  const dates = { closingDate: '2026-11-03', dueDate: '2026-11-10' }

  it('aberta antes do fechamento, mesmo já paga', () => {
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 0 }, '2026-11-02')).toBe('open')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 10_000 }, '2026-11-02')).toBe('open')
  })

  it('fechada, paga e vencida', () => {
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 0 }, '2026-11-03')).toBe('closed')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 10_000 }, '2026-11-03')).toBe('paid')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 15_000 }, '2026-11-20')).toBe('paid')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 5_000 }, '2026-11-10')).toBe('closed')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 5_000 }, '2026-11-11')).toBe('overdue')
  })

  it('estorno maior que as compras: fatura fechada já está paga', () => {
    expect(invoiceStatus(dates, { totalCents: -500, paidCents: 0 }, '2026-11-05')).toBe('paid')
  })
})

describe('summarizeInvoice', () => {
  it('compras − estornos; só pagamentos pagos contam como pago', () => {
    expect(
      summarizeInvoice([
        { type: 'expense', status: 'paid', amountCents: 3334 },
        { type: 'expense', status: 'pending', amountCents: 1000 },
        { type: 'income', status: 'paid', amountCents: 500 },
        { type: 'invoice_payment', status: 'paid', amountCents: 2000 },
        { type: 'invoice_payment', status: 'pending', amountCents: 999 },
      ]),
    ).toEqual({ chargesCents: 4334, creditsCents: 500, totalCents: 3834, paidCents: 2000 })
  })
})
