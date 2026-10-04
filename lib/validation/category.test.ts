import { describe, expect, it } from 'vitest'
import { categorySchema, categoryUpdateSchema } from './category'

describe('categorySchema', () => {
  const valid = { name: ' Padaria ', kind: 'expense', parentId: null, icon: 'coffee', color: '#f97316' }

  it('aceita categoria principal e normaliza o nome', () => {
    expect(categorySchema.parse(valid).name).toBe('Padaria')
  })

  it('aceita subcategoria com mãe uuid', () => {
    const parentId = '11111111-1111-4111-8111-111111111111'
    expect(categorySchema.parse({ ...valid, parentId }).parentId).toBe(parentId)
  })

  it('recusa ícone fora da lista e nome longo', () => {
    expect(categorySchema.safeParse({ ...valid, icon: 'skull' }).error?.issues[0].message).toBe('Escolha um ícone.')
    expect(categorySchema.safeParse({ ...valid, name: 'a'.repeat(41) }).error?.issues[0].message).toBe(
      'Use no máximo 40 caracteres.',
    )
  })

  it('a edição não aceita trocar o tipo', () => {
    const parsed = categoryUpdateSchema.parse({ ...valid, kind: 'income' })
    expect(parsed).not.toHaveProperty('kind')
  })
})
