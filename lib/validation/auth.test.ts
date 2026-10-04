import { describe, expect, it } from 'vitest'
import { loginSchema } from './auth'

describe('loginSchema', () => {
  it('normaliza o e-mail', () => {
    const result = loginSchema.parse({ email: '  Gustavo@Exemplo.com ', password: 'segredo' })
    expect(result.email).toBe('gustavo@exemplo.com')
  })

  it('recusa e-mail inválido com mensagem em português', () => {
    const result = loginSchema.safeParse({ email: 'nao-e-email', password: 'x' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Informe um e-mail válido.')
  })

  it('exige a senha', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Informe a senha.')
  })
})
