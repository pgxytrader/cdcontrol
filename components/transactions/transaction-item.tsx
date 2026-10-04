import { ArrowLeftRight } from 'lucide-react'
import { CategoryIcon } from '@/components/categories/category-icon'
import type { Category } from '@/lib/categories'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'

type TransactionItemProps = {
  row: TransactionRow
  category?: Category
  accountLabel: string
  onClick: () => void
}

export function TransactionItem({ row, category, accountLabel, onClick }: TransactionItemProps) {
  const isTransfer = row.type === 'transfer'
  const amount = isTransfer ? formatBRL(row.amount_cents) : formatSignedBRL(row.type === 'income' ? row.amount_cents : -row.amount_cents)
  const subtitle = [isTransfer ? null : category?.name, accountLabel, row.status === 'pending' ? 'previsto' : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2">
      {isTransfer ? (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
          <ArrowLeftRight className="size-4" />
        </span>
      ) : (
        <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{row.description}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span
        className={cn(
          'shrink-0 text-right font-medium tabular-nums',
          isTransfer ? 'text-foreground' : row.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {isTransfer ? <span className="sr-only">Transferência de </span> : null}
        {amount}
      </span>
    </button>
  )
}
