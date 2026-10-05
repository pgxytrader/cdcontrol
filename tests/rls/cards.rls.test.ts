import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureInvoiceArgs, purchaseRpcArgs, scheduleRpcArgs } from '@/lib/card-rpc'
import { accountBalance } from '@/lib/finance/balance'
import { buildCardPurchase, type CardPurchaseInput } from '@/lib/finance/installments'
import { cycleForClosingMonth, cycleForDate, summarizeInvoice } from '@/lib/finance/invoice'
import type { CardSchedule } from '@/lib/finance/types'
import { rowToLedger, TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'
import { createTestContext, type TestUser } from './helpers'

const ctx = createTestContext()
const SCHEDULE: CardSchedule = { closingDay: 3, dueDay: 10 }
const TODAY = '2026-10-04'
const RECORD_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, source, external_id, notes'
const PLAN_COLUMNS =
  'id, credit_card_id, category_id, description, total_amount_cents, installments_count, first_installment_number, purchase_date, first_closing_month'

describe('cartões, faturas e parcelas', () => {
  let a: TestUser
  let b: TestUser
  let houseA: string
  let houseB: string
  let accA: string
  let mercadoA: string
  let reembolsoA: string
  let mercadoB: string
  let cardA: string
  let cardA2: string
  let cardB: string
  let planA: string
  let invoicesA: string[]

  async function insertCard(user: TestUser, householdId: string, name: string): Promise<string> {
    const { data, error } = await user.client
      .from('credit_cards')
      .insert({
        household_id: householdId,
        name,
        brand: 'visa',
        limit_cents: 500_000,
        closing_day: SCHEDULE.closingDay,
        due_day: SCHEDULE.dueDay,
        color: '#3b82f6',
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  }

  async function categoryId(user: TestUser, householdId: string, name: string, kind: 'income' | 'expense'): Promise<string> {
    const { data, error } = await user.client
      .from('categories')
      .select('id')
      .eq('household_id', householdId)
      .eq('name', name)
      .eq('kind', kind)
      .is('parent_id', null)
      .single()
    if (error) throw error
    return data.id as string
  }

  function purchaseArgs(cardId: string, input: CardPurchaseInput, description: string, category: string) {
    return purchaseRpcArgs(cardId, buildCardPurchase(SCHEDULE, input), { type: 'expense', description, categoryId: category, notes: null }, TODAY)
  }

  function tx(householdId: string, fields: Record<string, unknown>) {
    return { household_id: householdId, description: 'Teste', status: 'paid', date: '2026-10-02', ...fields }
  }

  beforeAll(async () => {
    ;[a, b] = await Promise.all([ctx.newUser('card-a'), ctx.newUser('card-b')])
    houseA = await ctx.createHousehold(a, 'Casa Cartão A')
    houseB = await ctx.createHousehold(b, 'Casa Cartão B')
    mercadoA = await categoryId(a, houseA, 'Mercado', 'expense')
    reembolsoA = await categoryId(a, houseA, 'Reembolso', 'income')
    mercadoB = await categoryId(b, houseB, 'Mercado', 'expense')
    const { data: account, error } = await a.client
      .from('accounts')
      .insert({
        household_id: houseA,
        name: 'Conta A',
        type: 'checking',
        initial_balance_cents: 100_000,
        initial_balance_date: '2026-09-01',
        color: '#3b82f6',
      })
      .select('id')
      .single()
    if (error) throw error
    accA = account.id as string
    cardA = await insertCard(a, houseA, 'Cartão A')
    cardA2 = await insertCard(a, houseA, 'Cartão A2')
    cardB = await insertCard(b, houseB, 'Cartão B')
  })

  afterAll(() => ctx.cleanup())

  it('create_card_purchase grava plano, faturas e parcelas (R$ 100,00 em 3x)', async () => {
    const { data: ids, error } = await a.client.rpc(
      'create_card_purchase',
      purchaseArgs(cardA, { mode: 'installments', totalCents: 10_000, count: 3, date: '2026-10-02' }, 'Geladeira', mercadoA),
    )
    expect(error).toBeNull()
    expect(ids).toHaveLength(3)

    const { data: totals } = await a.client
      .from('v_invoice_totals')
      .select('invoice_id, closing_month, total_cents')
      .eq('credit_card_id', cardA)
      .order('closing_month')
    expect(totals!.map((row) => [row.closing_month, Number(row.total_cents)])).toEqual([
      ['2026-10-01', 3334],
      ['2026-11-01', 3333],
      ['2026-12-01', 3333],
    ])
    invoicesA = totals!.map((row) => row.invoice_id as string)

    const { data: rows } = await a.client
      .from('transactions')
      .select('installment_plan_id, installment_number')
      .in('id', ids as string[])
      .order('installment_number')
    expect(rows!.map((row) => row.installment_number)).toEqual([1, 2, 3])
    planA = rows![0].installment_plan_id as string
    const { data: plan } = await a.client.from('installment_plans').select('installments_count, first_closing_month').eq('id', planA).single()
    expect(plan).toEqual({ installments_count: 3, first_closing_month: '2026-10-01' })
  })

  it('outra casa não lê cartões, faturas, planos nem totais', async () => {
    const results = await Promise.all([
      b.client.from('credit_cards').select('id').eq('household_id', houseA),
      b.client.from('card_invoices').select('id').eq('household_id', houseA),
      b.client.from('installment_plans').select('id').eq('household_id', houseA),
      b.client.from('v_invoice_totals').select('invoice_id').eq('household_id', houseA),
    ])
    for (const result of results) {
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    }
  })

  it('outra casa não grava nem usa os RPCs com o cartão de A', async () => {
    const insert = await b.client
      .from('credit_cards')
      .insert({ household_id: houseA, name: 'Intruso', brand: 'visa', closing_day: 1, due_day: 10, color: '#3b82f6' })
    expect(insert.error).not.toBeNull()

    const purchase = await b.client.rpc(
      'create_card_purchase',
      purchaseArgs(cardA, { mode: 'single', amountCents: 100, date: '2026-10-02' }, 'Intrusa', mercadoB),
    )
    expect(purchase.error?.message).toBe('INVALID_CARD')

    const ensure = await b.client.rpc('ensure_invoice', ensureInvoiceArgs(cardA, cycleForDate(SCHEDULE, '2026-10-02')))
    expect(ensure.error?.message).toBe('INVALID_CARD')
  })

  it('o RPC é atômico: uma linha inválida não deixa plano, fatura nem parcela', async () => {
    const args = purchaseArgs(cardA, { mode: 'installments', totalCents: 30_000, count: 3, date: '2030-01-10' }, 'Atômica', mercadoA)
    args.p_rows[1] = { ...args.p_rows[1], category_id: mercadoB }
    const { error } = await a.client.rpc('create_card_purchase', args)
    expect(error?.message).toBe('INVALID_CATEGORY')

    const [plans, invoices, rows] = await Promise.all([
      a.client.from('installment_plans').select('id').eq('description', 'Atômica'),
      a.client.from('card_invoices').select('id').eq('credit_card_id', cardA).gte('closing_month', '2030-01-01'),
      a.client.from('transactions').select('id').eq('description', 'Atômica'),
    ])
    expect(plans.data).toEqual([])
    expect(invoices.data).toEqual([])
    expect(rows.data).toEqual([])
  })

  it('o trigger recusa cartão, fatura e plano que não combinam', async () => {
    const [invOct] = invoicesA
    const base = { type: 'expense', amount_cents: 100, category_id: mercadoA }

    const otherHouseCard = await a.client.from('transactions').insert(tx(houseA, { ...base, credit_card_id: cardB, invoice_id: invOct }))
    expect(otherHouseCard.error?.message).toBe('INVALID_CARD')

    const otherCardInvoice = await a.client.from('transactions').insert(tx(houseA, { ...base, credit_card_id: cardA2, invoice_id: invOct }))
    expect(otherCardInvoice.error?.message).toBe('INVALID_INVOICE')

    const { data: invA2 } = await a.client.rpc('ensure_invoice', ensureInvoiceArgs(cardA2, cycleForDate(SCHEDULE, '2026-10-02')))
    const otherCardPlan = await a.client
      .from('transactions')
      .insert(tx(houseA, { ...base, credit_card_id: cardA2, invoice_id: invA2, installment_plan_id: planA, installment_number: 1 }))
    expect(otherCardPlan.error?.message).toBe('INVALID_PLAN')

    const outOfRange = await a.client
      .from('transactions')
      .insert(tx(houseA, { ...base, credit_card_id: cardA, invoice_id: invOct, installment_plan_id: planA, installment_number: 5 }))
    expect(outOfRange.error?.message).toBe('INVALID_PLAN')
  })

  it('constraints de formato de cada tipo', async () => {
    const [invOct] = invoicesA
    const cases = [
      // conta e cartão ao mesmo tempo
      { type: 'expense', amount_cents: 100, category_id: mercadoA, account_id: accA, credit_card_id: cardA, invoice_id: invOct },
      // despesa no cartão sem fatura
      { type: 'expense', amount_cents: 100, category_id: mercadoA, credit_card_id: cardA },
      // pagamento de fatura sem conta
      { type: 'invoice_payment', amount_cents: 100, credit_card_id: cardA, invoice_id: invOct },
      // estorno parcelado
      {
        type: 'income',
        amount_cents: 100,
        category_id: reembolsoA,
        credit_card_id: cardA,
        invoice_id: invOct,
        installment_plan_id: planA,
        installment_number: 1,
      },
    ]
    for (const fields of cases) {
      const { error } = await a.client.from('transactions').insert(tx(houseA, fields))
      expect(error?.code).toBe('23514')
    }
  })

  it('v_invoice_totals e v_account_balances batem com as funções TypeScript', async () => {
    const [invOct] = invoicesA
    const insert = await a.client.from('transactions').insert([
      tx(houseA, { type: 'income', amount_cents: 500, category_id: reembolsoA, credit_card_id: cardA, invoice_id: invOct }),
      tx(houseA, { type: 'invoice_payment', amount_cents: 3334, date: '2026-10-10', account_id: accA, credit_card_id: cardA, invoice_id: invOct }),
    ])
    expect(insert.error).toBeNull()

    const { data: view } = await a.client
      .from('v_invoice_totals')
      .select('charges_cents, credits_cents, total_cents, paid_cents')
      .eq('invoice_id', invOct)
      .single()
    const { data } = await a.client.from('transactions').select(TRANSACTION_COLUMNS).eq('household_id', houseA)
    const rows = data as unknown as TransactionRow[]
    const expected = summarizeInvoice(rows.filter((row) => row.invoice_id === invOct).map(rowToLedger))
    expect(expected).toEqual({ chargesCents: 3334, creditsCents: 500, totalCents: 2834, paidCents: 3334 })
    expect([view!.charges_cents, view!.credits_cents, view!.total_cents, view!.paid_cents].map(Number)).toEqual([
      expected.chargesCents,
      expected.creditsCents,
      expected.totalCents,
      expected.paidCents,
    ])

    const { data: balance } = await a.client.from('v_account_balances').select('balance_cents').eq('account_id', accA).single()
    expect(Number(balance!.balance_cents)).toBe(96_666)
    expect(Number(balance!.balance_cents)).toBe(
      accountBalance({ id: accA, initialBalanceCents: 100_000, initialBalanceDate: '2026-09-01' }, rows.map(rowToLedger)),
    )
  })

  it('apply_card_schedule move o lançamento e recalcula a fatura aberta', async () => {
    const { data: ids, error } = await a.client.rpc(
      'create_card_purchase',
      purchaseArgs(cardA2, { mode: 'single', amountCents: 10_000, date: '2026-12-20' }, 'Mercado grande', mercadoA),
    )
    expect(error).toBeNull()
    const txId = (ids as string[])[0]
    const { data: before } = await a.client.from('transactions').select('invoice_id, card_invoices(closing_month)').eq('id', txId).single()
    expect(before!.card_invoices).toEqual({ closing_month: '2027-01-01' })
    const januaryId = before!.invoice_id as string

    const newSchedule = { closingDay: 25, dueDay: 5 }
    const apply = await a.client.rpc(
      'apply_card_schedule',
      scheduleRpcArgs(cardA2, newSchedule, {
        invoices: [{ id: januaryId, cycle: cycleForClosingMonth(newSchedule, '2027-01-01') }],
        plans: [],
        moves: [{ transactionId: txId, cycle: cycleForDate(newSchedule, '2026-12-20') }],
      }),
    )
    expect(apply.error).toBeNull()

    const [{ data: after }, { data: card }, { data: january }] = await Promise.all([
      a.client.from('transactions').select('card_invoices(closing_month, closing_date)').eq('id', txId).single(),
      a.client.from('credit_cards').select('closing_day, due_day').eq('id', cardA2).single(),
      a.client.from('card_invoices').select('closing_date, due_date').eq('id', januaryId).single(),
    ])
    expect(after!.card_invoices).toEqual({ closing_month: '2026-12-01', closing_date: '2026-12-25' })
    expect(card).toEqual({ closing_day: 25, due_day: 5 })
    expect(january).toEqual({ closing_date: '2027-01-25', due_date: '2027-02-05' })
  })

  it('restore_transactions recria o plano e as parcelas com os mesmos ids', async () => {
    const { data: plan } = await a.client.from('installment_plans').select(PLAN_COLUMNS).eq('id', planA).single()
    const { data: rows } = await a.client
      .from('transactions')
      .select(RECORD_COLUMNS)
      .eq('installment_plan_id', planA)
      .order('installment_number')
    expect(rows).toHaveLength(3)

    const removed = await a.client.from('installment_plans').delete().eq('id', planA)
    expect(removed.error).toBeNull()
    const { data: gone } = await a.client.from('transactions').select('id').eq('installment_plan_id', planA)
    expect(gone).toEqual([])

    const restore = await a.client.rpc('restore_transactions', {
      p_plan: { ...plan, household_id: houseA },
      p_rows: rows!.map((row) => ({ ...row, household_id: houseA })),
    })
    expect(restore.error).toBeNull()
    const { data: back } = await a.client
      .from('transactions')
      .select(RECORD_COLUMNS)
      .eq('installment_plan_id', planA)
      .order('installment_number')
    expect(back).toEqual(rows)
  })

  it('cartão com lançamentos não pode ser excluído; sem lançamentos leva as faturas vazias', async () => {
    const blocked = await a.client.from('credit_cards').delete().eq('id', cardA)
    expect(blocked.error?.code).toBe('23503')

    const tmp = await insertCard(a, houseA, 'Temporário')
    const { data: invoiceId } = await a.client.rpc('ensure_invoice', ensureInvoiceArgs(tmp, cycleForDate(SCHEDULE, '2026-10-02')))
    expect(invoiceId).toBeTruthy()
    const removed = await a.client.from('credit_cards').delete().eq('id', tmp).select('id')
    expect(removed.data).toHaveLength(1)
    const { data: invoices } = await a.client.from('card_invoices').select('id').eq('credit_card_id', tmp)
    expect(invoices).toEqual([])
  })
})
