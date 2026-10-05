import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '@/lib/categories'
import { accountBalance } from '@/lib/finance/balance'
import { rowToLedger, TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'
import { createTestContext, type TestUser } from './helpers'

const ctx = createTestContext()

describe('finanças: contas, categorias e lançamentos', () => {
  let a: TestUser
  let b: TestUser
  let houseA: string
  let houseB: string
  let accA: string
  let accA2: string
  let accB: string
  let mercadoA: string
  let salarioA: string
  let mercadoB: string

  async function insertAccount(user: TestUser, householdId: string, name: string, initial: number): Promise<string> {
    const { data, error } = await user.client
      .from('accounts')
      .insert({
        household_id: householdId,
        name,
        type: 'checking',
        initial_balance_cents: initial,
        initial_balance_date: '2026-09-01',
        color: '#3b82f6',
      })
      .select('id')
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
      .is('parent_id', null)
      .limit(1)
      .single()
    if (error) throw error
    return data.id as string
  }

  function tx(householdId: string, fields: Record<string, unknown>) {
    return { household_id: householdId, description: 'Teste', status: 'paid', date: '2026-09-10', ...fields }
  }

  beforeAll(async () => {
    ;[a, b] = await Promise.all([ctx.newUser('fin-a'), ctx.newUser('fin-b')])
    houseA = await ctx.createHousehold(a, 'Casa Fin A')
    houseB = await ctx.createHousehold(b, 'Casa Fin B')
    mercadoA = await categoryId(a, houseA, 'Mercado')
    salarioA = await categoryId(a, houseA, 'Salário')
    mercadoB = await categoryId(b, houseB, 'Mercado')
    accA = await insertAccount(a, houseA, 'Conta A', 100_000)
    accA2 = await insertAccount(a, houseA, 'Conta A2', 0)
    accB = await insertAccount(b, houseB, 'Conta B', 0)
  })

  afterAll(() => ctx.cleanup())

  it('casa nova nasce com as 19 categorias padrão', async () => {
    const { data, error } = await a.client.from('categories').select('name, kind, icon, color, is_default').eq('household_id', houseA)
    expect(error).toBeNull()
    const label = (c: { kind: string; name: string; icon: string; color: string }) => `${c.kind}:${c.name}:${c.icon}:${c.color}`
    expect(data!.map(label).sort()).toEqual(DEFAULT_CATEGORIES.map(label).sort())
    expect(data!.every((c) => c.is_default)).toBe(true)
  })

  it('a view calcula o mesmo saldo que accountBalance', async () => {
    const scenario = [
      { type: 'income', amount_cents: 50_000, date: '2026-09-05', account_id: accA, category_id: salarioA },
      { type: 'expense', amount_cents: 20_000, date: '2026-09-10', account_id: accA, category_id: mercadoA },
      { type: 'expense', amount_cents: 5_000, date: '2026-09-12', status: 'pending', account_id: accA, category_id: mercadoA },
      { type: 'expense', amount_cents: 7_000, date: '2026-08-20', account_id: accA, category_id: mercadoA },
      { type: 'transfer', amount_cents: 10_000, date: '2026-09-15', account_id: accA, destination_account_id: accA2 },
      { type: 'transfer', amount_cents: 3_000, date: '2026-09-20', account_id: accA2, destination_account_id: accA },
    ]
    const insert = await a.client.from('transactions').insert(scenario.map((fields) => tx(houseA, fields)))
    expect(insert.error).toBeNull()

    const { data: balances } = await a.client.from('v_account_balances').select('account_id, balance_cents').in('account_id', [accA, accA2])
    const byId = new Map(balances!.map((row) => [row.account_id, Number(row.balance_cents)]))

    const { data: rows } = await a.client.from('transactions').select(TRANSACTION_COLUMNS).eq('household_id', houseA)
    const ledger = (rows as unknown as TransactionRow[]).map(rowToLedger)

    expect(byId.get(accA)).toBe(123_000)
    expect(byId.get(accA)).toBe(accountBalance({ id: accA, initialBalanceCents: 100_000, initialBalanceDate: '2026-09-01' }, ledger))
    expect(byId.get(accA2)).toBe(7_000)
    expect(byId.get(accA2)).toBe(accountBalance({ id: accA2, initialBalanceCents: 0, initialBalanceDate: '2026-09-01' }, ledger))
  })

  it('outra casa não lê contas, categorias, lançamentos nem saldos', async () => {
    const results = await Promise.all([
      b.client.from('accounts').select('id').eq('household_id', houseA),
      b.client.from('categories').select('id').eq('household_id', houseA),
      b.client.from('transactions').select('id').eq('household_id', houseA),
      b.client.from('v_account_balances').select('account_id').eq('household_id', houseA),
    ])
    for (const result of results) {
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    }
  })

  it('outra casa não escreve na casa de A', async () => {
    const insert = await b.client.from('accounts').insert({
      household_id: houseA,
      name: 'Intrusa',
      type: 'cash',
      initial_balance_date: '2026-09-01',
      color: '#3b82f6',
    })
    expect(insert.error).not.toBeNull()

    await b.client.from('accounts').update({ name: 'Renomeada' }).eq('id', accA)
    const { data } = await ctx.admin.from('accounts').select('name').eq('id', accA).single()
    expect(data?.name).toBe('Conta A')
  })

  it('lançamento não aceita conta ou categoria de outra casa', async () => {
    const otherAccount = await b.client
      .from('transactions')
      .insert(tx(houseB, { type: 'expense', amount_cents: 100, account_id: accA, category_id: mercadoB }))
    expect(otherAccount.error?.message).toBe('INVALID_ACCOUNT')

    const otherCategory = await b.client
      .from('transactions')
      .insert(tx(houseB, { type: 'expense', amount_cents: 100, account_id: accB, category_id: mercadoA }))
    expect(otherCategory.error?.message).toBe('INVALID_CATEGORY')

    const otherDestination = await b.client
      .from('transactions')
      .insert(tx(houseB, { type: 'transfer', amount_cents: 100, account_id: accB, destination_account_id: accA }))
    expect(otherDestination.error?.message).toBe('INVALID_ACCOUNT')
  })

  it('respeita as restrições do lançamento', async () => {
    const zero = await a.client.from('transactions').insert(tx(houseA, { type: 'expense', amount_cents: 0, account_id: accA, category_id: mercadoA }))
    expect(zero.error).not.toBeNull()

    const sameAccount = await a.client
      .from('transactions')
      .insert(tx(houseA, { type: 'transfer', amount_cents: 100, account_id: accA, destination_account_id: accA }))
    expect(sameAccount.error).not.toBeNull()

    const wrongKind = await a.client
      .from('transactions')
      .insert(tx(houseA, { type: 'income', amount_cents: 100, account_id: accA, category_id: mercadoA }))
    expect(wrongKind.error?.message).toBe('CATEGORY_KIND_MISMATCH')
  })

  it('subcategoria: só um nível e mesmo tipo da mãe; nome único no mesmo nível', async () => {
    const { data: sub, error } = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'Feira', kind: 'expense', parent_id: mercadoA, icon: 'shopping-cart', color: '#22c55e' })
      .select('id')
      .single()
    expect(error).toBeNull()

    const grandchild = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'Orgânicos', kind: 'expense', parent_id: sub!.id, icon: 'shopping-cart', color: '#22c55e' })
    expect(grandchild.error?.message).toBe('INVALID_PARENT')

    const otherKind = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'Bônus', kind: 'income', parent_id: mercadoA, icon: 'gift', color: '#22c55e' })
    expect(otherKind.error?.message).toBe('INVALID_PARENT')

    const duplicate = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'mercado', kind: 'expense', parent_id: null, icon: 'house', color: '#3b82f6' })
    expect(duplicate.error?.code).toBe('23505')
  })

  it('conta com lançamentos não pode ser excluída, só arquivada', async () => {
    const remove = await a.client.from('accounts').delete().eq('id', accA)
    expect(remove.error?.code).toBe('23503')

    const archive = await a.client.from('accounts').update({ archived: true }).eq('id', accA).select('archived').single()
    expect(archive.data?.archived).toBe(true)

    const empty = await insertAccount(a, houseA, 'Vazia', 0)
    const removeEmpty = await a.client.from('accounts').delete().eq('id', empty).select('id')
    expect(removeEmpty.data).toHaveLength(1)
  })
})
