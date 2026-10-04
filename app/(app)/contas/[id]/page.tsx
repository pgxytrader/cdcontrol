import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AccountActions } from '@/components/accounts/account-actions'
import { StatementList } from '@/components/accounts/statement-list'
import { PageHeader } from '@/components/layout/page-header'
import { getAccount, listAccounts, toLedgerAccount } from '@/lib/accounts'
import type { PaletteColor } from '@/lib/categories'
import { listCategories } from '@/lib/categories-query'
import { formatISODateBR, resolveYearMonth } from '@/lib/dates'
import { buildStatement } from '@/lib/finance/balance'
import { formatBRL } from '@/lib/finance/money'
import { rowToLedger } from '@/lib/transaction-mappers'
import { listAccountTransactions } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import { ACCOUNT_TYPE_LABELS } from '@/lib/validation/account'
import { uuidSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Conta' }

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mes?: string | string[] }>
}

export default async function AccountPage({ params, searchParams }: Props) {
  const [{ id }, { mes }] = await Promise.all([params, searchParams])
  if (!uuidSchema.safeParse(id).success) notFound()

  const account = await getAccount(id)
  if (!account) notFound()

  const ym = resolveYearMonth(mes)
  const [rows, categories, accounts] = await Promise.all([
    listAccountTransactions(id),
    listCategories(),
    listAccounts({ includeArchived: true }),
  ])
  const statement = buildStatement(
    toLedgerAccount(account),
    rows.map((row) => ({ ...rowToLedger(row), row })),
    ym,
  )

  return (
    <>
      <div className="mb-2">
        <Link href="/contas" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ Contas
        </Link>
      </div>
      <PageHeader title={account.name} ym={ym} basePath={`/contas/${id}`} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {[account.institution, ACCOUNT_TYPE_LABELS[account.type], account.archived ? 'arquivada' : null].filter(Boolean).join(' · ')}
          </p>
          <p className={cn('text-3xl font-semibold tabular-nums', account.balanceCents < 0 && 'text-expense')}>
            {formatBRL(account.balanceCents)}
          </p>
          <p className="text-xs text-muted-foreground">
            Saldo inicial de {formatBRL(account.initialBalanceCents)} em {formatISODateBR(account.initialBalanceDate)}
          </p>
        </div>
        <AccountActions
          id={account.id}
          archived={account.archived}
          initial={{
            name: account.name,
            institution: account.institution ?? '',
            type: account.type,
            initialBalanceCents: account.initialBalanceCents,
            initialBalanceDate: account.initialBalanceDate,
            color: account.color as PaletteColor,
          }}
        />
      </div>
      <StatementList
        statement={statement}
        categories={categories}
        accountNames={new Map(accounts.map((a) => [a.id, a.name]))}
        initialBalanceDate={account.initialBalanceDate}
      />
    </>
  )
}
