import { describe, expect, it } from 'vitest'
import { cardUsage, rescheduleCard, usageLevel, type ScheduleInvoice, type SchedulePlan, type ScheduleTransaction } from './card'
import { cycleForClosingMonth } from './invoice'

describe('cardUsage', () => {
  it('usado = totais − pagamentos em todas as faturas', () => {
    expect(
      cardUsage(500_000, [
        { totalCents: 100_000, paidCents: 100_000 },
        { totalCents: 80_000, paidCents: 30_000 },
        { totalCents: 20_000, paidCents: 0 },
      ]),
    ).toEqual({ usedCents: 70_000, availableCents: 430_000, ratio: 0.14 })
  })

  it('limite zero não divide por zero', () => {
    expect(cardUsage(0, [{ totalCents: 1000, paidCents: 0 }])).toEqual({ usedCents: 1000, availableCents: -1000, ratio: 0 })
  })

  it('nível de alerta em 80% e 100%', () => {
    expect(usageLevel(0.79)).toBe('ok')
    expect(usageLevel(0.8)).toBe('warning')
    expect(usageLevel(1)).toBe('over')
  })
})

describe('rescheduleCard', () => {
  // Cartão antigo: fecha dia 25, vence dia 5. Hoje: 20/10/2026.
  const today = '2026-10-20'
  const invoices: ScheduleInvoice[] = [
    { id: 'inv-sep', closingMonth: '2026-09-01', closingDate: '2026-09-25' }, // fechada
    { id: 'inv-oct', closingMonth: '2026-10-01', closingDate: '2026-10-25' },
    { id: 'inv-nov', closingMonth: '2026-11-01', closingDate: '2026-11-25' },
    { id: 'inv-dec', closingMonth: '2026-12-01', closingDate: '2026-12-25' },
  ]

  const single = (id: string, invoiceId: string, date: string): ScheduleTransaction => ({
    id,
    invoiceId,
    date,
    installmentPlanId: null,
    installmentNumber: null,
  })

  it('recalcula as datas das faturas abertas e move a compra que mudou de lado', () => {
    const newSchedule = { closingDay: 15, dueDay: 25 }
    const change = rescheduleCard(
      newSchedule,
      invoices,
      [single('a', 'inv-oct', '2026-10-10'), single('b', 'inv-oct', '2026-10-18')],
      [],
      today,
    )
    expect(change.invoices).toEqual([
      { id: 'inv-oct', cycle: cycleForClosingMonth(newSchedule, '2026-10-01') },
      { id: 'inv-nov', cycle: cycleForClosingMonth(newSchedule, '2026-11-01') },
      { id: 'inv-dec', cycle: cycleForClosingMonth(newSchedule, '2026-12-01') },
    ])
    expect(change.invoices[0].cycle).toMatchObject({ closingDate: '2026-10-15', dueDate: '2026-10-25' })
    expect(change.moves).toEqual([{ transactionId: 'b', cycle: cycleForClosingMonth(newSchedule, '2026-11-01') }])
    expect(change.plans).toEqual([])
  })

  it('destino numa fatura fechada vai para a fatura recalculada mais antiga', () => {
    // Novo fechamento 28: a compra de 26/09 cairia na fatura de setembro, que já fechou
    const change = rescheduleCard({ closingDay: 28, dueDay: 5 }, invoices, [single('c', 'inv-oct', '2026-09-26')], [], today)
    expect(change.moves).toEqual([])
  })

  it('plano normal ainda não cobrado recalcula a âncora; os demais mantêm', () => {
    const newSchedule = { closingDay: 15, dueDay: 25 }
    const plans: SchedulePlan[] = [
      { id: 'p-normal', purchaseDate: '2026-10-18', firstInstallmentNumber: 1, firstClosingMonth: '2026-10-01' },
      { id: 'p-andamento', purchaseDate: '2026-06-01', firstInstallmentNumber: 3, firstClosingMonth: '2026-08-01' },
      { id: 'p-cobrado', purchaseDate: '2026-09-10', firstInstallmentNumber: 1, firstClosingMonth: '2026-09-01' },
    ]
    const installment = (id: string, planId: string, invoiceId: string, k: number): ScheduleTransaction => ({
      id,
      invoiceId,
      date: '2026-10-18',
      installmentPlanId: planId,
      installmentNumber: k,
    })
    const change = rescheduleCard(
      newSchedule,
      invoices,
      [
        installment('n1', 'p-normal', 'inv-oct', 1),
        installment('n2', 'p-normal', 'inv-nov', 2),
        installment('n3', 'p-normal', 'inv-dec', 3),
        installment('a5', 'p-andamento', 'inv-dec', 5),
        installment('c2', 'p-cobrado', 'inv-oct', 2),
      ],
      plans,
      today,
    )
    expect(change.plans).toEqual([{ id: 'p-normal', firstClosingMonth: '2026-11-01' }])
    expect(change.moves).toEqual([
      { transactionId: 'n1', cycle: cycleForClosingMonth(newSchedule, '2026-11-01') },
      { transactionId: 'n2', cycle: cycleForClosingMonth(newSchedule, '2026-12-01') },
      { transactionId: 'n3', cycle: cycleForClosingMonth(newSchedule, '2027-01-01') },
    ])
  })

  it('âncora recalculada antes da fatura aberta mais antiga fica nela', () => {
    // Novo fechamento 28: compra de 26/09 seria setembro (fechada) → âncora vira outubro, parcelas não se sobrepõem
    const plans: SchedulePlan[] = [{ id: 'p', purchaseDate: '2026-09-26', firstInstallmentNumber: 1, firstClosingMonth: '2026-10-01' }]
    const change = rescheduleCard(
      { closingDay: 28, dueDay: 5 },
      invoices,
      [
        { id: 'k1', invoiceId: 'inv-oct', date: '2026-09-26', installmentPlanId: 'p', installmentNumber: 1 },
        { id: 'k2', invoiceId: 'inv-nov', date: '2026-10-26', installmentPlanId: 'p', installmentNumber: 2 },
      ],
      plans,
      today,
    )
    expect(change.plans).toEqual([])
    expect(change.moves).toEqual([])
  })

  it('sem faturas abertas não há nada a mover', () => {
    expect(rescheduleCard({ closingDay: 10, dueDay: 20 }, [invoices[0]], [], [], today)).toEqual({ invoices: [], plans: [], moves: [] })
  })
})
