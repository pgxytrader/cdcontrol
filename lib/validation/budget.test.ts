import { describe, expect, it } from 'vitest'
import { budgetSchema } from './budget'

const CAT = '33333333-3333-4333-8333-333333333333'

describe('budgetSchema', () => {
  it('aceita valor 0 (remover) e os dois modos', () => {
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-01', amountCents: 0, mode: 'from' }).success).toBe(true)
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-01', amountCents: 150_000, mode: 'only' }).success).toBe(true)
  })

  it('recusa mês fora do dia 1, valor negativo e modo desconhecido', () => {
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-05', amountCents: 1, mode: 'from' }).success).toBe(false)
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-01', amountCents: -1, mode: 'from' }).success).toBe(false)
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-01', amountCents: 1, mode: 'sempre' }).success).toBe(false)
  })
})
