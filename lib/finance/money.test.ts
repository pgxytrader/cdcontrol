import { describe, expect, it } from 'vitest'
import { formatBRL, parseBRL } from './money'

// Intl usa espaço não separável (U+00A0) depois de "R$"
const plain = (value: string) => value.replace(/\u00a0/g, ' ')

describe('formatBRL', () => {
  it('formata centavos como reais', () => {
    expect(plain(formatBRL(0))).toBe('R$ 0,00')
    expect(plain(formatBRL(5))).toBe('R$ 0,05')
    expect(plain(formatBRL(123456))).toBe('R$ 1.234,56')
  })

  it('formata valores negativos', () => {
    expect(plain(formatBRL(-1000))).toBe('-R$ 10,00')
  })
})

describe('parseBRL', () => {
  it.each([
    ['10', 1000],
    ['10,5', 1050],
    ['10,50', 1050],
    ['0,05', 5],
    [',50', 50],
    ['1.234,56', 123456],
    ['12.345.678,90', 1234567890],
    ['R$ 1.234,56', 123456],
    ['R$\u00a010,00', 1000],
    ['  7,9 ', 790],
    ['1.234', 123400],
    ['10.50', 1050],
    ['1.5', 150],
    ['-5,00', -500],
    ['-0', 0],
  ])('interpreta %j como %i centavos', (input, expected) => {
    expect(parseBRL(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '-', '10,555', '1,2,3', '10,', '1.23.4', '12a'])(
    'recusa %j',
    (input) => {
      expect(parseBRL(input)).toBeNull()
    },
  )
})
