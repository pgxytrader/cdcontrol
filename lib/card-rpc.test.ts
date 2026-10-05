import { describe, expect, it } from 'vitest'
import { ensureInvoiceArgs, purchaseRpcArgs, scheduleRpcArgs } from './card-rpc'
import { buildCardPurchase } from './finance/installments'
import { cycleForClosingMonth, cycleForDate } from './finance/invoice'

const card = { closingDay: 3, dueDay: 10 }

describe('purchaseRpcArgs', () => {
  it('monta o plano e as linhas com o ciclo e o status pela data', () => {
    const purchase = buildCardPurchase(card, { mode: 'installments', totalCents: 10_000, count: 3, date: '2026-10-02' })
    const args = purchaseRpcArgs('card-1', purchase, { type: 'expense', description: 'Geladeira', categoryId: 'cat-1', notes: null }, '2026-10-04')
    expect(args.p_card_id).toBe('card-1')
    expect(args.p_plan).toEqual({
      category_id: 'cat-1',
      description: 'Geladeira',
      total_amount_cents: 10_000,
      installments_count: 3,
      first_installment_number: 1,
      purchase_date: '2026-10-02',
      first_closing_month: '2026-10-01',
    })
    expect(args.p_rows[0]).toEqual({
      type: 'expense',
      description: 'Geladeira',
      amount_cents: 3334,
      date: '2026-10-02',
      status: 'paid',
      category_id: 'cat-1',
      notes: null,
      installment_number: 1,
      closing_month: '2026-10-01',
      closing_date: '2026-10-03',
      due_date: '2026-10-10',
      reference_month: '2026-10-01',
    })
    expect(args.p_rows.map((row) => row.status)).toEqual(['paid', 'pending', 'pending'])
  })

  it('compra à vista e estorno não têm plano', () => {
    const purchase = buildCardPurchase(card, { mode: 'single', amountCents: 500, date: '2026-10-04' })
    const args = purchaseRpcArgs('card-1', purchase, { type: 'income', description: 'Estorno', categoryId: 'cat-2', notes: 'loja' }, '2026-10-04')
    expect(args.p_plan).toBeNull()
    expect(args.p_rows).toHaveLength(1)
    expect(args.p_rows[0]).toMatchObject({ type: 'income', installment_number: null, notes: 'loja' })
  })
})

describe('ensureInvoiceArgs e scheduleRpcArgs', () => {
  it('converte o ciclo para as colunas do banco', () => {
    expect(ensureInvoiceArgs('card-1', cycleForDate(card, '2026-10-02'))).toEqual({
      p_card_id: 'card-1',
      p_closing_month: '2026-10-01',
      p_closing_date: '2026-10-03',
      p_due_date: '2026-10-10',
      p_reference_month: '2026-10-01',
    })
  })

  it('monta faturas, planos e movimentos', () => {
    const schedule = { closingDay: 25, dueDay: 5 }
    const cycle = cycleForClosingMonth(schedule, '2026-11-01')
    expect(
      scheduleRpcArgs('card-1', schedule, {
        invoices: [{ id: 'inv-1', cycle }],
        plans: [{ id: 'plan-1', firstClosingMonth: '2026-11-01' }],
        moves: [{ transactionId: 'tx-1', cycle }],
      }),
    ).toEqual({
      p_card_id: 'card-1',
      p_closing_day: 25,
      p_due_day: 5,
      p_invoices: [{ id: 'inv-1', closing_month: '2026-11-01', closing_date: '2026-11-25', due_date: '2026-12-05', reference_month: '2026-12-01' }],
      p_plans: [{ id: 'plan-1', first_closing_month: '2026-11-01' }],
      p_moves: [{ transaction_id: 'tx-1', closing_month: '2026-11-01', closing_date: '2026-11-25', due_date: '2026-12-05', reference_month: '2026-12-01' }],
    })
  })
})
