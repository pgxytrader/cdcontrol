import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { MonthSummary } from '@/components/transactions/month-summary'
import { TransactionList } from '@/components/transactions/transaction-list'
import { TransactionsToolbar } from '@/components/transactions/transactions-toolbar'
import { listAccounts } from '@/lib/accounts'
import { listCardOptions } from '@/lib/cards'
import { listCategories } from '@/lib/categories-query'
import { todayISO } from '@/lib/dates'
import { summarizeMonth } from '@/lib/finance/summary'
import { filterParams, parseTransactionsQuery, queryFilters } from '@/lib/transaction-filters'
import { applyEffectiveStatus, rowToLedger } from '@/lib/transaction-mappers'
import { listMonthTransactions, SEARCH_LIMIT, searchTransactions } from '@/lib/transactions'

export const metadata: Metadata = { title: 'Lançamentos' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function TransactionsPage({ searchParams }: Props) {
  const query = parseTransactionsQuery(await searchParams)
  const today = todayISO()
  const [categories, accounts, cards] = await Promise.all([
    listCategories(),
    listAccounts({ includeArchived: true }),
    listCardOptions(),
  ])

  const filters = queryFilters(query, categories)
  const found = query.q ? await searchTransactions(query.q, filters, today) : await listMonthTransactions(query.ym, filters, today)
  // Compras no cartão: previsto/realizado pela data
  const rows = found.map((row) => applyEffectiveStatus(row, today))
  // Trocar de mês sai do modo busca: o seletor preserva só os filtros
  const monthParams = filterParams({ ...query, q: '' })

  return (
    <>
      <PageHeader title="Lançamentos" ym={query.q ? undefined : query.ym} basePath="/lancamentos" extraParams={monthParams} />
      <TransactionsToolbar
        query={query}
        categories={categories}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name, archived: account.archived }))}
        cards={cards.map((card) => ({ id: card.id, name: card.name, archived: card.archived }))}
      />
      {query.q ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {rows.length >= SEARCH_LIMIT
            ? `Mostrando os ${SEARCH_LIMIT} resultados mais recentes para "${query.q}".`
            : `${rows.length} ${rows.length === 1 ? 'resultado' : 'resultados'} para "${query.q}".`}
        </p>
      ) : (
        <MonthSummary summary={summarizeMonth(rows.map(rowToLedger))} />
      )}
      <TransactionList
        rows={rows}
        categories={categories}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
        cards={cards.map((card) => ({ id: card.id, name: card.name }))}
        mode={query.q ? 'search' : 'month'}
      />
    </>
  )
}
