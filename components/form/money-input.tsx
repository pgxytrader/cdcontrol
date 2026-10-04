'use client'

import { formatCentsPlain, maskCurrencyInput } from '@/lib/finance/currency-input'
import { cn } from '@/lib/utils'

type MoneyInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'size' | 'type'> & {
  valueCents: number
  onChangeCents: (cents: number) => void
  size?: 'md' | 'lg'
}

/** Campo de valor com máscara de moeda (dígitos entram pela direita) e teclado numérico. */
export function MoneyInput({ valueCents, onChangeCents, size = 'md', className, ...props }: MoneyInputProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
      value={valueCents > 0 ? formatCentsPlain(valueCents) : ''}
      onChange={(event) => onChangeCents(maskCurrencyInput(event.target.value).cents)}
      className={cn(
        'w-full min-w-0 text-right tabular-nums outline-none placeholder:text-muted-foreground',
        size === 'lg'
          ? 'bg-transparent text-4xl font-semibold'
          : 'h-9 rounded-lg border border-input bg-surface-2 px-2.5 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  )
}
