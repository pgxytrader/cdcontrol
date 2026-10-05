import { describe, expect, it } from 'vitest'
import { budgetChange } from './finance/budget'
import { createSeries, type Series } from './finance/recurrence'
import { budgetChangeArgs, changeArgs, createRecurrenceArgs, generateArgs } from './recurrence-rpc'

const TODAY = '2026-10-05'
const STREAMING: Series = {
  type: 'expense',
  description: 'Streaming',
  amountCents: 5_590,
  categoryId: 'cat',
  accountId: null,
  destinationAccountId: null,
  creditCardId: 'card',
  notes: null,
  frequency: 'monthly',
  startDate: '2026-10-02',
  endDate: null,
}

describe('createRecurrenceArgs', () => {
  it('leva a série com generated_until e as linhas com o ciclo da fatura no cartão', () => {
    const created = createSeries(STREAMING, 'pending', { schedule: { closingDay: 3, dueDay: 10 }, stored: [] }, TODAY)
    const args = createRecurrenceArgs('house', STREAMING, created)
    expect(args.p_recurrence).toEqual({
      household_id: 'house',
      type: 'expense',
      description: 'Streaming',
      amount_cents: 5_590,
      category_id: 'cat',
      account_id: null,
      destination_account_id: null,
      credit_card_id: 'card',
      frequency: 'monthly',
      start_date: '2026-10-02',
      end_date: null,
      notes: null,
      generated_until: '2027-10-05',
    })
    // 02/10/2026 até 02/10/2027 (o horizonte é 05/10/2027)
    expect(args.p_rows).toHaveLength(13)
    expect(args.p_rows[0]).toEqual({
      type: 'expense',
      description: 'Streaming',
      amount_cents: 5_590,
      date: '2026-10-02',
      occurrence_date: '2026-10-02',
      status: 'paid',
      category_id: 'cat',
      account_id: null,
      destination_account_id: null,
      credit_card_id: 'card',
      notes: null,
      closing_month: '2026-10-01',
      closing_date: '2026-10-03',
      due_date: '2026-10-10',
      reference_month: '2026-10-01',
    })
  })
})

describe('changeArgs e generateArgs', () => {
  it('a linha regravada leva o id; em conta não há colunas de fatura', () => {
    const series: Series = { ...STREAMING, accountId: 'acc', creditCardId: null }
    const args = changeArgs('rec', {
      series,
      deleteIds: ['a', 'b'],
      occurrences: [{ id: 'a', date: '2026-10-10', occurrenceDate: '2026-10-02', status: 'paid', cycle: null }],
      generatedUntil: '2027-10-05',
    })
    expect(args.p_recurrence_id).toBe('rec')
    expect(args.p_delete_ids).toEqual(['a', 'b'])
    expect(args.p_patch).toMatchObject({ account_id: 'acc', credit_card_id: null, end_date: null })
    expect(args.p_rows[0]).toMatchObject({ id: 'a', date: '2026-10-10', occurrence_date: '2026-10-02', account_id: 'acc' })
    expect(args.p_rows[0]).not.toHaveProperty('closing_month')
    expect(args.p_generated_until).toBe('2027-10-05')
  })

  it('generateArgs não leva id nas linhas', () => {
    const args = generateArgs('rec', STREAMING, [{ date: '2026-11-02', occurrenceDate: '2026-11-02', status: 'pending', cycle: null }], '2027-10-05')
    expect(args.p_rows[0]).not.toHaveProperty('id')
    expect(args).toMatchObject({ p_recurrence_id: 'rec', p_generated_until: '2027-10-05' })
  })
})

describe('budgetChangeArgs', () => {
  it('converte upserts e meses a apagar', () => {
    const change = budgetChange([{ categoryId: 'cat', month: '2026-10-01', amountCents: 150_000, repeats: true }], 'cat', '2026-10-01', 180_000, 'only')
    expect(budgetChangeArgs('cat', change)).toEqual({
      p_category_id: 'cat',
      p_upserts: [
        { month: '2026-10-01', amount_cents: 180_000, repeats: false },
        { month: '2026-11-01', amount_cents: 150_000, repeats: true },
      ],
      p_delete_months: [],
    })
  })
})
