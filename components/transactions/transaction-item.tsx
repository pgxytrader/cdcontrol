import { ArrowLeftRight, CreditCard } from 'lucide-react'
import { CategoryIcon } from '@/components/categories/category-icon'
import type { Category } from '@/lib/categories'
import { installmentLabel } from '@/lib/finance/installments'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'

type TransactionItemProps = {
  row: TransactionRow
  category?: Category
  /** Conta, cartão, "Origem → Destino" ou a data, conforme a tela. */
  sourceLabel: string
  onClick: () => void
}

export function TransactionItem({ row, category, sourceLabel, onClick }: TransactionItemProps) {
  const isPayment = row.type === 'invoice_payment'
  // Transferência e pagamento de fatura não são receita nem despesa: sem sinal
  const neutral = row.type === 'transfer' || isPayment
  const amount = neutral ? formatBRL(row.amount_cents) : formatSignedBRL(row.type === 'income' ? row.amount_cents : -row.amount_cents)
  const title = installmentLabel(row.description, row.installment_number, row.installment_plans?.installments_count ?? null)
  const subtitle = [neutral ? null : category?.name, sourceLabel, row.status === 'pending' ? 'previsto' : null]
    .filter(Boolean)
    .join(' · ')
  const NeutralIcon = isPayment ? CreditCard : ArrowLeftRight

  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2">
      {neutral ? (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
          <NeutralIcon className="size-4" />
        </span>
      ) : (
        <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span
        className={cn(
          'shrink-0 text-right font-medium tabular-nums',
          neutral ? 'text-foreground' : row.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {neutral ? <span className="sr-only">{isPayment ? 'Pagamento de fatura de ' : 'Transferência de '}</span> : null}
        {amount}
      </span>
    </button>
  )
}
