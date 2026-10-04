import { describe, expect, it } from 'vitest'
import { displayNameSchema, householdNameSchema, inviteCodeSchema, normalizeInviteCode } from './household'

describe('displayNameSchema', () => {
  it('remove espaços nas pontas', () => {
    expect(displayNameSchema.parse({ displayName: '  Gustavo  ' }).displayName).toBe('Gustavo')
  })

  it('recusa nome só com espaços', () => {
    const result = displayNameSchema.safeParse({ displayName: '    ' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Informe seu nome.')
  })

  it('recusa nome com mais de 60 caracteres', () => {
    const result = displayNameSchema.safeParse({ displayName: 'a'.repeat(61) })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Use no máximo 60 caracteres.')
  })
})

describe('householdNameSchema', () => {
  it('remove espaços nas pontas', () => {
    expect(householdNameSchema.parse({ name: ' Casa do Gustavo e da Paula ' }).name).toBe('Casa do Gustavo e da Paula')
  })

  it('recusa vazio e acima de 80 caracteres', () => {
    expect(householdNameSchema.safeParse({ name: '  ' }).error?.issues[0].message).toBe('Informe o nome da casa.')
    expect(householdNameSchema.safeParse({ name: 'a'.repeat(81) }).error?.issues[0].message).toBe(
      'Use no máximo 80 caracteres.',
    )
  })
})

describe('inviteCodeSchema', () => {
  it('normaliza minúsculas, espaços e hífen', () => {
    expect(normalizeInviteCode(' abc-23k ')).toBe('ABC23K')
    expect(inviteCodeSchema.parse({ code: ' abc-23k ' }).code).toBe('ABC23K')
    expect(inviteCodeSchema.parse({ code: 'abc 23k' }).code).toBe('ABC23K')
  })

  it.each(['abc23', 'ABC23KK', 'ABCD10', 'ABCDEO', 'ABCDEI', 'ABCDEL', ''])('recusa %j', (code) => {
    const result = inviteCodeSchema.safeParse({ code })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('O código tem 6 caracteres, entre letras e números.')
  })
})
