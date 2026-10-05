import { describe, expect, it } from 'vitest'
import { cardSchema, cardSubtitle } from './card'

const ACC = '11111111-1111-4111-8111-111111111111'
const valid = {
  name: ' Nubank ',
  brand: 'mastercard',
  lastFour: '1234',
  limitCents: 500_000,
  closingDay: 3,
  dueDay: 10,
  defaultPaymentAccountId: ACC,
  color: '#3b82f6',
}

describe('cardSchema', () => {
  it('aceita e normaliza o nome', () => {
    expect(cardSchema.parse(valid)).toEqual({ ...valid, name: 'Nubank' })
  })

  it('últimos dígitos e conta padrão vazios viram null', () => {
    expect(cardSchema.parse({ ...valid, lastFour: '', defaultPaymentAccountId: '' })).toMatchObject({
      lastFour: null,
      defaultPaymentAccountId: null,
    })
  })

  it('recusa dígitos inválidos, dia fora de 1–31 e limite negativo', () => {
    expect(cardSchema.safeParse({ ...valid, lastFour: '12a4' }).error?.issues[0].message).toBe('Informe os 4 últimos dígitos.')
    expect(cardSchema.safeParse({ ...valid, closingDay: 32 }).error?.issues[0].path).toEqual(['closingDay'])
    expect(cardSchema.safeParse({ ...valid, dueDay: 0 }).error?.issues[0].message).toBe('Escolha o dia de vencimento.')
    expect(cardSchema.safeParse({ ...valid, limitCents: -1 }).success).toBe(false)
    expect(cardSchema.safeParse({ ...valid, brand: 'diners' }).error?.issues[0].message).toBe('Escolha a bandeira.')
  })
})

describe('cardSubtitle', () => {
  it('bandeira, final e arquivado', () => {
    expect(cardSubtitle({ brand: 'visa', lastFour: '1234', archived: false })).toBe('Visa · •••• 1234')
    expect(cardSubtitle({ brand: 'other', lastFour: null, archived: true })).toBe('Outra · arquivado')
  })
})
