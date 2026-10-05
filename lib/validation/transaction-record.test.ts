import { describe, expect, it } from 'vitest'
import { deletionSnapshotSchema, recurrenceSnapshotSchema } from './transaction-record'

const ID = '11111111-1111-4111-8111-111111111111'
const CAT = '33333333-3333-4333-8333-333333333333'
const CARD = '44444444-4444-4444-8444-444444444444'
const INV = '55555555-5555-4555-8555-555555555555'
const PLAN = '66666666-6666-4666-8666-666666666666'

const record = {
  id: ID,
  type: 'expense',
  description: 'Geladeira',
  amount_cents: 3334,
  date: '2026-10-02',
  status: 'paid',
  category_id: CAT,
  account_id: null,
  destination_account_id: null,
  credit_card_id: CARD,
  invoice_id: INV,
  installment_plan_id: PLAN,
  installment_number: 1,
  recurrence_id: null,
  occurrence_date: null,
  source: 'manual',
  external_id: null,
  notes: null,
}

const plan = {
  id: PLAN,
  credit_card_id: CARD,
  category_id: CAT,
  description: 'Geladeira',
  total_amount_cents: 10_000,
  installments_count: 3,
  first_installment_number: 1,
  purchase_date: '2026-10-02',
  first_closing_month: '2026-10-01',
}

describe('deletionSnapshotSchema', () => {
  it('aceita a exclusão de parcelas com o plano', () => {
    expect(deletionSnapshotSchema.parse({ plan, rows: [record] })).toEqual({ plan, rows: [record] })
  })

  it('aceita a exclusão simples, sem plano', () => {
    const single = { ...record, installment_plan_id: null, installment_number: null }
    expect(deletionSnapshotSchema.parse({ plan: null, rows: [single] }).rows).toEqual([single])
  })

  it('recusa snapshot vazio ou adulterado', () => {
    expect(deletionSnapshotSchema.safeParse({ plan: null, rows: [] }).success).toBe(false)
    expect(deletionSnapshotSchema.safeParse({ plan: null, rows: [{ ...record, type: 'hack' }] }).success).toBe(false)
    expect(deletionSnapshotSchema.safeParse({ plan: null, rows: [{ ...record, id: 'x' }] }).success).toBe(false)
    expect(deletionSnapshotSchema.safeParse({ plan: { ...plan, installments_count: 99 }, rows: [record] }).success).toBe(false)
  })
})

describe('recurrenceSnapshotSchema', () => {
  const REC = '77777777-7777-4777-8777-777777777777'
  const recurrence = {
    id: REC,
    type: 'expense',
    description: 'Aluguel',
    amount_cents: 200_000,
    category_id: CAT,
    account_id: ID,
    destination_account_id: null,
    credit_card_id: null,
    frequency: 'monthly',
    start_date: '2026-09-10',
    end_date: null,
    generated_until: '2027-10-05',
    notes: null,
  }
  const row = {
    ...record,
    account_id: ID,
    credit_card_id: null,
    invoice_id: null,
    installment_plan_id: null,
    installment_number: null,
    recurrence_id: REC,
    occurrence_date: '2026-11-10',
    source: 'recurrence',
  }

  it('aceita a série e as linhas apagadas', () => {
    expect(recurrenceSnapshotSchema.safeParse({ recurrence, rows: [row] }).success).toBe(true)
  })

  it('recusa frequência desconhecida e lista vazia', () => {
    expect(recurrenceSnapshotSchema.safeParse({ recurrence: { ...recurrence, frequency: 'daily' }, rows: [row] }).success).toBe(false)
    expect(recurrenceSnapshotSchema.safeParse({ recurrence, rows: [] }).success).toBe(false)
  })
})
