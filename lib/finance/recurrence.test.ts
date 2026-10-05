import { describe, expect, it } from 'vitest'
import { cycleForClosingMonth } from './invoice'
import {
  buildOccurrences,
  describeSchedule,
  generationWindow,
  nextOccurrenceDate,
  occurrenceDates,
  occurrencesToReplace,
  type SeriesTransaction,
} from './recurrence'

const TODAY = '2026-10-05'

describe('occurrenceDates', () => {
  it('mensal no dia 31 cai no último dia dos meses curtos e volta ao 31', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2026-01-31', endDate: null }, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('em ano bissexto fevereiro tem 29', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2028-01-31', endDate: null }, '2028-02-01', '2028-03-31')).toEqual([
      '2028-02-29',
      '2028-03-31',
    ])
  })

  it('anual em 29/02 cai em 28/02 nos anos normais e volta a 29/02', () => {
    expect(occurrenceDates({ frequency: 'yearly', startDate: '2028-02-29', endDate: null }, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
  })

  it('semanal soma 7 dias a partir da âncora', () => {
    expect(occurrenceDates({ frequency: 'weekly', startDate: '2026-10-05', endDate: null }, '2026-10-01', '2026-10-26')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ])
  })

  it('para na data final mesmo com a janela maior', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2026-10-10', endDate: '2026-12-15' }, '2026-10-01', '2027-03-31')).toEqual([
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
    ])
  })

  it('série que começou no passado devolve só as datas da janela', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2026-01-10', endDate: null }, '2026-09-01', '2026-11-30')).toEqual([
      '2026-09-10',
      '2026-10-10',
      '2026-11-10',
    ])
  })

  it('janela vazia devolve nada', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2026-01-10', endDate: null }, '2026-11-11', '2026-12-09')).toEqual([])
  })
})

describe('generationWindow', () => {
  it('em dia: nada a gerar', () => {
    expect(generationWindow('2027-10-05', null, TODAY)).toBeNull()
  })

  it('atrasada: do dia seguinte até hoje + 12 meses', () => {
    expect(generationWindow('2027-09-30', null, TODAY)).toEqual({ from: '2027-10-01', until: '2027-10-05' })
  })

  it('encerrada e já gerada até o fim: nada a gerar', () => {
    expect(generationWindow('2026-12-10', '2026-12-10', TODAY)).toBeNull()
  })

  it('data final antes do horizonte limita a janela', () => {
    expect(generationWindow('2026-10-10', '2027-01-31', TODAY)).toEqual({ from: '2026-10-11', until: '2027-01-31' })
  })
})

describe('buildOccurrences', () => {
  const card = { closingDay: 3, dueDay: 10 }

  it('em conta nascem pendentes e sem fatura', () => {
    expect(buildOccurrences(['2026-11-10'], null, TODAY)).toEqual([
      { date: '2026-11-10', occurrenceDate: '2026-11-10', status: 'pending', cycle: null },
    ])
  })

  it('no cartão a fatura segue a regra 8.2 e o status segue a data', () => {
    expect(buildOccurrences(['2026-10-02', '2026-10-03', '2026-11-20'], { schedule: card, stored: [] }, TODAY)).toEqual([
      { date: '2026-10-02', occurrenceDate: '2026-10-02', status: 'paid', cycle: cycleForClosingMonth(card, '2026-10-01') },
      { date: '2026-10-03', occurrenceDate: '2026-10-03', status: 'paid', cycle: cycleForClosingMonth(card, '2026-11-01') },
      { date: '2026-11-20', occurrenceDate: '2026-11-20', status: 'pending', cycle: cycleForClosingMonth(card, '2026-12-01') },
    ])
  })

  it('no cartão nunca cai numa fatura que já fechou pelas datas salvas', () => {
    const stored = [{ closingMonth: '2026-11-01', closingDate: '2026-11-01', dueDate: '2026-11-10', referenceMonth: '2026-11-01' }]
    const [occurrence] = buildOccurrences(['2026-11-02'], { schedule: card, stored }, TODAY)
    expect(occurrence.cycle?.closingMonth).toBe('2026-12-01')
  })
})

const tx = (id: string, occurrenceDate: string, status: 'paid' | 'pending', accountId: string | null = 'acc'): SeriesTransaction => ({
  id,
  occurrenceDate,
  type: 'expense',
  status,
  date: occurrenceDate,
  accountId,
})

describe('occurrencesToReplace e nextOccurrenceDate', () => {
  const transactions = [
    tx('set', '2026-09-10', 'pending'),
    tx('out', '2026-10-10', 'paid'),
    tx('nov', '2026-11-10', 'pending'),
    tx('dez-cartao', '2026-12-10', 'pending', null),
    tx('out-cartao', '2026-10-01', 'pending', null),
  ]

  it('troca só as não realizadas a partir da data; pagas e compras no cartão já passadas ficam', () => {
    expect(occurrencesToReplace(transactions, '2026-10-01', TODAY)).toEqual(['nov', 'dez-cartao'])
  })

  it('a próxima data é a primeira não realizada de hoje em diante', () => {
    expect(nextOccurrenceDate(transactions, TODAY)).toBe('2026-11-10')
    expect(nextOccurrenceDate([tx('out', '2026-10-10', 'paid')], TODAY)).toBeNull()
  })
})

describe('describeSchedule', () => {
  it('mensal, semanal e anual', () => {
    expect(describeSchedule({ frequency: 'monthly', startDate: '2026-10-05', endDate: null })).toBe('Todo dia 5, sem data final')
    expect(describeSchedule({ frequency: 'weekly', startDate: '2026-10-05', endDate: '2026-12-31' })).toBe(
      'Toda segunda-feira, até 31/12/2026',
    )
    expect(describeSchedule({ frequency: 'weekly', startDate: '2026-10-10', endDate: null })).toBe('Todo sábado, sem data final')
    expect(describeSchedule({ frequency: 'yearly', startDate: '2026-03-15', endDate: null })).toBe('Todo ano em 15/03, sem data final')
  })
})
