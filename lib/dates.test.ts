import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  currentYearMonth,
  formatDateBR,
  formatDayHeading,
  formatISODateBR,
  formatYearMonthLabel,
  formatYearMonthParam,
  monthBounds,
  parseYearMonth,
  resolveYearMonth,
  shiftYearMonth,
  todayISO,
  yearMonthOfISO,
} from './dates'

describe('currentYearMonth', () => {
  it('usa o fuso de São Paulo na virada do mês', () => {
    // 02:00 UTC de 01/11 = 23:00 de 31/10 em São Paulo
    expect(currentYearMonth(new Date('2026-11-01T02:00:00Z'))).toEqual({ year: 2026, month: 10 })
    // 03:00 UTC de 01/11 = 00:00 de 01/11 em São Paulo
    expect(currentYearMonth(new Date('2026-11-01T03:00:00Z'))).toEqual({ year: 2026, month: 11 })
  })
})

describe('parseYearMonth', () => {
  it('aceita AAAA-MM válido', () => {
    expect(parseYearMonth('2026-10')).toEqual({ year: 2026, month: 10 })
    expect(parseYearMonth('2027-01')).toEqual({ year: 2027, month: 1 })
  })

  it.each(['abc', '2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', '1999-12', '', null, undefined])(
    'recusa %j',
    (value) => {
      expect(parseYearMonth(value)).toBeNull()
    },
  )
})

describe('resolveYearMonth', () => {
  const now = new Date('2026-10-15T12:00:00Z')

  it('usa o parâmetro quando válido', () => {
    expect(resolveYearMonth('2026-03', now)).toEqual({ year: 2026, month: 3 })
  })

  it('usa o primeiro valor quando o parâmetro se repete', () => {
    expect(resolveYearMonth(['2026-03', '2026-04'], now)).toEqual({ year: 2026, month: 3 })
  })

  it('cai no mês atual quando ausente ou inválido', () => {
    expect(resolveYearMonth(undefined, now)).toEqual({ year: 2026, month: 10 })
    expect(resolveYearMonth('lixo', now)).toEqual({ year: 2026, month: 10 })
  })
})

describe('shiftYearMonth', () => {
  it('avança e volta atravessando o ano', () => {
    expect(shiftYearMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftYearMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftYearMonth({ year: 2026, month: 10 }, 13)).toEqual({ year: 2027, month: 11 })
    expect(shiftYearMonth({ year: 2026, month: 10 }, -22)).toEqual({ year: 2024, month: 12 })
  })
})

describe('formatação', () => {
  it('gera o parâmetro da URL com zero à esquerda', () => {
    expect(formatYearMonthParam({ year: 2026, month: 3 })).toBe('2026-03')
  })

  it('gera o rótulo em português com inicial maiúscula', () => {
    expect(formatYearMonthLabel({ year: 2026, month: 10 })).toBe('Outubro 2026')
    expect(formatYearMonthLabel({ year: 2026, month: 3 })).toBe('Março 2026')
  })

  it('formata datas como dd/mm/aaaa no fuso de São Paulo', () => {
    // 02:30 UTC de 11/10 = 23:30 de 10/10 em São Paulo
    expect(formatDateBR('2026-10-11T02:30:00Z')).toBe('10/10/2026')
    expect(formatDateBR(new Date('2026-01-05T15:00:00Z'))).toBe('05/01/2026')
  })
})

describe('datas de calendário (AAAA-MM-DD)', () => {
  it('todayISO usa o fuso de São Paulo', () => {
    // 02:30 UTC de 05/10 = 23:30 de 04/10 em São Paulo
    expect(todayISO(new Date('2026-10-05T02:30:00Z'))).toBe('2026-10-04')
    expect(todayISO(new Date('2026-10-05T03:30:00Z'))).toBe('2026-10-05')
  })

  it('monthBounds devolve [início, início do mês seguinte)', () => {
    expect(monthBounds({ year: 2026, month: 10 })).toEqual({ start: '2026-10-01', end: '2026-11-01' })
    expect(monthBounds({ year: 2026, month: 12 })).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })

  it('addDaysISO atravessa meses e anos', () => {
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-10-04', -90)).toBe('2026-07-06')
  })

  it('yearMonthOfISO extrai ano e mês', () => {
    expect(yearMonthOfISO('2026-03-15')).toEqual({ year: 2026, month: 3 })
  })

  it('formatISODateBR não desloca o fuso', () => {
    expect(formatISODateBR('2026-10-04')).toBe('04/10/2026')
    expect(formatISODateBR('2027-01-01')).toBe('01/01/2027')
  })

  it('formatDayHeading escreve o dia por extenso', () => {
    expect(formatDayHeading('2026-10-04')).toBe('Domingo, 4 de outubro')
    expect(formatDayHeading('2026-03-02')).toBe('Segunda-feira, 2 de março')
  })
})
