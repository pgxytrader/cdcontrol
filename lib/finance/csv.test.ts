import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { csvAmount, csvText, transactionsCsv } from './csv'

const base: TransactionRow = {
  id: '1',
  type: 'expense',
  description: 'Mercado',
  amount_cents: 123456,
  date: '2026-10-05',
  status: 'paid',
  category_id: 'mercado',
  account_id: 'itau',
  destination_account_id: null,
  credit_card_id: null,
  invoice_id: null,
  installment_plan_id: null,
  installment_number: null,
  notes: null,
  created_at: '2026-10-05T10:00:00Z',
  installment_plans: null,
  card_invoices: null,
  recurrence_id: null,
  occurrence_date: null,
  recurrences: null,
}

const lookups = {
  categories: [
    { id: 'mercado', name: 'Mercado', parentId: null },
    { id: 'casa', name: 'Moradia', parentId: null },
    { id: 'luz', name: 'Luz', parentId: 'casa' },
  ],
  accounts: [
    { id: 'itau', name: 'Itaú' },
    { id: 'poup', name: 'Poupança' },
  ],
  cards: [{ id: 'nubank', name: 'Nubank' }],
}

const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean)

describe('csvText', () => {
  it('aspas quando há ; " ou quebra de linha, com " duplicada', () => {
    expect(csvText('simples')).toBe('simples')
    expect(csvText('a;b')).toBe('"a;b"')
    expect(csvText('diz "oi"')).toBe('"diz ""oi"""')
    expect(csvText('linha\nnova')).toBe('"linha\nnova"')
  })
  it('neutraliza fórmulas', () => {
    expect(csvText('=SOMA(A1)')).toBe("'=SOMA(A1)")
    expect(csvText('-desconto')).toBe("'-desconto")
    expect(csvText('+1')).toBe("'+1")
    expect(csvText('@cmd')).toBe("'@cmd")
    expect(csvText('=a;b')).toBe(`"'=a;b"`)
  })
})

describe('csvAmount', () => {
  it('vírgula decimal, sem milhar, despesa negativa', () => {
    expect(csvAmount(123456, 'expense')).toBe('-1234,56')
    expect(csvAmount(5, 'income')).toBe('0,05')
    expect(csvAmount(100000, 'transfer')).toBe('1000,00')
    expect(csvAmount(2500, 'invoice_payment')).toBe('25,00')
  })
})

describe('transactionsCsv', () => {
  it('BOM, cabeçalho e uma despesa em conta', () => {
    const csv = transactionsCsv([base], lookups)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(lines(csv)[0]).toBe('Data;Descrição;Tipo;Categoria;Conta/Cartão;Status;Valor')
    expect(lines(csv)[1]).toBe('05/10/2026;Mercado;Despesa;Mercado;Itaú;Pago;-1234,56')
  })
  it('valor negativo nunca recebe a proteção de fórmula', () => {
    expect(lines(transactionsCsv([base], lookups))[1].endsWith(';-1234,56')).toBe(true)
  })
  it('subcategoria, parcela no cartão e pendente', () => {
    const row: TransactionRow = {
      ...base,
      description: 'Geladeira',
      category_id: 'luz',
      account_id: null,
      credit_card_id: 'nubank',
      installment_plan_id: 'p1',
      installment_number: 3,
      installment_plans: { installments_count: 10 },
      status: 'pending',
      amount_cents: 33333,
    }
    expect(lines(transactionsCsv([row], lookups))[1]).toBe('05/10/2026;Geladeira (3/10);Despesa;Moradia › Luz;Nubank;Pendente;-333,33')
  })
  it('transferência, pagamento de fatura e estorno', () => {
    const transfer: TransactionRow = { ...base, type: 'transfer', description: 'Reserva', category_id: null, destination_account_id: 'poup', amount_cents: 50000 }
    const payment: TransactionRow = { ...base, type: 'invoice_payment', description: 'Pagamento fatura Nubank (out/2026)', category_id: null, credit_card_id: 'nubank', amount_cents: 80000 }
    const refund: TransactionRow = { ...base, type: 'income', description: 'Estorno', category_id: null, account_id: null, credit_card_id: 'nubank', amount_cents: 1500 }
    const [, t, p, r] = lines(transactionsCsv([transfer, payment, refund], lookups))
    expect(t).toBe('05/10/2026;Reserva;Transferência;;Itaú → Poupança;Pago;500,00')
    expect(p).toBe('05/10/2026;Pagamento fatura Nubank (out/2026);Pagamento de fatura;;Itaú → Cartão Nubank;Pago;800,00')
    expect(r).toBe('05/10/2026;Estorno;Receita;;Nubank;Pago;15,00')
  })
  it('descrição com ; aspas, quebra de linha e fórmula', () => {
    const row: TransactionRow = { ...base, description: '=HYPERLINK("x");2\nfim' }
    expect(lines(transactionsCsv([row], lookups)).slice(1).join('\r\n')).toBe(
      `05/10/2026;"'=HYPERLINK(""x"");2\nfim";Despesa;Mercado;Itaú;Pago;-1234,56`,
    )
  })
  it('sem linhas, só o cabeçalho', () => {
    expect(transactionsCsv([], lookups)).toBe('﻿Data;Descrição;Tipo;Categoria;Conta/Cartão;Status;Valor\r\n')
  })
})
