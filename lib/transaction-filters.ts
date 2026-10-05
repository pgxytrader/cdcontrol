import { formatYearMonthParam, resolveYearMonth, type YearMonth } from '@/lib/dates'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { uuidSchema } from '@/lib/validation/common'

export type TransactionFilters = {
  type?: TransactionType
  categoryId?: string
  accountId?: string
  cardId?: string
  status?: TransactionStatus
}

export type TransactionsQuery = { ym: YearMonth; q: string; filters: TransactionFilters }

type Params = Record<string, string | string[] | undefined>

const TYPE_FROM_PARAM: Record<string, TransactionType> = {
  receita: 'income',
  despesa: 'expense',
  transferencia: 'transfer',
  'pagamento-fatura': 'invoice_payment',
}
const TYPE_TO_PARAM: Record<TransactionType, string> = {
  income: 'receita',
  expense: 'despesa',
  transfer: 'transferencia',
  invoice_payment: 'pagamento-fatura',
}
const STATUS_FROM_PARAM: Record<string, TransactionStatus> = { pago: 'paid', pendente: 'pending' }
const STATUS_TO_PARAM: Record<TransactionStatus, string> = { paid: 'pago', pending: 'pendente' }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

function lookup<T>(map: Record<string, T>, key: string | undefined): T | undefined {
  return key !== undefined && Object.hasOwn(map, key) ? map[key] : undefined
}

function validUuid(value: string | undefined): string | undefined {
  return value && uuidSchema.safeParse(value).success ? value : undefined
}

export const SEARCH_MAX_LENGTH = 100

/** Normalização do texto de busca (igual no servidor e no campo de busca). */
export function normalizeSearch(text: string): string {
  return text.trim().slice(0, SEARCH_MAX_LENGTH)
}

/** Lê os parâmetros da URL de /lancamentos; valores inválidos são ignorados. */
export function parseTransactionsQuery(params: Params, now: Date = new Date()): TransactionsQuery {
  const filters: TransactionFilters = {}
  const type = lookup(TYPE_FROM_PARAM, first(params.tipo))
  const status = lookup(STATUS_FROM_PARAM, first(params.status))
  const categoryId = validUuid(first(params.categoria))
  const accountId = validUuid(first(params.conta))
  const cardId = validUuid(first(params.cartao))
  if (type) filters.type = type
  if (categoryId) filters.categoryId = categoryId
  if (accountId) filters.accountId = accountId
  if (cardId) filters.cardId = cardId
  if (status) filters.status = status
  return {
    ym: resolveYearMonth(params.mes, now),
    q: normalizeSearch(first(params.q) ?? ''),
    filters,
  }
}

/** Parâmetros de busca e filtros (sem o mês), para preservar ao trocar de mês. */
export function filterParams(query: TransactionsQuery): Record<string, string> {
  const params: Record<string, string> = {}
  if (query.q) params.q = query.q
  if (query.filters.type) params.tipo = TYPE_TO_PARAM[query.filters.type]
  if (query.filters.categoryId) params.categoria = query.filters.categoryId
  if (query.filters.accountId) params.conta = query.filters.accountId
  if (query.filters.cardId) params.cartao = query.filters.cardId
  if (query.filters.status) params.status = STATUS_TO_PARAM[query.filters.status]
  return params
}

export function buildTransactionsHref(
  query: TransactionsQuery,
  patch: { ym?: YearMonth; q?: string; filters?: TransactionFilters },
): string {
  const next: TransactionsQuery = {
    ym: patch.ym ?? query.ym,
    q: patch.q ?? query.q,
    filters: patch.filters ?? query.filters,
  }
  const search = new URLSearchParams({ mes: formatYearMonthParam(next.ym), ...filterParams(next) })
  return `/lancamentos?${search.toString()}`
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return Object.values(filters).some(Boolean)
}

/** Escapa curingas do LIKE/ILIKE para buscar o texto literal. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}
