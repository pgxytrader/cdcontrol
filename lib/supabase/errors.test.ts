import { describe, expect, it } from 'vitest'
import { CARD_IN_USE, GENERIC_ERROR, translateError } from './errors'

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

describe('erros das finanças', () => {
  it('traduz os códigos novos', () => {
    expect(translateError({ code: 'P0001', message: 'INVALID_PARENT' })).toBe(
      'A categoria-mãe precisa ser do mesmo tipo e não pode ser uma subcategoria.',
    )
    expect(translateError({ code: 'P0001', message: 'INVALID_ACCOUNT' })).toBe('Conta inválida.')
    expect(translateError({ code: 'P0001', message: 'INVALID_CATEGORY' })).toBe('Categoria inválida.')
    expect(translateError({ code: 'P0001', message: 'CATEGORY_KIND_MISMATCH' })).toBe(
      'A categoria não combina com o tipo do lançamento.',
    )
    expect(translateError({ code: '23503', message: 'update or delete violates foreign key' })).toBe(
      'Não é possível excluir: há lançamentos ou subcategorias vinculados. Arquive em vez de excluir.',
    )
    expect(translateError({ code: '23505', message: 'duplicate key value' })).toBe('Este registro já existe.')
  })
})

describe('erros dos cartões', () => {
  it('traduz os códigos da Fase 3', () => {
    expect(translateError({ code: 'P0001', message: 'INVALID_CARD' })).toBe('Cartão inválido.')
    expect(translateError({ code: 'P0001', message: 'INVALID_INVOICE' })).toBe('Fatura inválida.')
    expect(translateError({ code: 'P0001', message: 'INVALID_PLAN' })).toBe('Parcelamento inválido.')
    expect(translateError({ code: 'P0001', message: 'INVALID_INPUT' })).toBe('Dados inválidos.')
    expect(translateError({ code: '23514', message: 'violates check constraint' })).toBe(
      'Os dados do lançamento não combinam. Confira e tente de novo.',
    )
    expect(CARD_IN_USE).toBe('Não é possível excluir: há lançamentos neste cartão. Arquive em vez de excluir.')
  })

  it('traduz os erros de recorrência e orçamento', () => {
    expect(translateError({ message: 'INVALID_RECURRENCE' })).toBe('Recorrência inválida.')
    expect(translateError({ message: 'INVALID_BUDGET_CATEGORY' })).toBe('Orçamento só vale para categorias de despesa principais.')
  })
})
