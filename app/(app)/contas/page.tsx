import type { Metadata } from 'next'
import Link from 'next/link'
import { AccountFormButton } from '@/components/accounts/account-form'
import { AccountTypeIcon } from '@/components/accounts/account-type-icon'
import { PageHeader } from '@/components/layout/page-header'
import { listAccounts } from '@/lib/accounts'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { ACCOUNT_TYPE_LABELS } from '@/lib/validation/account'

export const metadata: Metadata = { title: 'Contas' }

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ arquivadas?: string }> }) {
  const { arquivadas } = await searchParams
  const showArchived = arquivadas === '1'
  const accounts = await listAccounts({ includeArchived: showArchived })
  const totalCents = accounts.filter((a) => !a.archived).reduce((sum, a) => sum + a.balanceCents, 0)

  return (
    <>
      <PageHeader title="Contas" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Saldo total</p>
          <p className={cn('text-3xl font-semibold tabular-nums', totalCents < 0 && 'text-expense')}>{formatBRL(totalCents)}</p>
        </div>
        <AccountFormButton label="Nova conta" />
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          Cadastre a primeira conta para começar a lançar.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <li key={account.id}>
              <Link
                href={`/contas/${account.id}`}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2',
                  account.archived && 'opacity-60',
                )}
              >
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: account.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{account.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <AccountTypeIcon type={account.type} className="size-3.5" />
                    {[account.institution, ACCOUNT_TYPE_LABELS[account.type], account.archived ? 'arquivada' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <p className={cn('shrink-0 font-medium tabular-nums', account.balanceCents < 0 && 'text-expense')}>
                  {formatBRL(account.balanceCents)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm">
        <Link href={showArchived ? '/contas' : '/contas?arquivadas=1'} className="text-muted-foreground underline underline-offset-4">
          {showArchived ? 'Ocultar arquivadas' : 'Mostrar arquivadas'}
        </Link>
      </p>
    </>
  )
}
