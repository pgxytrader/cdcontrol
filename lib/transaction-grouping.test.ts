import { describe, expect, it } from 'vitest'
import { groupByDay, groupByMonth, splitPending } from './transaction-grouping'

const items = [
  { id: '1', date: '2026-10-04', status: 'pending' as const },
  { id: '2', date: '2026-10-04', status: 'paid' as const },
  { id: '3', date: '2026-10-02', status: 'paid' as const },
  { id: '4', date: '2026-09-30', status: 'paid' as const },
]

describe('agrupamento', () => {
  it('groupByDay mantém a ordem e rotula o dia', () => {
    const groups = groupByDay(items)
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-04', 'Domingo, 4 de outubro', ['1', '2']],
      ['2026-10-02', 'Sexta-feira, 2 de outubro', ['3']],
      ['2026-09-30', 'Quarta-feira, 30 de setembro', ['4']],
    ])
  })

  it('groupByMonth agrupa por mês', () => {
    expect(groupByMonth(items).map((g) => [g.key, g.label, g.items.length])).toEqual([
      ['2026-10', 'Outubro 2026', 3],
      ['2026-09', 'Setembro 2026', 1],
    ])
  })

  it('splitPending separa previsto de realizado', () => {
    const { pending, paid } = splitPending(items)
    expect(pending.map((i) => i.id)).toEqual(['1'])
    expect(paid.map((i) => i.id)).toEqual(['2', '3', '4'])
  })
})
