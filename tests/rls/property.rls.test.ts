// tests/rls/property.rls.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestUser } from './helpers'

const ctx = createTestContext()
const TX_COLUMNS =
  'id, household_id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, source, external_id, notes, recurrence_id, occurrence_date'
const EXPENSE_COLUMNS =
  'id, household_id, property_id, expense_type_id, description, payee, planned_amount_cents, due_date, status, paid_amount_cents, paid_date, funding_source, transaction_id, notes'

describe('imóvel', () => {
  let a: TestUser
  let b: TestUser
  let houseA: string
  let houseB: string
  let accA: string
  let cardA: string
  let imovelA: string
  let mercadoA: string
  let monthlyA: string
  let fgtsTypeA: string
  let monthlyB: string
  let propertyA: string

  async function typeId(user: TestUser, householdId: string, key: string): Promise<string> {
    const { data, error } = await user.client
      .from('property_expense_types')
      .select('id')
      .eq('household_id', householdId)
      .eq('system_key', key)
      .single()
    if (error) throw error
    return data.id as string
  }

  async function categoryId(user: TestUser, householdId: string, name: string): Promise<string> {
    const { data, error } = await user.client
      .from('categories')
      .select('id')
      .eq('household_id', householdId)
      .eq('name', name)
      .eq('kind', 'expense')
      .is('parent_id', null)
      .single()
    if (error) throw error
    return data.id as string
  }

  async function newExpense(description = 'Parcela mensal 1/36', planned = 150_000): Promise<string> {
    const { data, error } = await a.client.rpc('create_property_expenses', {
      p_property_id: propertyA,
      p_rows: [
        {
          expense_type_id: monthlyA,
          description,
          payee: 'Construtora',
          planned_amount_cents: planned,
          due_date: '2026-11-10',
          funding_source: 'own',
          notes: null,
        },
      ],
    })
    if (error) throw error
    return (data as string[])[0]
  }

  function accountTx(amount: number, date = '2026-10-05', account = accA) {
    return {
      description: 'Imóvel: Parcela mensal 1/36',
      amount_cents: amount,
      date,
      status: 'paid',
      category_id: imovelA,
      account_id: account,
      credit_card_id: null,
    }
  }

  async function expense(id: string) {
    const { data, error } = await a.client.from('property_expenses').select(EXPENSE_COLUMNS).eq('id', id).single()
    if (error) throw error
    return data
  }

  beforeAll(async () => {
    ;[a, b] = await Promise.all([ctx.newUser('prop-a'), ctx.newUser('prop-b')])
    houseA = await ctx.createHousehold(a, 'Casa Imóvel A')
    houseB = await ctx.createHousehold(b, 'Casa Imóvel B')
    imovelA = await categoryId(a, houseA, 'Imóvel')
    mercadoA = await categoryId(a, houseA, 'Mercado')
    monthlyA = await typeId(a, houseA, 'monthly')
    fgtsTypeA = await typeId(a, houseA, 'itbi')
    monthlyB = await typeId(b, houseB, 'monthly')
    const { data: acc, error: accError } = await a.client
      .from('accounts')
      .insert({ household_id: houseA, name: 'Conta A', type: 'checking', initial_balance_cents: 0, initial_balance_date: '2026-01-01', color: '#3b82f6' })
      .select('id')
      .single()
    if (accError) throw accError
    accA = acc.id as string
    const { data: card, error: cardError } = await a.client
      .from('credit_cards')
      .insert({ household_id: houseA, name: 'Cartão A', brand: 'visa', limit_cents: 500_000, closing_day: 3, due_day: 10, color: '#3b82f6' })
      .select('id')
      .single()
    if (cardError) throw cardError
    cardA = card.id as string
    const { data: property, error: propertyError } = await a.client
      .from('properties')
      .insert({ household_id: houseA, name: 'Apê Centro', purchase_price_cents: 50_000_000, expected_delivery_date: '2029-06-30' })
      .select('id')
      .single()
    if (propertyError) throw propertyError
    propertyA = property.id as string
  })

  afterAll(() => ctx.cleanup())

  it('a casa nasce com os 21 tipos de gasto padrão', async () => {
    const { data, error } = await a.client.from('property_expense_types').select('system_key, is_default, sort_order').eq('household_id', houseA)
    expect(error).toBeNull()
    expect(data).toHaveLength(21)
    expect(data!.every((row) => row.is_default)).toBe(true)
    expect(new Set(data!.map((row) => row.system_key))).toContain('construction_interest')
  })

  it('outra casa não lê nem altera imóvel, tipos e gastos', async () => {
    const id = await newExpense()
    const { data: props } = await b.client.from('properties').select('id').eq('id', propertyA)
    expect(props).toEqual([])
    const { data: types } = await b.client.from('property_expense_types').select('id').eq('household_id', houseA)
    expect(types).toEqual([])
    const { data: rows } = await b.client.from('property_expenses').select('id').eq('id', id)
    expect(rows).toEqual([])

    const created = await b.client.rpc('create_property_expenses', {
      p_property_id: propertyA,
      p_rows: [{ expense_type_id: monthlyB, description: 'X', planned_amount_cents: 1, due_date: '2026-11-10' }],
    })
    expect(created.error?.message).toBe('INVALID_PROPERTY')
    const paid = await b.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 1, paid_date: '2026-10-05', funding_source: 'fgts' },
      p_transaction: null,
    })
    expect(paid.error?.message).toBe('INVALID_EXPENSE')
    expect((await b.client.rpc('delete_property', { p_property_id: propertyA })).error?.message).toBe('INVALID_PROPERTY')
    expect((await expense(id)).status).toBe('planned')
  })

  it('gasto não aceita tipo de outra casa', async () => {
    const { error } = await a.client.rpc('create_property_expenses', {
      p_property_id: propertyA,
      p_rows: [{ expense_type_id: monthlyB, description: 'Tipo alheio', planned_amount_cents: 100, due_date: '2026-11-10' }],
    })
    expect(error?.message).toBe('INVALID_EXPENSE_TYPE')
  })

  it('pagar com recursos próprios cria um lançamento ligado; editar atualiza; desmarcar apaga', async () => {
    const id = await newExpense()
    const { data: txId, error } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 153_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(153_000),
    })
    expect(error).toBeNull()
    const paid = await expense(id)
    expect(paid).toMatchObject({ status: 'paid', paid_amount_cents: 153_000, paid_date: '2026-10-05', transaction_id: txId })
    const { data: tx } = await a.client.from('transactions').select('type, amount_cents, source, category_id, account_id, status').eq('id', txId as string).single()
    expect(tx).toEqual({ type: 'expense', amount_cents: 153_000, source: 'property', category_id: imovelA, account_id: accA, status: 'paid' })

    const edited = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 155_000, paid_date: '2026-10-04', funding_source: 'own' },
      p_transaction: accountTx(155_000, '2026-10-04'),
    })
    expect(edited.data).toBe(txId)
    const { data: updated } = await a.client.from('transactions').select('amount_cents, date').eq('id', txId as string).single()
    expect(updated).toEqual({ amount_cents: 155_000, date: '2026-10-04' })

    expect((await a.client.rpc('unpay_property_expense', { p_expense_id: id })).error).toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'planned', paid_amount_cents: null, paid_date: null, transaction_id: null })
    const { data: gone } = await a.client.from('transactions').select('id').eq('id', txId as string)
    expect(gone).toEqual([])
  })

  it('trocar a fonte para FGTS apaga o lançamento ligado', async () => {
    const id = await newExpense('ITBI', 800_000)
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 800_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(800_000),
    })
    const { error } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 800_000, paid_date: '2026-10-05', funding_source: 'fgts' },
      p_transaction: null,
    })
    expect(error).toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'paid', funding_source: 'fgts', transaction_id: null })
    const { data: gone } = await a.client.from('transactions').select('id').eq('id', txId as string)
    expect(gone).toEqual([])
  })

  it('no cartão o lançamento vai para a fatura informada', async () => {
    const id = await newExpense('Vistoria', 60_000)
    const { data: txId, error } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 60_000, paid_date: '2026-10-02', funding_source: 'own' },
      p_transaction: {
        ...accountTx(60_000, '2026-10-02', ''),
        account_id: null,
        credit_card_id: cardA,
        closing_month: '2026-10-01',
        closing_date: '2026-10-03',
        due_date: '2026-10-10',
        reference_month: '2026-10-01',
      },
    })
    expect(error).toBeNull()
    const { data: tx } = await a.client.from('transactions').select('credit_card_id, invoice_id, card_invoices(closing_month)').eq('id', txId as string).single()
    expect(tx!.credit_card_id).toBe(cardA)
    expect(tx!.card_invoices).toEqual({ closing_month: '2026-10-01' })
  })

  it('o lançamento ligado só muda pelo RPC; descrição e fatura continuam livres', async () => {
    const id = await newExpense()
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 150_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(150_000),
    })
    const amount = await a.client.from('transactions').update({ amount_cents: 1 }).eq('id', txId as string)
    expect(amount.error?.message).toBe('PROPERTY_LOCKED')
    const category = await a.client.from('transactions').update({ category_id: mercadoA }).eq('id', txId as string)
    expect(category.error?.message).toBe('PROPERTY_LOCKED')
    const description = await a.client.from('transactions').update({ description: 'Imóvel: mensal de outubro' }).eq('id', txId as string)
    expect(description.error).toBeNull()

    const inserted = await a.client.from('transactions').insert({
      household_id: houseA,
      type: 'expense',
      description: 'Falso',
      amount_cents: 100,
      date: '2026-10-05',
      status: 'paid',
      category_id: imovelA,
      account_id: accA,
      source: 'property',
    })
    expect(inserted.error?.message).toBe('PROPERTY_LOCKED')
  })

  it('a fatura de um lançamento ligado no cartão pode mudar (dias do cartão)', async () => {
    const id = await newExpense('Ligações', 30_000)
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 30_000, paid_date: '2026-10-02', funding_source: 'own' },
      p_transaction: {
        ...accountTx(30_000, '2026-10-02'),
        account_id: null,
        credit_card_id: cardA,
        closing_month: '2026-10-01',
        closing_date: '2026-10-03',
        due_date: '2026-10-10',
        reference_month: '2026-10-01',
      },
    })
    const { data: next } = await a.client.rpc('ensure_invoice', {
      p_card_id: cardA,
      p_closing_month: '2026-11-01',
      p_closing_date: '2026-11-03',
      p_due_date: '2026-11-10',
      p_reference_month: '2026-11-01',
    })
    const moved = await a.client.from('transactions').update({ invoice_id: next as string }).eq('id', txId as string)
    expect(moved.error).toBeNull()
  })

  it('excluir o lançamento volta o gasto para previsto', async () => {
    const id = await newExpense()
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 150_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(150_000),
    })
    expect((await a.client.from('transactions').delete().eq('id', txId as string)).error).toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'planned', paid_amount_cents: null, paid_date: null, transaction_id: null })
  })

  it('pagar é atômico: categoria inválida não deixa o gasto pago', async () => {
    const id = await newExpense()
    const { error } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 150_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: { ...accountTx(150_000), category_id: '00000000-0000-4000-8000-000000000000' },
    })
    expect(error).not.toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'planned', transaction_id: null })
  })

  it('excluir gastos apaga os lançamentos; restaurar devolve os dois', async () => {
    const id = await newExpense()
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 150_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(150_000),
    })
    const before = await expense(id)
    const { data: txRows } = await a.client.from('transactions').select(TX_COLUMNS).eq('id', txId as string)

    expect((await a.client.rpc('delete_property_expenses', { p_ids: [id] })).error).toBeNull()
    expect((await a.client.from('transactions').select('id').eq('id', txId as string)).data).toEqual([])

    const restored = await a.client.rpc('restore_property_expenses', { p_expenses: [before], p_transactions: txRows })
    expect(restored.error).toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'paid', transaction_id: txId })
    const { data: tx } = await a.client.from('transactions').select('source').eq('id', txId as string).single()
    expect(tx).toEqual({ source: 'property' })
  })

  it('tipo usado por um gasto não pode ser excluído', async () => {
    await newExpense()
    const { error } = await a.client.from('property_expense_types').delete().eq('id', monthlyA)
    expect(error?.code).toBe('23503')
  })

  it('delete_property apaga o imóvel, os gastos e os lançamentos ligados', async () => {
    const { data: property } = await a.client
      .from('properties')
      .insert({ household_id: houseA, name: 'Casa Praia', purchase_price_cents: 1_000 })
      .select('id')
      .single()
    const { data: ids } = await a.client.rpc('create_property_expenses', {
      p_property_id: property!.id,
      p_rows: [{ expense_type_id: fgtsTypeA, description: 'ITBI', planned_amount_cents: 100, due_date: '2026-10-01' }],
    })
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: (ids as string[])[0],
      p_paid: { paid_amount_cents: 100, paid_date: '2026-10-01', funding_source: 'own' },
      p_transaction: accountTx(100, '2026-10-01'),
    })
    expect((await a.client.rpc('delete_property', { p_property_id: property!.id })).error).toBeNull()
    expect((await a.client.from('property_expenses').select('id').in('id', ids as string[])).data).toEqual([])
    expect((await a.client.from('transactions').select('id').eq('id', txId as string)).data).toEqual([])
  })
})
