import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { invalidInput } from './action-result'

describe('invalidInput', () => {
  it('converte erros do zod em erros por campo', () => {
    const schema = z.object({ name: z.string().min(1, { error: 'Informe o nome.' }) })
    const parsed = schema.safeParse({ name: '' })
    if (parsed.success) throw new Error('deveria falhar')

    expect(invalidInput(parsed.error)).toEqual({
      ok: false,
      error: 'Verifique os campos destacados.',
      fieldErrors: { name: ['Informe o nome.'] },
    })
  })
})
