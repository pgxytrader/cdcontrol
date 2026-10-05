// lib/property-filters.test.ts
import { describe, expect, it } from 'vitest'
import type { PropertyExpense } from '@/lib/finance/property'
import { filterExpenses, hasExpenseFilters, parsePropertyQuery, propertyHref } from './property-filters'

const UUID = '0b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'
const TYPE = '1b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'

const expense = (patch: Partial<PropertyExpense>): PropertyExpense => ({
  id: 'e',
  propertyId: 'p',
  expenseTypeId: TYPE,
  description: 'X',
  payee: null,
  plannedAmountCents: 1,
  dueDate: '2026-11-10',
  status: 'planned',
  paidAmountCents: null,
  paidDate: null,
  fundingSource: 'own',
  transactionId: null,
  notes: null,
  ...patch,
})

describe('parsePropertyQuery', () => {
  it('lê aba, filtros e gasto; inválidos são ignorados', () => {
    expect(
      parsePropertyQuery({ imovel: UUID, aba: 'gastos', tipo: TYPE, status: 'atrasado', fonte: 'fgts', de: '2026-01', ate: '2026-12', gasto: UUID }),
    ).toEqual({
      propertyId: UUID,
      tab: 'gastos',
      filters: { typeId: TYPE, status: 'overdue', source: 'fgts', from: { year: 2026, month: 1 }, to: { year: 2026, month: 12 } },
      expenseId: UUID,
    })
    expect(parsePropertyQuery({ imovel: 'x', aba: 'nada', status: 'zzz', fonte: 'zzz', de: '2026-13' })).toEqual({ tab: 'resumo', filters: {} })
  })
})

describe('propertyHref', () => {
  it('monta a URL com imóvel, aba e filtros; patch troca partes', () => {
    const query = parsePropertyQuery({ imovel: UUID, aba: 'gastos', status: 'pago', fonte: 'proprios', de: '2026-01' })
    expect(propertyHref(query)).toBe(`/imovel?imovel=${UUID}&aba=gastos&status=pago&fonte=proprios&de=2026-01`)
    expect(propertyHref(query, { tab: 'resumo', filters: {} })).toBe(`/imovel?imovel=${UUID}&aba=resumo`)
  })
})

describe('filterExpenses', () => {
  const list = [
    expense({ id: 'late', dueDate: '2026-09-10' }),
    expense({ id: 'paid', status: 'paid', paidAmountCents: 1, paidDate: '2026-10-01', dueDate: '2026-10-10', fundingSource: 'fgts' }),
    expense({ id: 'future', dueDate: '2027-02-10', expenseTypeId: 'outro' }),
  ]
  it('por status (inclusive atrasado), fonte, tipo e período do vencimento', () => {
    const today = '2026-10-05'
    expect(filterExpenses(list, { status: 'overdue' }, today).map((e) => e.id)).toEqual(['late'])
    expect(filterExpenses(list, { source: 'fgts' }, today).map((e) => e.id)).toEqual(['paid'])
    expect(filterExpenses(list, { typeId: TYPE }, today).map((e) => e.id)).toEqual(['late', 'paid'])
    expect(filterExpenses(list, { from: { year: 2026, month: 10 }, to: { year: 2026, month: 12 } }, today).map((e) => e.id)).toEqual(['paid'])
    expect(filterExpenses(list, {}, today)).toHaveLength(3)
  })
  it('hasExpenseFilters', () => {
    expect(hasExpenseFilters({})).toBe(false)
    expect(hasExpenseFilters({ source: 'own' })).toBe(true)
  })
})
