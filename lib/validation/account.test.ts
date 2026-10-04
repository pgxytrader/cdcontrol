import { describe, expect, it } from 'vitest'
import { accountSchema } from './account'

const valid = {
  name: ' Itaú ',
  institution: '',
  type: 'checking',
  initialBalanceCents: -5_000,
  initialBalanceDate: '2026-10-01',
  color: '#3b82f6',
}

describe('accountSchema', () => {
  it('normaliza nome e instituição vazia', () => {
    const parsed = accountSchema.parse(valid)
    expect(parsed.name).toBe('Itaú')
    expect(parsed.institution).toBeNull()
    expect(parsed.initialBalanceCents).toBe(-5_000)
  })

  it('aceita a própria saída (reenvio ao servidor)', () => {
    expect(accountSchema.parse(accountSchema.parse(valid)).institution).toBeNull()
  })

  it('recusa nome vazio, cor fora da paleta e data inválida', () => {
    expect(accountSchema.safeParse({ ...valid, name: '  ' }).error?.issues[0].message).toBe('Informe o nome da conta.')
    expect(accountSchema.safeParse({ ...valid, color: '#000000' }).error?.issues[0].message).toBe('Escolha uma cor.')
    expect(accountSchema.safeParse({ ...valid, initialBalanceDate: '2026-02-30' }).error?.issues[0].message).toBe(
      'Informe uma data válida.',
    )
  })
})
