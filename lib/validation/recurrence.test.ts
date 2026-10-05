import { describe, expect, it } from 'vitest'
import {
  occurrenceValuesFromCardInput,
  occurrenceValuesFromTransactionInput,
  recurrenceEditSchema,
  recurrenceFormResolver,
  seriesFromCardInput,
  seriesFromTransactionInput,
  toRecurrenceEditInput,
  toSeriesEditValues,
  type RecurrenceFormValues,
} from './recurrence'
import { cardTransactionSchema, transactionSchema } from './transaction'

const ACC_1 = '11111111-1111-4111-8111-111111111111'
const ACC_2 = '22222222-2222-4222-8222-222222222222'
const CAT = '33333333-3333-4333-8333-333333333333'
const CARD = '44444444-4444-4444-8444-444444444444'

const values: RecurrenceFormValues = {
  type: 'expense',
  amountCents: 200_000,
  description: 'Aluguel',
  categoryId: CAT,
  accountId: ACC_1,
  creditCardId: '',
  destinationAccountId: '',
  frequency: 'monthly',
  nextDate: '2026-10-10',
  endDate: '',
  notes: '',
}

const parse = (form: RecurrenceFormValues) => recurrenceEditSchema.safeParse(toRecurrenceEditInput(form))
const firstPath = (form: RecurrenceFormValues) => parse(form).error?.issues[0].path

describe('recurrenceEditSchema', () => {
  it('aceita despesa em conta e converte vazios em nulo', () => {
    expect(parse(values).data).toMatchObject({ creditCardId: null, destinationAccountId: null, endDate: null, notes: null })
  })

  it('recusa formatos inválidos no campo certo', () => {
    expect(firstPath({ ...values, categoryId: '' })).toEqual(['categoryId'])
    expect(firstPath({ ...values, creditCardId: CARD })).toEqual(['accountId'])
    expect(firstPath({ ...values, accountId: '' })).toEqual(['accountId'])
    expect(firstPath({ ...values, type: 'income', accountId: '', creditCardId: CARD })).toEqual(['accountId'])
    expect(firstPath({ ...values, type: 'transfer', categoryId: '', destinationAccountId: ACC_1 })).toEqual(['destinationAccountId'])
    expect(firstPath({ ...values, endDate: '2026-10-09' })).toEqual(['endDate'])
  })

  it('toSeriesEditValues limpa o que não pertence ao tipo', () => {
    const parsed = recurrenceEditSchema.parse(toRecurrenceEditInput({ ...values, type: 'transfer', destinationAccountId: ACC_2 }))
    expect(toSeriesEditValues(parsed)).toMatchObject({ type: 'transfer', categoryId: null, creditCardId: null, destinationAccountId: ACC_2 })
  })

  it('o resolver devolve o erro no campo', async () => {
    const result = await recurrenceFormResolver({ ...values, description: ' ' }, undefined, { fields: {}, shouldUseNativeValidation: false })
    expect(result.errors.description?.message).toBe('Informe a descrição.')
  })
})

describe('conversões para a série', () => {
  const accountInput = transactionSchema.parse({
    type: 'expense',
    description: 'Aluguel',
    amountCents: 200_000,
    date: '2026-10-10',
    status: 'paid',
    accountId: ACC_1,
    categoryId: CAT,
    repeat: { frequency: 'monthly', endDate: null },
  })

  it('seriesFromTransactionInput usa a data como âncora', () => {
    expect(seriesFromTransactionInput(accountInput)).toEqual({
      type: 'expense',
      description: 'Aluguel',
      amountCents: 200_000,
      categoryId: CAT,
      accountId: ACC_1,
      destinationAccountId: null,
      creditCardId: null,
      notes: null,
      frequency: 'monthly',
      startDate: '2026-10-10',
      endDate: null,
    })
    expect(seriesFromTransactionInput({ ...accountInput, repeat: null })).toBeNull()
  })

  it('seriesFromCardInput e os valores de uma ocorrência', () => {
    const cardInput = cardTransactionSchema.parse({
      type: 'expense',
      description: 'Streaming',
      amountCents: 5_590,
      date: '2026-10-02',
      categoryId: CAT,
      creditCardId: CARD,
      installmentsCount: 1,
      currentInstallment: null,
      repeat: { frequency: 'monthly', endDate: '2027-06-30' },
    })
    expect(seriesFromCardInput(cardInput)).toMatchObject({ accountId: null, creditCardId: CARD, startDate: '2026-10-02', endDate: '2027-06-30' })
    expect(occurrenceValuesFromCardInput(cardInput)).toMatchObject({ creditCardId: CARD, accountId: null, date: '2026-10-02' })
    expect(occurrenceValuesFromTransactionInput(accountInput)).toMatchObject({ accountId: ACC_1, date: '2026-10-10', status: 'paid' })
  })
})
