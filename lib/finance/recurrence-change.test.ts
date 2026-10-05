import { describe, expect, it } from 'vitest'
import {
  changeFollowing,
  changeSeries,
  createSeries,
  endSeries,
  removeFollowing,
  type ChangeContext,
  type SeriesChange,
  type SeriesFields,
  type SeriesState,
  type SeriesTransaction,
} from './recurrence'

const TODAY = '2026-10-05'

const FIELDS: SeriesFields = {
  type: 'expense',
  description: 'Aluguel',
  amountCents: 200_000,
  categoryId: 'cat',
  accountId: 'acc',
  destinationAccountId: null,
  creditCardId: null,
  notes: null,
}

const CURRENT: SeriesState = {
  id: 'rec',
  ...FIELDS,
  frequency: 'monthly',
  startDate: '2026-09-10',
  endDate: null,
  // Geração feita até dezembro: as linhas de TRANSACTIONS são tudo o que existe até aqui
  generatedUntil: '2026-12-31',
}

const tx = (id: string, occurrenceDate: string, status: 'paid' | 'pending'): SeriesTransaction => ({
  id,
  occurrenceDate,
  type: 'expense',
  status,
  date: occurrenceDate,
  accountId: 'acc',
})

// Setembro pago, outubro e novembro pendentes, dezembro pago adiantado
const TRANSACTIONS = [tx('set', '2026-09-10', 'paid'), tx('out', '2026-10-10', 'pending'), tx('nov', '2026-11-10', 'pending'), tx('dez', '2026-12-10', 'paid')]
const CTX: ChangeContext = { transactions: TRANSACTIONS, today: TODAY, card: null }
const occurrence = (id: string) => TRANSACTIONS.find((item) => item.id === id)!
const dates = (change: Pick<SeriesChange, 'occurrences'>) => change.occurrences.map((item) => item.date)

// Dezembro excluído com "Só este": não há linha de 10/12 dentro do que já foi gerado
const SKIPPED_CTX: ChangeContext = { ...CTX, transactions: TRANSACTIONS.filter((item) => item.id !== 'dez') }

// Novembro movido para o dia 15 com "este e os próximos": a âncora é 15/11 e outubro (10/10) segue pendente antes dela
const MOVED: SeriesState = { ...CURRENT, startDate: '2026-11-15' }
const MOVED_TRANSACTIONS = [tx('set', '2026-09-10', 'paid'), tx('out', '2026-10-10', 'pending'), tx('nov', '2026-11-15', 'pending'), tx('dez', '2026-12-15', 'pending')]
const MOVED_CTX: ChangeContext = { transactions: MOVED_TRANSACTIONS, today: TODAY, card: null }

describe('createSeries', () => {
  it('grava a primeira com o status do formulário e as demais pendentes até o horizonte', () => {
    const created = createSeries({ ...FIELDS, frequency: 'monthly', startDate: '2026-10-10', endDate: null }, 'paid', null, TODAY)
    expect(created.occurrences).toHaveLength(12)
    expect(created.occurrences[0]).toEqual({ date: '2026-10-10', occurrenceDate: '2026-10-10', status: 'paid', cycle: null })
    expect(created.occurrences[1].status).toBe('pending')
    expect(created.occurrences.at(-1)?.date).toBe('2027-09-10')
    expect(created.generatedUntil).toBe('2027-10-05')
  })

  it('série que começou no passado gera as ocorrências atrasadas como pendentes', () => {
    const created = createSeries({ ...FIELDS, frequency: 'monthly', startDate: '2026-08-10', endDate: null }, 'paid', null, TODAY)
    expect(created.occurrences).toHaveLength(14)
    expect(created.occurrences[1]).toMatchObject({ date: '2026-09-10', status: 'pending' })
  })

  it('série que começa depois do horizonte grava só a primeira', () => {
    const created = createSeries({ ...FIELDS, frequency: 'yearly', startDate: '2028-01-15', endDate: null }, 'pending', null, TODAY)
    expect(dates(created)).toEqual(['2028-01-15'])
    expect(created.generatedUntil).toBe('2028-01-15')
  })

  it('no cartão o status segue a data e cada uma tem fatura', () => {
    const card = { schedule: { closingDay: 3, dueDay: 10 }, stored: [] }
    const created = createSeries(
      { ...FIELDS, accountId: null, creditCardId: 'card', frequency: 'monthly', startDate: '2026-10-02', endDate: null },
      'pending',
      card,
      TODAY,
    )
    expect(created.occurrences[0]).toMatchObject({ status: 'paid', cycle: { closingMonth: '2026-10-01' } })
    expect(created.occurrences[1]).toMatchObject({ status: 'pending', cycle: { closingMonth: '2026-11-01' } })
  })
})

describe('changeFollowing', () => {
  it('sem mudar a data: regrava este, troca as pendentes seguintes e preserva as pagas', () => {
    const change = changeFollowing(CURRENT, occurrence('out'), { ...FIELDS, amountCents: 250_000, date: '2026-10-10', status: 'pending' }, CTX)
    expect(change.series).toEqual({ ...FIELDS, amountCents: 250_000, frequency: 'monthly', startDate: '2026-09-10', endDate: null })
    expect(change.deleteIds).toEqual(['out', 'nov'])
    expect(change.occurrences[0]).toEqual({ id: 'out', date: '2026-10-10', occurrenceDate: '2026-10-10', status: 'pending', cycle: null })
    // Novembro volta (substituída); dezembro está pago e fica; depois do que já foi gerado, até o horizonte
    expect(dates(change)).toEqual([
      '2026-10-10',
      '2026-11-10',
      '2027-01-10',
      '2027-02-10',
      '2027-03-10',
      '2027-04-10',
      '2027-05-10',
      '2027-06-10',
      '2027-07-10',
      '2027-08-10',
      '2027-09-10',
    ])
    expect(change.occurrences.slice(1).every((item) => item.id === undefined)).toBe(true)
    expect(change.generatedUntil).toBe('2027-10-05')
  })

  it('mudando a data: a nova data vira a âncora da série', () => {
    const change = changeFollowing(CURRENT, occurrence('out'), { ...FIELDS, date: '2026-10-15', status: 'paid' }, CTX)
    expect(change.series.startDate).toBe('2026-10-15')
    expect(change.occurrences[0]).toEqual({ id: 'out', date: '2026-10-15', occurrenceDate: '2026-10-15', status: 'paid', cycle: null })
    expect(dates(change)[1]).toBe('2026-11-15')
    expect(change.deleteIds).toEqual(['out', 'nov'])
  })

  it('mudando a data para depois da próxima pendente: ela é substituída, não duplicada', () => {
    const change = changeFollowing(CURRENT, occurrence('out'), { ...FIELDS, date: '2026-11-15', status: 'pending' }, CTX)
    expect(change.series.startDate).toBe('2026-11-15')
    expect(change.deleteIds).toEqual(['out', 'nov'])
    expect(change.occurrences[0]).toEqual({ id: 'out', date: '2026-11-15', occurrenceDate: '2026-11-15', status: 'pending', cycle: null })
    expect(dates(change)).not.toContain('2026-11-10')
    expect(dates(change).slice(1, 3)).toEqual(['2026-12-15', '2027-01-15'])
  })

  it('não traz de volta a ocorrência excluída com "Só este"', () => {
    const change = changeFollowing(CURRENT, occurrence('out'), { ...FIELDS, amountCents: 250_000, date: '2026-10-10', status: 'pending' }, SKIPPED_CTX)
    expect(change.deleteIds).toEqual(['out', 'nov'])
    expect(dates(change)).not.toContain('2026-12-10')
    expect(dates(change).slice(0, 3)).toEqual(['2026-10-10', '2026-11-10', '2027-01-10'])
  })

  it('mudando a data a agenda é nova: gera todas as datas, inclusive no mês excluído', () => {
    const change = changeFollowing(CURRENT, occurrence('out'), { ...FIELDS, date: '2026-10-11', status: 'pending' }, SKIPPED_CTX)
    expect(dates(change).slice(0, 4)).toEqual(['2026-10-11', '2026-11-11', '2026-12-11', '2027-01-11'])
  })
})

describe('removeFollowing', () => {
  it('encerra no dia anterior e apaga este e as pendentes seguintes', () => {
    const change = removeFollowing(CURRENT, occurrence('nov'), CTX)
    expect(change.series.endDate).toBe('2026-11-09')
    expect(change.deleteIds).toEqual(['nov'])
    expect(change.occurrences).toEqual([])
    expect(change.generatedUntil).toBe('2026-11-09')
  })

  it('a partir da primeira: a data final fica antes do início (o RPC apaga a série)', () => {
    const change = removeFollowing(CURRENT, occurrence('set'), CTX)
    expect(change.series.endDate).toBe('2026-09-09')
    expect(change.series.endDate! < change.series.startDate).toBe(true)
    expect(change.deleteIds).toEqual(['set', 'out', 'nov'])
  })
})

describe('changeSeries', () => {
  it('sem mudar frequência nem próxima data: mantém a âncora e troca as pendentes de hoje em diante', () => {
    const change = changeSeries(CURRENT, { ...FIELDS, amountCents: 210_000, frequency: 'monthly', nextDate: '2026-10-10', endDate: null }, CTX)
    expect(change.series.startDate).toBe('2026-09-10')
    expect(change.series.amountCents).toBe(210_000)
    expect(change.deleteIds).toEqual(['out', 'nov'])
    expect(dates(change)).toHaveLength(11)
    expect(dates(change).slice(0, 3)).toEqual(['2026-10-10', '2026-11-10', '2027-01-10'])
  })

  it('mudando a frequência: a próxima data vira a âncora', () => {
    const change = changeSeries(CURRENT, { ...FIELDS, frequency: 'weekly', nextDate: '2026-10-12', endDate: '2026-11-02' }, CTX)
    expect(change.series).toMatchObject({ frequency: 'weekly', startDate: '2026-10-12', endDate: '2026-11-02' })
    expect(dates(change)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'])
    expect(change.generatedUntil).toBe('2026-11-02')
  })

  it('só a data final: gera até ela', () => {
    const change = changeSeries(CURRENT, { ...FIELDS, frequency: 'monthly', nextDate: '2026-10-10', endDate: '2026-12-31' }, CTX)
    expect(dates(change)).toEqual(['2026-10-10', '2026-11-10'])
    expect(change.generatedUntil).toBe('2026-12-31')
  })

  it('não traz de volta a ocorrência excluída com "Só este"', () => {
    const change = changeSeries(CURRENT, { ...FIELDS, amountCents: 210_000, frequency: 'monthly', nextDate: '2026-10-10', endDate: null }, SKIPPED_CTX)
    expect(dates(change)).not.toContain('2026-12-10')
    expect(dates(change).slice(0, 3)).toEqual(['2026-10-10', '2026-11-10', '2027-01-10'])
  })

  it('mudando a frequência a agenda é nova: gera todas as datas, inclusive no mês excluído', () => {
    // Quinta 08/10 + 9 semanas = quinta 10/12
    const change = changeSeries(CURRENT, { ...FIELDS, frequency: 'weekly', nextDate: '2026-10-08', endDate: '2026-12-31' }, SKIPPED_CTX)
    expect(dates(change)).toContain('2026-12-10')
  })

  it('pendente antes da âncora (próxima movida em "este e os próximos") é regravada no lugar com os valores novos', () => {
    const change = changeSeries(MOVED, { ...FIELDS, amountCents: 210_000, frequency: 'monthly', nextDate: '2026-10-10', endDate: null }, MOVED_CTX)
    expect(change.series).toMatchObject({ startDate: '2026-11-15', endDate: null, amountCents: 210_000 })
    expect(change.deleteIds).toEqual(['out', 'nov', 'dez'])
    expect(change.occurrences[0]).toEqual({ id: 'out', date: '2026-10-10', occurrenceDate: '2026-10-10', status: 'pending', cycle: null })
    expect(change.occurrences.slice(1).every((item) => item.id === undefined)).toBe(true)
    expect(dates(change)).toHaveLength(12)
    expect(dates(change).slice(0, 4)).toEqual(['2026-10-10', '2026-11-15', '2026-12-15', '2027-01-15'])
  })

  it('pendente antes da âncora no cartão: a fatura é recalculada pela data', () => {
    const card = { schedule: { closingDay: 3, dueDay: 10 }, stored: [] }
    const onCard = (item: SeriesTransaction): SeriesTransaction => ({ ...item, accountId: null })
    const change = changeSeries(
      { ...MOVED, accountId: null, creditCardId: 'card' },
      { ...FIELDS, accountId: null, creditCardId: 'card', amountCents: 210_000, frequency: 'monthly', nextDate: '2026-10-10', endDate: null },
      { transactions: MOVED_TRANSACTIONS.map(onCard), today: TODAY, card },
    )
    expect(change.deleteIds).toEqual(['out', 'nov', 'dez'])
    expect(change.occurrences[0]).toMatchObject({
      id: 'out',
      date: '2026-10-10',
      occurrenceDate: '2026-10-10',
      status: 'pending',
      cycle: { closingMonth: '2026-11-01' },
    })
  })

  it('pendente antes da âncora sai só se ficar depois da data final', () => {
    const change = changeSeries(MOVED, { ...FIELDS, frequency: 'monthly', nextDate: '2026-10-10', endDate: '2026-11-30' }, MOVED_CTX)
    expect(change.deleteIds).toEqual(['out', 'nov', 'dez'])
    expect(dates(change)).toEqual(['2026-10-10', '2026-11-15'])
    expect(change.occurrences[0].id).toBe('out')
  })

  it('data final antes da âncora: detectável para a action recusar (o RPC apagaria a série)', () => {
    const change = changeSeries(MOVED, { ...FIELDS, frequency: 'monthly', nextDate: '2026-10-10', endDate: '2026-10-31' }, MOVED_CTX)
    expect(change.series.endDate! < change.series.startDate).toBe(true)
  })
})

describe('endSeries', () => {
  it('termina hoje e apaga as pendentes futuras', () => {
    const change = endSeries(CURRENT, CTX)
    expect(change.series.endDate).toBe(TODAY)
    expect(change.deleteIds).toEqual(['out', 'nov'])
    expect(change.generatedUntil).toBe(TODAY)
  })

  it('série que ainda não começou: a data final fica antes do início (o RPC apaga a série)', () => {
    const change = endSeries({ ...CURRENT, startDate: '2026-11-01' }, CTX)
    expect(change.series.endDate! < change.series.startDate).toBe(true)
  })
})
