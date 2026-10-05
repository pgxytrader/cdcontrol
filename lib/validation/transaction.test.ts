import { describe, expect, it } from 'vitest'
import {
  cardTransactionSchema,
  installmentEditSchema,
  isCardForm,
  toCardPurchaseInput,
  toCardTransactionInput,
  toTransactionInput,
  transactionFormResolver,
  transactionSchema,
  type TransactionFormValues,
} from './transaction'

const ACC_1 = '11111111-1111-4111-8111-111111111111'
const ACC_2 = '22222222-2222-4222-8222-222222222222'
const CAT = '33333333-3333-4333-8333-333333333333'
const CARD = '44444444-4444-4444-8444-444444444444'

const form: TransactionFormValues = {
  type: 'expense',
  amountCents: 1250,
  description: ' Padaria ',
  categoryId: CAT,
  accountId: ACC_1,
  creditCardId: '',
  destinationAccountId: '',
  date: '2026-10-04',
  status: 'paid',
  notes: '',
  installmentsCount: 1,
  inProgress: false,
  currentInstallment: 1,
}

const cardForm: TransactionFormValues = { ...form, accountId: '', creditCardId: CARD }

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

describe('cardTransactionSchema', () => {
  it('compra parcelada: amountCents é o total', () => {
    const parsed = cardTransactionSchema.parse(toCardTransactionInput({ ...cardForm, amountCents: 10_000, installmentsCount: 3 }))
    expect(parsed).toMatchObject({ type: 'expense', creditCardId: CARD, installmentsCount: 3, currentInstallment: null })
    expect(toCardPurchaseInput(parsed)).toEqual({ mode: 'installments', totalCents: 10_000, count: 3, date: '2026-10-04' })
  })

  it('compra em andamento: amountCents é o valor da parcela', () => {
    const parsed = cardTransactionSchema.parse(
      toCardTransactionInput({ ...cardForm, amountCents: 15_000, installmentsCount: 10, inProgress: true, currentInstallment: 3 }),
    )
    expect(toCardPurchaseInput(parsed)).toEqual({ mode: 'in_progress', installmentCents: 15_000, current: 3, count: 10, date: '2026-10-04' })
  })

  it('à vista e estorno (o formulário zera as parcelas da receita)', () => {
    expect(toCardPurchaseInput(cardTransactionSchema.parse(toCardTransactionInput(cardForm)))).toEqual({
      mode: 'single',
      amountCents: 1250,
      date: '2026-10-04',
    })
    const refund = cardTransactionSchema.parse(toCardTransactionInput({ ...cardForm, type: 'income', installmentsCount: 5, inProgress: true }))
    expect(refund).toMatchObject({ type: 'income', installmentsCount: 1, currentInstallment: null })
  })

  it('recusa combinações inválidas', () => {
    const base = toCardTransactionInput(cardForm) as Record<string, unknown>
    const firstIssue = (patch: Record<string, unknown>) => cardTransactionSchema.safeParse({ ...base, ...patch }).error?.issues[0].message
    expect(firstIssue({ type: 'income', installmentsCount: 2 })).toBe('Estorno não pode ser parcelado.')
    expect(firstIssue({ installmentsCount: 1, currentInstallment: 1 })).toBe('Informe o total de parcelas.')
    expect(firstIssue({ installmentsCount: 3, currentInstallment: 4 })).toBe('A parcela atual não pode passar do total.')
    expect(firstIssue({ amountCents: 1, installmentsCount: 2 })).toBe('Valor pequeno demais para tantas parcelas.')
    expect(firstIssue({ installmentsCount: 25 })).toBe('Use no máximo 24 parcelas.')
    expect(firstIssue({ creditCardId: undefined })).toBe('Escolha o cartão.')
  })
})

describe('formulário com cartão', () => {
  it('isCardForm: cartão escolhido e tipo diferente de transferência', () => {
    expect(isCardForm(cardForm)).toBe(true)
    expect(isCardForm(form)).toBe(false)
    expect(isCardForm({ ...cardForm, type: 'transfer' })).toBe(false)
  })

  it('o resolver valida pelo schema do cartão', async () => {
    const result = await transactionFormResolver(
      { ...cardForm, installmentsCount: 3, inProgress: true, currentInstallment: 5 },
      undefined,
      { fields: {}, shouldUseNativeValidation: false },
    )
    expect(result.errors.currentInstallment?.message).toBe('A parcela atual não pode passar do total.')
  })
})

describe('installmentEditSchema', () => {
  it('aceita escopo e normaliza a descrição', () => {
    expect(installmentEditSchema.parse({ scope: 'future', description: ' TV ', categoryId: CAT, notes: '' })).toEqual({
      scope: 'future',
      description: 'TV',
      categoryId: CAT,
      notes: null,
    })
    expect(installmentEditSchema.safeParse({ scope: 'all', description: 'TV', categoryId: CAT }).success).toBe(false)
  })
})
