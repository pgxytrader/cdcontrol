import { describe, expect, it } from 'vitest'
import { GENERIC_ERROR, translateError } from './errors'

describe('translateError', () => {
  it('traduz erros do Supabase Auth pelo code', () => {
    expect(translateError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'E-mail ou senha incorretos.',
    )
  })

  it('traduz erros das RPCs pela message', () => {
    expect(translateError({ code: 'P0001', message: 'INVITE_USED' })).toBe('Este código já foi usado.')
    expect(translateError({ code: 'P0001', message: 'HOUSEHOLD_FULL' })).toBe('Esta casa já tem 2 membros.')
    expect(translateError({ message: 'ALREADY_MEMBER' })).toBe('Você já faz parte de uma casa.')
  })

  it('usa a mensagem genérica para erros desconhecidos ou ausentes', () => {
    expect(translateError({ code: '42P01', message: 'relation does not exist' })).toBe(GENERIC_ERROR)
    expect(translateError(null)).toBe(GENERIC_ERROR)
    expect(translateError(undefined)).toBe(GENERIC_ERROR)
  })
})
