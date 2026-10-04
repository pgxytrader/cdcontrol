import { describe, expect, it } from 'vitest'
import { formatCentsPlain, maskCurrencyInput } from './currency-input'

describe('maskCurrencyInput', () => {
  it.each([
    ['', '', 0],
    ['1', '0,01', 1],
    ['12', '0,12', 12],
    ['1234', '12,34', 1234],
    ['123456789', '1.234.567,89', 123456789],
    ['0001', '0,01', 1],
    ['000', '', 0],
  ])('digitar %j mostra %j (%i centavos)', (raw, display, cents) => {
    expect(maskCurrencyInput(raw)).toEqual({ display, cents })
  })

  it('apagar o último caractere desloca para a direita', () => {
    // o usuário tinha "12,34" e apagou o "4"
    expect(maskCurrencyInput('12,3')).toEqual({ display: '1,23', cents: 123 })
  })

  it('ignora letras e símbolos ao colar', () => {
    expect(maskCurrencyInput('R$ 1.234,56')).toEqual({ display: '1.234,56', cents: 123456 })
    expect(maskCurrencyInput('abc')).toEqual({ display: '', cents: 0 })
    expect(maskCurrencyInput('12a3')).toEqual({ display: '1,23', cents: 123 })
  })

  it('limita a 11 dígitos', () => {
    expect(maskCurrencyInput('999999999999')).toEqual({ display: '999.999.999,99', cents: 99999999999 })
  })
})

describe('formatCentsPlain', () => {
  it('formata sem o símbolo da moeda', () => {
    expect(formatCentsPlain(0)).toBe('0,00')
    expect(formatCentsPlain(123456)).toBe('1.234,56')
  })
})
