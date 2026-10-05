import { describe, expect, it } from 'vitest'
import {
  cardMonthly,
  categoryTotals,
  changeBetween,
  compareCategories,
  monthlySeries,
  NO_CATEGORY,
  topSlices,
  toReportRow,
  type ReportCategory,
  type ReportRow,
} from './reports'

const ym = (year: number, month: number) => ({ year, month })

const row = (patch: Partial<ReportRow>): ReportRow => ({
  type: 'expense',
  status: 'paid',
  date: '2026-10-05',
  amountCents: 1000,
  categoryId: null,
  creditCardId: null,
  ...patch,
})

const categories: ReportCategory[] = [
  { id: 'casa', name: 'Moradia', color: '#3b82f6', parentId: null },
  { id: 'luz', name: 'Luz', color: '#3b82f6', parentId: 'casa' },
  { id: 'mercado', name: 'Mercado', color: '#22c55e', parentId: null },
  { id: 'lazer', name: 'Lazer', color: '#ec4899', parentId: null },
]

describe('toReportRow', () => {
  const raw = { type: 'expense', status: 'pending', date: '2026-10-01', amount_cents: 500, category_id: 'mercado', account_id: null, credit_card_id: 'nubank' }
  it('compra no cartão segue a data: passada vira realizada, futura vira prevista', () => {
    expect(toReportRow(raw, '2026-10-05').status).toBe('paid')
    expect(toReportRow({ ...raw, status: 'paid', date: '2026-10-20' }, '2026-10-05').status).toBe('pending')
  })
  it('lançamento em conta mantém o status salvo', () => {
    expect(toReportRow({ ...raw, account_id: 'itau', credit_card_id: null }, '2026-10-05').status).toBe('pending')
  })
  it('mapeia os campos', () => {
    expect(toReportRow(raw, '2026-10-05')).toEqual({
      type: 'expense', status: 'paid', date: '2026-10-01', amountCents: 500, categoryId: 'mercado', creditCardId: 'nubank',
    })
  })
})

describe('monthlySeries', () => {
  it('separa realizado e previsto, ignora transferência e pagamento de fatura e zera meses vazios', () => {
    const rows = [
      row({ type: 'income', amountCents: 5000, date: '2026-10-01' }),
      row({ type: 'expense', amountCents: 1200, date: '2026-10-02' }),
      row({ type: 'expense', status: 'pending', amountCents: 300, date: '2026-10-25' }),
      row({ type: 'transfer', amountCents: 9999, date: '2026-10-03' }),
      row({ type: 'invoice_payment', amountCents: 8888, date: '2026-10-04' }),
      row({ type: 'income', amountCents: 200, date: '2026-10-06', creditCardId: 'nubank' }),
    ]
    const [sep, oct] = monthlySeries(rows, [ym(2026, 9), ym(2026, 10)])
    expect(sep).toMatchObject({ key: '2026-09', income: { paid: 0, pending: 0 }, expense: { paid: 0, pending: 0 }, balancePaid: 0 })
    expect(oct).toMatchObject({
      ym: ym(2026, 10),
      key: '2026-10',
      income: { paid: 5200, pending: 0 },
      expense: { paid: 1200, pending: 300 },
      balancePaid: 4000,
      balanceProjected: 3700,
    })
  })
})

describe('categoryTotals', () => {
  it('soma subcategoria na mãe, junta sem categoria e só conta despesas', () => {
    const totals = categoryTotals(
      [
        row({ categoryId: 'casa', amountCents: 1000 }),
        row({ categoryId: 'luz', amountCents: 200, status: 'pending' }),
        row({ categoryId: null, amountCents: 50 }),
        row({ type: 'income', categoryId: 'casa', amountCents: 7000 }),
      ],
      categories,
    )
    expect(totals.get('casa')).toEqual({ paid: 1000, pending: 200 })
    expect(totals.get(NO_CATEGORY)).toEqual({ paid: 50, pending: 0 })
    expect(totals.has('luz')).toBe(false)
  })
})

describe('changeBetween', () => {
  it('percentual arredondado, novo, zerou e sem −0', () => {
    expect(changeBetween(1120, 1000)).toEqual({ kind: 'pct', value: 12 })
    expect(changeBetween(920, 1000)).toEqual({ kind: 'pct', value: -8 })
    expect(changeBetween(500, 0)).toEqual({ kind: 'new' })
    expect(changeBetween(0, 500)).toEqual({ kind: 'gone' })
    expect(changeBetween(0, 0)).toEqual({ kind: 'pct', value: 0 })
    const tiny = changeBetween(9996, 10000)
    expect(tiny).toEqual({ kind: 'pct', value: 0 })
    expect(Object.is(tiny.kind === 'pct' && tiny.value, -0)).toBe(false)
  })
})

describe('compareCategories', () => {
  it('monta as linhas, ordena pelo maior total, tira zeradas e soma o total', () => {
    const current = new Map([
      ['casa', { paid: 1000, pending: 200 }],
      ['mercado', { paid: 1100, pending: 0 }],
      [NO_CATEGORY, { paid: 50, pending: 0 }],
    ])
    const previous = new Map([
      ['casa', { paid: 1000, pending: 0 }],
      ['lazer', { paid: 300, pending: 0 }],
    ])
    const result = compareCategories(current, previous, categories)
    expect(result.lines.map((line) => line.categoryId)).toEqual(['casa', 'mercado', NO_CATEGORY, 'lazer'])
    expect(result.lines[0]).toEqual({
      categoryId: 'casa', name: 'Moradia', color: '#3b82f6', totalCents: 1200, pendingCents: 200, previousCents: 1000, change: { kind: 'pct', value: 20 },
    })
    expect(result.lines[1].change).toEqual({ kind: 'new' })
    expect(result.lines[3]).toMatchObject({ name: 'Lazer', totalCents: 0, change: { kind: 'gone' } })
    expect(result.lines[2]).toMatchObject({ name: 'Sem categoria', color: '#64748b' })
    expect(result.total).toEqual({ totalCents: 2350, pendingCents: 200, previousCents: 1300, change: { kind: 'pct', value: 81 } })
  })
  it('empate no total ordena pelo nome', () => {
    const current = new Map([
      ['mercado', { paid: 100, pending: 0 }],
      ['lazer', { paid: 100, pending: 0 }],
    ])
    expect(compareCategories(current, new Map(), categories).lines.map((line) => line.name)).toEqual(['Lazer', 'Mercado'])
  })
})

describe('topSlices', () => {
  const line = (categoryId: string, totalCents: number) => ({ categoryId, name: categoryId, color: '#000', totalCents })
  it('lista vazia', () => {
    expect(topSlices([])).toEqual([])
  })
  it('até 5 sem "Outras"; sem categoria não vira link', () => {
    const slices = topSlices([line('a', 5), line(NO_CATEGORY, 4), line('c', 0)])
    expect(slices.map((slice) => slice.key)).toEqual(['a', NO_CATEGORY])
    expect(slices[1].categoryId).toBeNull()
  })
  it('mais de 5 junta o resto em "Outras"', () => {
    const slices = topSlices([line('a', 70), line('b', 60), line('c', 50), line('d', 40), line('e', 30), line('f', 20), line('g', 10)])
    expect(slices).toHaveLength(6)
    expect(slices[5]).toEqual({ key: 'outras', categoryId: null, name: 'Outras', color: '#475569', valueCents: 30 })
  })
})

describe('cardMonthly', () => {
  const cards = [
    { id: 'nubank', name: 'Nubank', color: '#a855f7' },
    { id: 'inter', name: 'Inter', color: '#f97316' },
    { id: 'velho', name: 'Antigo', color: '#64748b' },
  ]
  it('compras menos estornos por cartão e mês; cartão sem movimento fica fora', () => {
    const rows = [
      row({ creditCardId: 'nubank', amountCents: 1000, date: '2026-09-10' }),
      row({ creditCardId: 'nubank', amountCents: 500, date: '2026-10-10', status: 'pending' }),
      row({ creditCardId: 'inter', type: 'income', amountCents: 300, date: '2026-10-11' }),
      row({ creditCardId: 'nubank', type: 'invoice_payment', amountCents: 9999, date: '2026-10-12' }),
      row({ creditCardId: 'velho', amountCents: 700, date: '2026-01-01' }),
      row({ amountCents: 400, date: '2026-10-01' }),
    ]
    const result = cardMonthly(rows, cards, [ym(2026, 9), ym(2026, 10)])
    expect(result.cards.map((card) => card.id)).toEqual(['inter', 'nubank'])
    expect(result.months[0]).toEqual({ ym: ym(2026, 9), key: '2026-09', byCard: { inter: 0, nubank: 1000 }, totalCents: 1000 })
    expect(result.months[1]).toEqual({ ym: ym(2026, 10), key: '2026-10', byCard: { inter: -300, nubank: 500 }, totalCents: 200 })
  })
})
