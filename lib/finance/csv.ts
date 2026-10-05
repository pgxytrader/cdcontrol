import type { Category } from '@/lib/categories'
import { formatISODateBR } from '@/lib/dates'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { installmentLabel } from './installments'
import type { TransactionStatus, TransactionType } from './types'

export type CsvLookups = {
  categories: Pick<Category, 'id' | 'name' | 'parentId'>[]
  accounts: { id: string; name: string }[]
  cards: { id: string; name: string }[]
}

const HEADER = ['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta/Cartão', 'Status', 'Valor']

const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
  invoice_payment: 'Pagamento de fatura',
}

const STATUS_LABELS: Record<TransactionStatus, string> = { paid: 'Pago', pending: 'Pendente' }

/** Campo de texto: `'` na frente de fórmulas (=, +, -, @, tab, CR) e aspas quando há ; " ou quebra de linha. */
export function csvText(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** Vírgula decimal sem separador de milhar; só despesa leva sinal (negativo). Nunca passa por csvText. */
export function csvAmount(cents: number, type: TransactionType): string {
  const abs = Math.abs(cents)
  const text = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
  return type === 'expense' ? `-${text}` : text
}

/** CSV para Excel em pt-BR: BOM UTF-8, separador ";" e quebra de linha CRLF. Linhas já com o status efetivo. */
export function transactionsCsv(rows: TransactionRow[], lookups: CsvLookups): string {
  const categories = new Map(lookups.categories.map((category) => [category.id, category]))
  const accounts = new Map(lookups.accounts.map((account) => [account.id, account.name]))
  const cards = new Map(lookups.cards.map((card) => [card.id, card.name]))
  const nameIn = (map: Map<string, string>, id: string | null) => (id ? (map.get(id) ?? '') : '')

  const categoryName = (id: string | null) => {
    const category = id ? categories.get(id) : undefined
    if (!category) return ''
    const parent = category.parentId ? categories.get(category.parentId) : undefined
    return parent ? `${parent.name} › ${category.name}` : category.name
  }

  const source = (row: TransactionRow) => {
    if (row.type === 'transfer') return `${nameIn(accounts, row.account_id)} → ${nameIn(accounts, row.destination_account_id)}`
    if (row.type === 'invoice_payment') {
      return row.credit_card_id ? `${nameIn(accounts, row.account_id)} → Cartão ${nameIn(cards, row.credit_card_id)}` : nameIn(accounts, row.account_id)
    }
    return row.credit_card_id ? nameIn(cards, row.credit_card_id) : nameIn(accounts, row.account_id)
  }

  const lines = rows.map((row) =>
    [
      formatISODateBR(row.date),
      csvText(installmentLabel(row.description, row.installment_number, row.installment_plans?.installments_count ?? null)),
      TYPE_LABELS[row.type],
      csvText(categoryName(row.category_id)),
      csvText(source(row)),
      STATUS_LABELS[row.status],
      csvAmount(row.amount_cents, row.type),
    ].join(';'),
  )
  return `\uFEFF${[HEADER.join(';'), ...lines].join('\r\n')}\r\n`
}
