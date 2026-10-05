import { describe, expect, it } from 'vitest'
import {
  budgetChange,
  budgetProgress,
  budgetTotals,
  buildBudgetLines,
  categorySpending,
  effectiveBudget,
  type BudgetChange,
  type BudgetRow,
  type SpendingTransaction,
} from './budget'

const CAT = 'mercado'
const row = (month: string, amountCents: number, repeats: boolean): BudgetRow => ({ categoryId: CAT, month, amountCents, repeats })

/** Aplica a mudança como o RPC: apaga os meses e faz upsert das linhas. */
function apply(rows: BudgetRow[], change: BudgetChange): BudgetRow[] {
  const kept = rows.filter((item) => !change.deleteMonths.includes(item.month))
  for (const upsert of change.upserts) {
    const index = kept.findIndex((item) => item.month === upsert.month)
    const next = { categoryId: CAT, ...upsert }
    if (index >= 0) kept[index] = next
    else kept.push(next)
  }
  return kept
}

const months = (rows: BudgetRow[], list: string[]) => list.map((month) => effectiveBudget(rows, CAT, month))

describe('effectiveBudget', () => {
  it('linha do mês, senão a última que se repete, senão nenhum', () => {
    const rows = [row('2026-10-01', 150_000, true), row('2026-12-01', 300_000, false)]
    expect(months(rows, ['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01'])).toEqual([
      null,
      150_000,
      150_000,
      300_000,
      150_000,
    ])
  })

  it('valor 0 é sem limite', () => {
    expect(effectiveBudget([row('2026-10-01', 0, true)], CAT, '2026-11-01')).toBeNull()
  })

  it('não mistura categorias', () => {
    expect(effectiveBudget([row('2026-10-01', 150_000, true)], 'outra', '2026-10-01')).toBeNull()
  })
})

describe('budgetChange', () => {
  it('a partir deste mês: repete e apaga as repetições futuras, mantendo as exceções', () => {
    const rows = [row('2026-10-01', 150_000, true), row('2026-12-01', 300_000, false), row('2027-02-01', 160_000, true)]
    const change = budgetChange(rows, CAT, '2026-11-01', 170_000, 'from')
    expect(change).toEqual({ upserts: [{ month: '2026-11-01', amountCents: 170_000, repeats: true }], deleteMonths: ['2027-02-01'] })
    expect(months(apply(rows, change), ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-03-01'])).toEqual([
      150_000,
      170_000,
      300_000,
      170_000,
      170_000,
    ])
  })

  it('só este mês num mês sem linha própria: só grava a exceção', () => {
    const rows = [row('2026-10-01', 150_000, true)]
    const change = budgetChange(rows, CAT, '2026-12-01', 300_000, 'only')
    expect(change).toEqual({ upserts: [{ month: '2026-12-01', amountCents: 300_000, repeats: false }], deleteMonths: [] })
    expect(months(apply(rows, change), ['2026-11-01', '2026-12-01', '2027-01-01'])).toEqual([150_000, 300_000, 150_000])
  })

  it('só este mês no mês em que a repetição começou não quebra os meses seguintes', () => {
    const rows = [row('2026-10-01', 150_000, true)]
    const change = budgetChange(rows, CAT, '2026-10-01', 180_000, 'only')
    expect(change.upserts).toEqual([
      { month: '2026-10-01', amountCents: 180_000, repeats: false },
      { month: '2026-11-01', amountCents: 150_000, repeats: true },
    ])
    expect(months(apply(rows, change), ['2026-10-01', '2026-11-01', '2027-03-01'])).toEqual([180_000, 150_000, 150_000])
  })

  it('o encadeamento pula as exceções que já existem nos meses seguintes', () => {
    const rows = [row('2026-10-01', 150_000, true), row('2026-11-01', 100_000, false)]
    const change = budgetChange(rows, CAT, '2026-10-01', 180_000, 'only')
    expect(change.upserts[1]).toEqual({ month: '2026-12-01', amountCents: 150_000, repeats: true })
    expect(months(apply(rows, change), ['2026-10-01', '2026-11-01', '2026-12-01'])).toEqual([180_000, 100_000, 150_000])
  })

  it('remover a partir deste mês é gravar 0 que se repete', () => {
    const rows = [row('2026-10-01', 150_000, true)]
    const change = budgetChange(rows, CAT, '2026-11-01', 0, 'from')
    expect(months(apply(rows, change), ['2026-10-01', '2026-11-01', '2027-05-01'])).toEqual([150_000, null, null])
  })
})

describe('categorySpending', () => {
  const categories = [
    { id: 'mercado', parentId: null },
    { id: 'feira', parentId: 'mercado' },
    { id: 'lazer', parentId: null },
  ]
  const tx = (fields: Partial<SpendingTransaction>): SpendingTransaction => ({
    type: 'expense',
    status: 'paid',
    date: '2026-10-02',
    accountId: 'acc',
    amountCents: 1_000,
    categoryId: 'mercado',
    ...fields,
  })

  it('soma subcategoria na mãe, separa realizado de previsto e ignora o que não é despesa do mês', () => {
    const spending = categorySpending(
      [
        tx({ amountCents: 90_000 }),
        tx({ categoryId: 'feira', amountCents: 5_000 }),
        tx({ status: 'pending', date: '2026-10-28', amountCents: 40_000 }),
        // Cartão: status pela data (02/10 já passou, 20/10 ainda não)
        tx({ accountId: null, status: 'pending', amountCents: 3_000 }),
        tx({ accountId: null, status: 'paid', date: '2026-10-20', amountCents: 7_000 }),
        tx({ type: 'income', categoryId: 'mercado', amountCents: 99_999 }),
        tx({ type: 'transfer', categoryId: null, amountCents: 99_999 }),
        tx({ date: '2026-11-01', amountCents: 99_999 }),
        tx({ categoryId: 'lazer', amountCents: 2_000 }),
      ],
      categories,
      '2026-10-01',
      '2026-10-05',
    )
    expect(spending.get('mercado')).toEqual({ realizedCents: 98_000, plannedCents: 47_000 })
    expect(spending.get('lazer')).toEqual({ realizedCents: 2_000, plannedCents: 0 })
    expect(spending.has('feira')).toBe(false)
  })
})

describe('budgetProgress', () => {
  it('faixas de 79%, 80% e 100%', () => {
    expect(budgetProgress(100_000, 79_000, 0).level).toBe('ok')
    expect(budgetProgress(100_000, 60_000, 20_000)).toEqual({ realizedRatio: 0.6, plannedRatio: 0.2, ratio: 0.8, level: 'warning' })
    expect(budgetProgress(100_000, 100_000, 0).level).toBe('over')
  })

  it('o exemplo da spec: 900 + 400 de 1.500 é atenção', () => {
    const progress = budgetProgress(150_000, 90_000, 40_000)
    expect(Math.round(progress.ratio * 100)).toBe(87)
    expect(progress.level).toBe('warning')
  })
})

describe('buildBudgetLines e budgetTotals', () => {
  const categories = [
    { id: 'mercado', name: 'Mercado', kind: 'expense' as const, parentId: null, archived: false, color: '#22c55e', icon: 'shopping-cart' },
    { id: 'lazer', name: 'Lazer', kind: 'expense' as const, parentId: null, archived: false, color: '#a855f7', icon: 'gamepad-2' },
    { id: 'saude', name: 'Saúde', kind: 'expense' as const, parentId: null, archived: false, color: '#ef4444', icon: 'heart-pulse' },
    { id: 'feira', name: 'Feira', kind: 'expense' as const, parentId: 'mercado', archived: false, color: '#22c55e', icon: 'shopping-cart' },
    { id: 'velha', name: 'Velha', kind: 'expense' as const, parentId: null, archived: true, color: '#64748b', icon: 'circle-ellipsis' },
    { id: 'salario', name: 'Salário', kind: 'income' as const, parentId: null, archived: false, color: '#22c55e', icon: 'briefcase' },
  ]
  const rows: BudgetRow[] = [
    { categoryId: 'mercado', month: '2026-10-01', amountCents: 150_000, repeats: true },
    { categoryId: 'lazer', month: '2026-10-01', amountCents: 50_000, repeats: true },
  ]
  const spending = new Map([
    ['mercado', { realizedCents: 90_000, plannedCents: 40_000 }],
    ['lazer', { realizedCents: 10_000, plannedCents: 0 }],
    ['saude', { realizedCents: 30_000, plannedCents: 0 }],
  ])

  it('só despesas de primeiro nível ativas; com limite primeiro, da mais perto do limite para a mais longe', () => {
    const lines = buildBudgetLines(categories, rows, spending, '2026-10-01')
    expect(lines.map((line) => line.categoryId)).toEqual(['mercado', 'lazer', 'saude'])
    expect(lines[2]).toMatchObject({ limitCents: null, progress: null })
    expect(budgetTotals(lines)).toEqual({ budgetedCents: 200_000, realizedCents: 130_000, plannedCents: 40_000 })
  })
})
