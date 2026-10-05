import { ArrowLeftRight, Building2, CreditCard, Repeat } from 'lucide-react'
import { CategoryIcon } from '@/components/categories/category-icon'
import type { Category } from '@/lib/categories'
import { formatISODateBR } from '@/lib/dates'
import type { Statement } from '@/lib/finance/balance'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import type { LedgerTransaction } from '@/lib/finance/types'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'

type StatementTransaction = LedgerTransaction & { row: TransactionRow }

type StatementListProps = {
  statement: Statement<StatementTransaction>
  categories: Category[]
  accountNames: Map<string, string>
  initialBalanceDate: string
}

export function StatementList({ statement, categories, accountNames, initialBalanceDate }: StatementListProps) {
  if (statement.beforeInitialDate) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
        Esta conta começou em {formatISODateBR(initialBalanceDate)}.
      </p>
    )
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]))

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex justify-between px-4 py-3 text-sm">
        <span className="text-muted-foreground">Saldo de abertura</span>
        <span className="tabular-nums">{formatBRL(statement.openingCents)}</span>
      </div>
      {statement.rows.length === 0 ? (
        <p className="border-y border-border px-4 py-6 text-center text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {statement.rows.map(({ transaction, deltaCents, runningCents }) => {
            const row = transaction.row
            const category = row.category_id ? categoryById.get(row.category_id) : undefined
            const isTransfer = row.type === 'transfer'
            const isPayment = row.type === 'invoice_payment'
            const note =
              runningCents === null ? (row.status === 'pending' ? 'previsto' : 'antes do saldo inicial') : null
            const subtitle = [
              formatISODateBR(row.date),
              isTransfer
                ? `${accountNames.get(row.account_id ?? '') ?? '?'} → ${accountNames.get(row.destination_account_id ?? '') ?? '?'}`
                : isPayment
                  ? null
                  : category?.name,
              row.source === 'property' ? 'Imóvel' : null,
              note,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                {isTransfer || isPayment ? (
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
                    {isPayment ? <CreditCard className="size-4" /> : <ArrowLeftRight className="size-4" />}
                  </span>
                ) : (
                  <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1 font-medium">
                    <span className="truncate">{row.description}</span>
                    {row.recurrence_id ? (
                      <>
                        <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="sr-only">(recorrente)</span>
                      </>
                    ) : null}
                    {row.source === 'property' ? (
                      <>
                        <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="sr-only">(imóvel)</span>
                      </>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className={cn('font-medium', deltaCents >= 0 ? 'text-income' : 'text-expense', runningCents === null && 'opacity-60')}>
                    {formatSignedBRL(deltaCents)}
                  </p>
                  {runningCents !== null ? <p className="text-xs text-muted-foreground">{formatBRL(runningCents)}</p> : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex justify-between px-4 py-3 text-sm font-medium">
        <span>Saldo final do mês</span>
        <span className="tabular-nums">{formatBRL(statement.closingCents)}</span>
      </div>
    </div>
  )
}
