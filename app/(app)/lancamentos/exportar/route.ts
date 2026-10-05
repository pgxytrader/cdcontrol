import { listAccounts } from '@/lib/accounts'
import { getCurrentUser } from '@/lib/auth'
import { listCardOptions } from '@/lib/cards'
import { listCategories } from '@/lib/categories-query'
import { formatYearMonthParam, todayISO } from '@/lib/dates'
import { transactionsCsv } from '@/lib/finance/csv'
import { parseTransactionsQuery, queryFilters } from '@/lib/transaction-filters'
import { applyEffectiveStatus } from '@/lib/transaction-mappers'
import { listMonthTransactions, searchTransactions } from '@/lib/transactions'

/** CSV com exatamente as linhas da tela Lançamentos (mesmo mês, filtros e busca). O RLS vale: usa a sessão de quem pede. */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return new Response('Faça login para exportar.', { status: 401 })

  const query = parseTransactionsQuery(Object.fromEntries(new URL(request.url).searchParams))
  const today = todayISO()
  try {
    const [categories, accounts, cards] = await Promise.all([listCategories(), listAccounts({ includeArchived: true }), listCardOptions()])
    const filters = queryFilters(query, categories)
    const found = query.q ? await searchTransactions(query.q, filters, today) : await listMonthTransactions(query.ym, filters, today)
    const rows = found.map((row) => applyEffectiveStatus(row, today))
    const csv = transactionsCsv(rows, { categories, accounts, cards })
    const filename = query.q ? 'lancamentos-busca.csv' : `lancamentos-${formatYearMonthParam(query.ym)}.csv`
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Falha ao exportar lançamentos', error)
    return new Response('Não foi possível exportar os lançamentos.', { status: 500 })
  }
}
