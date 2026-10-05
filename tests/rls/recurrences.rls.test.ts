import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { budgetChange, type BudgetRow } from '@/lib/finance/budget'
import {
  buildOccurrences,
  changeFollowing,
  createSeries,
  occurrenceDates,
  removeFollowing,
  type Series,
  type SeriesTransaction,
} from '@/lib/finance/recurrence'
import { budgetChangeArgs, changeArgs, createRecurrenceArgs, generateArgs } from '@/lib/recurrence-rpc'
import { createTestContext, type TestUser } from './helpers'

const ctx = createTestContext()
const TODAY = '2026-10-05'
const RECORD_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, recurrence_id, occurrence_date, source, external_id, notes'
const RECURRENCE_COLUMNS =
  'id, type, description, amount_cents, category_id, account_id, destination_account_id, credit_card_id, frequency, start_date, end_date, generated_until, notes'

type SeriesRow = { id: string; occurrence_date: string; type: 'expense'; status: 'paid' | 'pending'; date: string; account_id: string | null }

const toSeriesTransaction = (row: SeriesRow): SeriesTransaction => ({
  id: row.id,
  occurrenceDate: row.occurrence_date,
  type: row.type,
  status: row.status,
  date: row.date,
  accountId: row.account_id,
})

describe('recorrências e orçamento', () => {
  let a: TestUser
  let b: TestUser
  let houseA: string
  let houseB: string
  let accA: string
  let accB: string
  let mercadoA: string
  let salarioA: string
  let feiraA: string
  let mercadoB: string
  let cardA: string

  async function insertAccount(user: TestUser, householdId: string, name: string): Promise<string> {
    const { data, error } = await user.client
      .from('accounts')
      .insert({
        household_id: householdId,
        name,
        type: 'checking',
        initial_balance_cents: 0,
        initial_balance_date: '2026-01-01',
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

  function rent(overrides: Partial<Series> = {}): Series {
    return {
      type: 'expense',
      description: 'Aluguel',
      amountCents: 200_000,
      categoryId: mercadoA,
      accountId: accA,
      destinationAccountId: null,
      creditCardId: null,
      notes: null,
      frequency: 'monthly',
      startDate: '2026-10-10',
      endDate: null,
      ...overrides,
    }
  }

  async function createRent(series: Series = rent()): Promise<string> {
    const { data, error } = await a.client.rpc('create_recurrence', createRecurrenceArgs(houseA, series, createSeries(series, 'paid', null, TODAY)))
    if (error) throw error
    return data as string
  }

  async function countRows(recurrenceId: string): Promise<number> {
    const { count, error } = await a.client.from('transactions').select('id', { count: 'exact', head: true }).eq('recurrence_id', recurrenceId)
    if (error) throw error
    return count ?? 0
  }

  async function seriesTransactions(recurrenceId: string): Promise<SeriesTransaction[]> {
    const { data, error } = await a.client
      .from('transactions')
      .select('id, occurrence_date, type, status, date, account_id')
      .eq('recurrence_id', recurrenceId)
    if (error) throw error
    return (data as SeriesRow[]).map(toSeriesTransaction)
  }

  beforeAll(async () => {
    ;[a, b] = await Promise.all([ctx.newUser('rec-a'), ctx.newUser('rec-b')])
    houseA = await ctx.createHousehold(a, 'Casa Recorrência A')
    houseB = await ctx.createHousehold(b, 'Casa Recorrência B')
    mercadoA = await categoryId(a, houseA, 'Mercado', 'expense')
    salarioA = await categoryId(a, houseA, 'Salário', 'income')
    mercadoB = await categoryId(b, houseB, 'Mercado', 'expense')
    const { data: feira, error } = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'Feira', kind: 'expense', parent_id: mercadoA, icon: 'shopping-cart', color: '#22c55e' })
      .select('id')
      .single()
    if (error) throw error
    feiraA = feira.id as string
    accA = await insertAccount(a, houseA, 'Conta A')
    accB = await insertAccount(b, houseB, 'Conta B')
    const { data: card, error: cardError } = await a.client
      .from('credit_cards')
      .insert({ household_id: houseA, name: 'Cartão A', brand: 'visa', limit_cents: 500_000, closing_day: 3, due_day: 10, color: '#3b82f6' })
      .select('id')
      .single()
    if (cardError) throw cardError
    cardA = card.id as string
  })

  afterAll(() => ctx.cleanup())

  it('create_recurrence grava a série e as ocorrências; gerar a mesma janela de novo não duplica', async () => {
    const series = rent()
    const id = await createRent(series)
    expect(await countRows(id)).toBe(12)

    const { data: recurrence } = await a.client.from('recurrences').select('generated_until').eq('id', id).single()
    expect(recurrence!.generated_until).toBe('2027-10-05')
    const { data: first } = await a.client
      .from('transactions')
      .select('status, source, occurrence_date')
      .eq('recurrence_id', id)
      .eq('occurrence_date', '2026-10-10')
      .single()
    expect(first).toEqual({ status: 'paid', source: 'recurrence', occurrence_date: '2026-10-10' })

    // Duas sessões gerando a mesma janela
    const occurrences = buildOccurrences(occurrenceDates(series, '2026-11-01', '2027-10-05'), null, TODAY)
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await a.client.rpc('generate_recurrence_occurrences', generateArgs(id, series, occurrences, '2027-10-05'))
      expect(error).toBeNull()
    }
    expect(await countRows(id)).toBe(12)
  })

  it('no cartão cada ocorrência vai para a fatura da regra 8.2', async () => {
    const series = rent({ description: 'Streaming', amountCents: 5_590, accountId: null, creditCardId: cardA, startDate: '2026-10-02' })
    const card = { schedule: { closingDay: 3, dueDay: 10 }, stored: [] }
    const { data: id, error } = await a.client.rpc('create_recurrence', createRecurrenceArgs(houseA, series, createSeries(series, 'pending', card, TODAY)))
    expect(error).toBeNull()
    const { data: rows } = await a.client
      .from('transactions')
      .select('date, card_invoices(closing_month)')
      .eq('recurrence_id', id)
      .order('date')
      .limit(2)
    const pairs = (rows as unknown as { date: string; card_invoices: { closing_month: string } }[]).map((row) => [
      row.date,
      row.card_invoices.closing_month,
    ])
    expect(pairs).toEqual([
      ['2026-10-02', '2026-10-01'],
      ['2026-11-02', '2026-11-01'],
    ])
  })

  it('outra casa não lê nem usa os RPCs com a série, a categoria ou a casa de A', async () => {
    const id = await createRent(rent({ description: 'Isolada' }))
    expect((await b.client.from('recurrences').select('id').eq('id', id)).data).toEqual([])
    expect((await b.client.from('transactions').select('id').eq('recurrence_id', id)).data).toEqual([])

    const generate = await b.client.rpc('generate_recurrence_occurrences', { p_recurrence_id: id, p_rows: [], p_generated_until: '2030-01-01' })
    expect(generate.error?.message).toBe('INVALID_RECURRENCE')
    const change = await b.client.rpc('apply_recurrence_change', {
      p_recurrence_id: id,
      p_patch: {},
      p_delete_ids: [],
      p_rows: [],
      p_generated_until: '2030-01-01',
    })
    expect(change.error?.message).toBe('INVALID_RECURRENCE')
    const budget = await b.client.rpc('apply_budget_change', budgetChangeArgs(mercadoA, budgetChange([], mercadoA, '2026-10-01', 100, 'from')))
    expect(budget.error?.message).toBe('INVALID_BUDGET_CATEGORY')
    const foreign = await b.client.rpc('create_recurrence', createRecurrenceArgs(houseA, rent(), createSeries(rent(), 'paid', null, TODAY)))
    expect(foreign.error).not.toBeNull()

    await a.client.rpc('apply_budget_change', budgetChangeArgs(mercadoA, budgetChange([], mercadoA, '2026-10-01', 100, 'from')))
    expect((await b.client.from('budgets').select('id').eq('household_id', houseA)).data).toEqual([])
  })

  it('os triggers recusam referências de outra casa e categorias erradas', async () => {
    const base = {
      household_id: houseA,
      type: 'expense',
      description: 'Teste',
      amount_cents: 100,
      frequency: 'monthly',
      start_date: '2026-10-10',
      generated_until: '2026-10-10',
    }
    expect((await a.client.from('recurrences').insert({ ...base, category_id: mercadoA, account_id: accB })).error?.message).toBe(
      'INVALID_ACCOUNT',
    )
    expect((await a.client.from('recurrences').insert({ ...base, category_id: salarioA, account_id: accA })).error?.message).toBe(
      'CATEGORY_KIND_MISMATCH',
    )

    const budget = (categoryIdValue: string) =>
      a.client.from('budgets').insert({ household_id: houseA, category_id: categoryIdValue, month: '2026-10-01', amount_cents: 100 })
    expect((await budget(feiraA)).error?.message).toBe('INVALID_BUDGET_CATEGORY')
    expect((await budget(salarioA)).error?.message).toBe('INVALID_BUDGET_CATEGORY')
    expect((await budget(mercadoB)).error?.message).toBe('INVALID_BUDGET_CATEGORY')

    // Lançamento de A ligado a uma série de B
    const seriesB: Series = { ...rent(), categoryId: mercadoB, accountId: accB }
    const { data: idB, error } = await b.client.rpc('create_recurrence', createRecurrenceArgs(houseB, seriesB, createSeries(seriesB, 'paid', null, TODAY)))
    expect(error).toBeNull()
    const linked = await a.client.from('transactions').insert({
      household_id: houseA,
      type: 'expense',
      description: 'Teste',
      amount_cents: 100,
      date: '2026-10-10',
      status: 'paid',
      category_id: mercadoA,
      account_id: accA,
      recurrence_id: idB,
      occurrence_date: '2026-10-10',
    })
    expect(linked.error?.message).toBe('INVALID_RECURRENCE')
  })

  it('constraints de formato', async () => {
    const base = {
      household_id: houseA,
      type: 'expense',
      description: 'Teste',
      amount_cents: 100,
      frequency: 'monthly',
      start_date: '2026-10-10',
      generated_until: '2026-10-10',
    }
    const shape = async (fields: Record<string, unknown>) => (await a.client.from('recurrences').insert({ ...base, ...fields })).error?.code
    expect(await shape({ category_id: mercadoA, account_id: accA, credit_card_id: cardA })).toBe('23514')
    expect(await shape({ type: 'income', category_id: salarioA, credit_card_id: cardA })).toBe('23514')
    expect(await shape({ type: 'transfer', account_id: accA, destination_account_id: accA })).toBe('23514')
    expect(await shape({ category_id: mercadoA, account_id: accA, end_date: '2026-10-01' })).toBe('23514')

    const id = await createRent(rent({ description: 'Formato' }))
    const noOccurrence = await a.client.from('transactions').insert({
      household_id: houseA,
      type: 'expense',
      description: 'Teste',
      amount_cents: 100,
      date: '2026-10-10',
      status: 'paid',
      category_id: mercadoA,
      account_id: accA,
      recurrence_id: id,
    })
    expect(noOccurrence.error?.code).toBe('23514')
  })

  it('create_recurrence é atômico: uma linha inválida não deixa série nem lançamento', async () => {
    const series = rent({ description: 'Atômico' })
    const args = createRecurrenceArgs(houseA, series, createSeries(series, 'paid', null, TODAY))
    args.p_rows[3] = { ...args.p_rows[3], category_id: salarioA }
    const { error } = await a.client.rpc('create_recurrence', args)
    expect(error?.message).toBe('CATEGORY_KIND_MISMATCH')
    expect((await a.client.from('recurrences').select('id').eq('description', 'Atômico')).data).toEqual([])
    expect((await a.client.from('transactions').select('id').eq('description', 'Atômico')).data).toEqual([])
  })

  it('apply_recurrence_change regrava o lançamento aberto, troca os pendentes e preserva os pagos', async () => {
    const series = rent({ description: 'Troca' })
    const id = await createRent(series)
    await a.client.from('transactions').update({ status: 'paid' }).eq('recurrence_id', id).eq('occurrence_date', '2026-12-10')

    const transactions = await seriesTransactions(id)
    const november = transactions.find((tx) => tx.occurrenceDate === '2026-11-10')!
    const change = changeFollowing({ id, ...series, generatedUntil: '2027-10-05' }, november, { ...series, amountCents: 250_000, date: november.date, status: 'pending' }, {
      transactions,
      today: TODAY,
      card: null,
    })
    const { error } = await a.client.rpc('apply_recurrence_change', changeArgs(id, change))
    expect(error).toBeNull()

    const { data: after } = await a.client.from('transactions').select('id, occurrence_date, amount_cents').eq('recurrence_id', id)
    const byDate = new Map((after ?? []).map((row) => [row.occurrence_date as string, row]))
    expect(after).toHaveLength(12)
    expect(byDate.get('2026-10-10')!.amount_cents).toBe(200_000)
    expect(byDate.get('2026-11-10')).toEqual({ id: november.id, occurrence_date: '2026-11-10', amount_cents: 250_000 })
    expect(byDate.get('2026-12-10')!.amount_cents).toBe(200_000)
    expect(byDate.get('2027-01-10')!.amount_cents).toBe(250_000)
    expect((await a.client.from('recurrences').select('amount_cents').eq('id', id).single()).data!.amount_cents).toBe(250_000)
  })

  it('excluir a partir da primeira apaga a série; restore_recurrence devolve tudo com os mesmos ids', async () => {
    const series = rent({ description: 'Volta' })
    const id = await createRent(series)
    const { data: record } = await a.client.from('recurrences').select(RECURRENCE_COLUMNS).eq('id', id).single()
    const { data: rows } = await a.client.from('transactions').select(RECORD_COLUMNS).eq('recurrence_id', id)
    const transactions = await seriesTransactions(id)
    const first = transactions.find((tx) => tx.occurrenceDate === '2026-10-10')!

    const change = removeFollowing({ id, ...series, generatedUntil: record!.generated_until as string }, first, {
      transactions,
      today: TODAY,
      card: null,
    })
    expect(change.deleteIds).toHaveLength(12)
    expect((await a.client.rpc('apply_recurrence_change', changeArgs(id, change))).error).toBeNull()
    expect((await a.client.from('recurrences').select('id').eq('id', id)).data).toEqual([])
    expect(await countRows(id)).toBe(0)

    const restored = await a.client.rpc('restore_recurrence', {
      p_recurrence: { ...record, household_id: houseA },
      p_rows: (rows ?? []).map((row) => ({ ...row, household_id: houseA })),
    })
    expect(restored.error).toBeNull()
    const ids = ((await a.client.from('transactions').select('id').eq('recurrence_id', id)).data ?? []).map((row) => row.id).sort()
    expect(ids).toEqual((rows ?? []).map((row) => row.id).sort())
  })

  it('restore_transactions devolve o lançamento à série', async () => {
    const id = await createRent(rent({ description: 'Só este' }))
    const { data: deleted } = await a.client
      .from('transactions')
      .delete()
      .eq('recurrence_id', id)
      .eq('occurrence_date', '2026-11-10')
      .select(RECORD_COLUMNS)
    const { error } = await a.client.rpc('restore_transactions', {
      p_plan: null,
      p_rows: (deleted ?? []).map((row) => ({ ...row, household_id: houseA })),
    })
    expect(error).toBeNull()
    const { data } = await a.client.from('transactions').select('recurrence_id, occurrence_date, source').eq('id', deleted![0].id).single()
    expect(data).toEqual({ recurrence_id: id, occurrence_date: '2026-11-10', source: 'recurrence' })
  })

  it('apply_budget_change grava e encadeia "só este mês" sem quebrar os meses seguintes', async () => {
    const read = async (): Promise<BudgetRow[]> => {
      const { data } = await a.client.from('budgets').select('category_id, month, amount_cents, repeats').eq('category_id', mercadoA)
      return (data ?? []).map((row) => ({
        categoryId: row.category_id as string,
        month: row.month as string,
        amountCents: Number(row.amount_cents),
        repeats: row.repeats as boolean,
      }))
    }
    // Recomeça do zero (outro teste pode ter gravado Mercado)
    const current = await read()
    await a.client.rpc('apply_budget_change', { p_category_id: mercadoA, p_upserts: [], p_delete_months: current.map((row) => row.month) })

    expect((await a.client.rpc('apply_budget_change', budgetChangeArgs(mercadoA, budgetChange([], mercadoA, '2026-10-01', 150_000, 'from')))).error).toBeNull()
    const second = budgetChange(await read(), mercadoA, '2026-10-01', 180_000, 'only')
    expect((await a.client.rpc('apply_budget_change', budgetChangeArgs(mercadoA, second))).error).toBeNull()

    const { data } = await a.client.from('budgets').select('month, amount_cents, repeats').eq('category_id', mercadoA).order('month')
    expect(data).toEqual([
      { month: '2026-10-01', amount_cents: 180_000, repeats: false },
      { month: '2026-11-01', amount_cents: 150_000, repeats: true },
    ])
  })
})
