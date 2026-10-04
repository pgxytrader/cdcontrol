import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { MonthSummary } from '@/components/transactions/month-summary'
import { TransactionList } from '@/components/transactions/transaction-list'
import { TransactionsToolbar } from '@/components/transactions/transactions-toolbar'
import { listAccounts } from '@/lib/accounts'
import { expandCategoryFilter } from '@/lib/categories'
import { listCategories } from '@/lib/categories-query'
import { summarizeMonth } from '@/lib/finance/summary'
import { filterParams, parseTransactionsQuery } from '@/lib/transaction-filters'
import { rowToLedger } from '@/lib/transaction-mappers'
import { listMonthTransactions, SEARCH_LIMIT, searchTransactions } from '@/lib/transactions'

export const metadata: Metadata = { title: 'Lançamentos' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function TransactionsPage({ searchParams }: Props) {
  const query = parseTransactionsQuery(await searchParams)
  const [categories, accounts] = await Promise.all([listCategories(), listAccounts({ includeArchived: true })])

  const filters = {
    type: query.filters.type,
    status: query.filters.status,
    accountId: query.filters.accountId,
    categoryIds: query.filters.categoryId ? expandCategoryFilter(query.filters.categoryId, categories) : undefined,
  }
  const rows = query.q ? await searchTransactions(query.q, filters) : await listMonthTransactions(query.ym, filters)
  // Trocar de mês sai do modo busca: o seletor preserva só os filtros
  const monthParams = filterParams({ ...query, q: '' })

  return (
    <>
      <PageHeader title="Lançamentos" ym={query.q ? undefined : query.ym} basePath="/lancamentos" extraParams={monthParams} />
      <TransactionsToolbar
        query={query}
        categories={categories}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name, archived: account.archived }))}
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
        mode={query.q ? 'search' : 'month'}
      />
    </>
  )
}
