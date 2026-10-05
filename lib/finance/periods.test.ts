import { describe, expect, it } from 'vitest'
import {
  formatMonthAxis,
  formatMonthShort,
  lastMonths,
  monthsIn,
  parsePeriod,
  periodLabel,
  periodRange,
  previousRange,
  rangeBounds,
} from './periods'

const ym = (year: number, month: number) => ({ year, month })
const OCT = ym(2026, 10)

describe('parsePeriod', () => {
  it('aceita os atalhos e cai em "mes" no resto', () => {
    expect(parsePeriod('trimestre')).toBe('trimestre')
    expect(parsePeriod(['ano'])).toBe('ano')
    expect(parsePeriod('12m')).toBe('12m')
    expect(parsePeriod('xx')).toBe('mes')
    expect(parsePeriod(undefined)).toBe('mes')
    expect(parsePeriod('constructor')).toBe('mes')
  })
})

describe('periodRange e previousRange', () => {
  it('mês', () => {
    expect(periodRange('mes', OCT)).toEqual({ start: OCT, end: OCT })
    expect(previousRange('mes', OCT)).toEqual({ start: ym(2026, 9), end: ym(2026, 9) })
  })
  it('trimestre em outubro: ago–out x mai–jul', () => {
    expect(periodRange('trimestre', OCT)).toEqual({ start: ym(2026, 8), end: OCT })
    expect(previousRange('trimestre', OCT)).toEqual({ start: ym(2026, 5), end: ym(2026, 7) })
  })
  it('trimestre atravessando a virada do ano', () => {
    expect(periodRange('trimestre', ym(2026, 2))).toEqual({ start: ym(2025, 12), end: ym(2026, 2) })
    expect(previousRange('trimestre', ym(2026, 2))).toEqual({ start: ym(2025, 9), end: ym(2025, 11) })
  })
  it('semestre', () => {
    expect(periodRange('semestre', OCT)).toEqual({ start: ym(2026, 5), end: OCT })
    expect(previousRange('semestre', OCT)).toEqual({ start: ym(2025, 11), end: ym(2026, 4) })
  })
  it('12 meses', () => {
    expect(periodRange('12m', OCT)).toEqual({ start: ym(2025, 11), end: OCT })
    expect(previousRange('12m', OCT)).toEqual({ start: ym(2024, 11), end: ym(2025, 10) })
  })
  it('ano: janeiro até o mês, contra o mesmo trecho do ano anterior', () => {
    expect(periodRange('ano', OCT)).toEqual({ start: ym(2026, 1), end: OCT })
    expect(previousRange('ano', OCT)).toEqual({ start: ym(2025, 1), end: ym(2025, 10) })
    expect(periodRange('ano', ym(2026, 1))).toEqual({ start: ym(2026, 1), end: ym(2026, 1) })
    expect(previousRange('ano', ym(2026, 1))).toEqual({ start: ym(2025, 1), end: ym(2025, 1) })
  })
})

describe('meses e limites', () => {
  it('monthsIn e lastMonths em ordem crescente', () => {
    expect(monthsIn({ start: ym(2025, 11), end: ym(2026, 2) })).toEqual([ym(2025, 11), ym(2025, 12), ym(2026, 1), ym(2026, 2)])
    expect(lastMonths(OCT, 3)).toEqual([ym(2026, 8), ym(2026, 9), OCT])
    expect(lastMonths(OCT, 12)).toHaveLength(12)
  })
  it('rangeBounds devolve [início, fim)', () => {
    expect(rangeBounds({ start: ym(2026, 8), end: OCT })).toEqual({ start: '2026-08-01', end: '2026-11-01' })
    expect(rangeBounds({ start: ym(2026, 12), end: ym(2026, 12) })).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })
})

describe('rótulos', () => {
  it('mês curto e eixo', () => {
    expect(formatMonthShort(OCT)).toBe('out/2026')
    expect(formatMonthAxis(OCT)).toBe('out/26')
  })
  it('periodLabel', () => {
    expect(periodLabel({ start: OCT, end: OCT })).toBe('out/2026')
    expect(periodLabel({ start: ym(2026, 8), end: OCT })).toBe('ago–out/2026')
    expect(periodLabel({ start: ym(2025, 11), end: OCT })).toBe('nov/2025–out/2026')
  })
})
