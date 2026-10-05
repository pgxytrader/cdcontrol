import { formatBRL } from '@/lib/finance/money'

/** Cores do tema (tokens do :root); o previsto usa a mesma cor com opacidade reduzida. */
export const CHART_COLORS = {
  income: 'var(--income)',
  expense: 'var(--expense)',
  primary: 'var(--primary)',
  grid: 'var(--border)',
  muted: 'var(--text-muted)',
} as const

export const PENDING_OPACITY = 0.4

export const tooltipStyle = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 12,
}

export function formatTooltipValue(value: unknown): string {
  return formatBRL(Number(value))
}

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

/** "R$ 1,2 mil", para eixos. */
export function formatCompactBRL(cents: number): string {
  return `R$ ${compact.format(cents / 100)}`
}
