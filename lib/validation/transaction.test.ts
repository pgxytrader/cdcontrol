import { describe, expect, it } from 'vitest'
import {
  toTransactionInput,
  transactionFormResolver,
  transactionSchema,
  transactionSnapshotSchema,
  type TransactionFormValues,
} from './transaction'

const ACC_1 = '11111111-1111-4111-8111-111111111111'
const ACC_2 = '22222222-2222-4222-8222-222222222222'
const CAT = '33333333-3333-4333-8333-333333333333'

const form: TransactionFormValues = {
  type: 'expense',
  amountCents: 1250,
  description: ' Padaria ',
  categoryId: CAT,
  accountId: ACC_1,
  destinationAccountId: '',
  date: '2026-10-04',
  status: 'paid',
  notes: '',
}

describe('transactionSchema', () => {
  it('aceita despesa e normaliza descrição e observação', () => {
    const parsed = transactionSchema.parse(toTransactionInput(form))
    expect(parsed).toMatchObject({ type: 'expense', description: 'Padaria', notes: null, categoryId: CAT })
  })

  it('exige categoria em receita e despesa', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, categoryId: '' }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['categoryId'], message: 'Escolha a categoria.' })
  })

  it('exige conta', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, accountId: '' }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['accountId'], message: 'Escolha a conta.' })
  })

  it('recusa valor zero', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, amountCents: 0 }))
    expect(result.error?.issues[0].message).toBe('Informe um valor maior que zero.')
  })

  it('transferência ignora categoria e exige destino diferente da origem', () => {
    const transfer = toTransactionInput({ ...form, type: 'transfer', destinationAccountId: ACC_2 })
    const parsed = transactionSchema.parse(transfer)
    expect(parsed).not.toHaveProperty('categoryId')
    expect(parsed).toMatchObject({ type: 'transfer', destinationAccountId: ACC_2 })

    const same = transactionSchema.safeParse(toTransactionInput({ ...form, type: 'transfer', destinationAccountId: ACC_1 }))
    expect(same.error?.issues[0]).toMatchObject({
      path: ['destinationAccountId'],
      message: 'Escolha uma conta diferente da origem.',
    })
  })

  it('recusa data inexistente', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, date: '2026-02-30' }))
    expect(result.error?.issues[0].message).toBe('Informe uma data válida.')
  })

  it('o snapshot aceita a saída do schema (desfazer exclusão)', () => {
    const input = transactionSchema.parse(toTransactionInput(form))
    expect(transactionSnapshotSchema.parse({ id: ACC_2, input }).input).toEqual(input)
  })
})

describe('transactionFormResolver', () => {
  it('devolve o erro no campo do formulário', async () => {
    const result = await transactionFormResolver({ ...form, categoryId: '' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    })
    expect(result.errors.categoryId?.message).toBe('Escolha a categoria.')
  })

  it('sem erros devolve os valores', async () => {
    const result = await transactionFormResolver(form, undefined, { fields: {}, shouldUseNativeValidation: false })
    expect(result.errors).toEqual({})
    expect(result.values).toEqual(form)
  })
})
