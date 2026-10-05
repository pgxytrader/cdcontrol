import { describe, expect, it } from 'vitest'
import {
  buildTransactionsHref,
  escapeLike,
  filterParams,
  hasActiveFilters,
  normalizeSearch,
  parseTransactionsQuery,
} from './transaction-filters'

const now = new Date('2026-10-15T12:00:00Z')
const ACC = '11111111-1111-4111-8111-111111111111'
const CAT = '33333333-3333-4333-8333-333333333333'
const CARD = '44444444-4444-4444-8444-444444444444'

describe('parseTransactionsQuery', () => {
  it('sem parâmetros usa o mês atual e nenhum filtro', () => {
    expect(parseTransactionsQuery({}, now)).toEqual({ ym: { year: 2026, month: 10 }, q: '', filters: {} })
  })

  it('lê todos os filtros em português', () => {
    const query = parseTransactionsQuery(
      { mes: '2026-03', q: ' padaria ', tipo: 'despesa', categoria: CAT, conta: ACC, status: 'pendente' },
      now,
    )
    expect(query).toEqual({
      ym: { year: 2026, month: 3 },
      q: 'padaria',
      filters: { type: 'expense', categoryId: CAT, accountId: ACC, status: 'pending' },
    })
  })

  it('ignora valores adulterados', () => {
    const query = parseTransactionsQuery(
      { tipo: 'constructor', status: 'xyz', conta: 'nao-uuid', categoria: "' or 1=1 --" },
      now,
    )
    expect(query.filters).toEqual({})
  })

  it('usa o primeiro valor repetido e limita a busca a 100 caracteres', () => {
    const query = parseTransactionsQuery({ tipo: ['receita', 'despesa'], q: 'a'.repeat(150) }, now)
    expect(query.filters.type).toBe('income')
    expect(query.q).toHaveLength(100)
  })
})

describe('filterParams e buildTransactionsHref', () => {
  const query = parseTransactionsQuery({ mes: '2026-03', tipo: 'transferencia', conta: ACC }, now)

  it('filterParams devolve só os filtros, sem o mês', () => {
    expect(filterParams(query)).toEqual({ tipo: 'transferencia', conta: ACC })
  })

  it('monta a URL aplicando o patch', () => {
    expect(buildTransactionsHref(query, { q: 'luz' })).toBe(`/lancamentos?mes=2026-03&q=luz&tipo=transferencia&conta=${ACC}`)
    expect(buildTransactionsHref(query, { filters: {} })).toBe('/lancamentos?mes=2026-03')
    expect(buildTransactionsHref(query, { ym: { year: 2026, month: 4 }, filters: { status: 'paid' } })).toBe(
      '/lancamentos?mes=2026-04&status=pago',
    )
  })

  it('hasActiveFilters', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ status: 'paid' })).toBe(true)
  })
})

describe('normalizeSearch', () => {
  it('é a mesma normalização do parâmetro q (evita loop com texto longo colado)', () => {
    const long = 'a'.repeat(150)
    expect(normalizeSearch('  luz  ')).toBe('luz')
    expect(normalizeSearch(long)).toBe(parseTransactionsQuery({ q: long }, now).q)
    expect(normalizeSearch(long)).toHaveLength(100)
  })
})

describe('escapeLike', () => {
  it('escapa curingas e a barra', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
    expect(escapeLike('padaria')).toBe('padaria')
  })
})

describe('filtros da Fase 3', () => {
  it('lê cartão e pagamento de fatura; ignora valores adulterados', () => {
    expect(parseTransactionsQuery({ cartao: CARD, tipo: 'pagamento-fatura' }, now).filters).toEqual({
      cardId: CARD,
      type: 'invoice_payment',
    })
    expect(parseTransactionsQuery({ cartao: 'nao-uuid', tipo: 'constructor' }, now).filters).toEqual({})
  })

  it('filterParams preserva o cartão', () => {
    const query = parseTransactionsQuery({ cartao: CARD, tipo: 'pagamento-fatura' }, now)
    expect(filterParams(query)).toEqual({ tipo: 'pagamento-fatura', cartao: CARD })
  })
})
