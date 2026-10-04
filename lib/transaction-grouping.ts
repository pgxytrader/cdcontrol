import { formatDayHeading, formatYearMonthLabel, yearMonthOfISO } from '@/lib/dates'
import type { TransactionStatus } from '@/lib/finance/types'

export type TransactionGroup<T> = { key: string; label: string; items: T[] }

function groupBy<T>(items: T[], keyOf: (item: T) => string, labelOf: (key: string) => string): TransactionGroup<T>[] {
  const groups: TransactionGroup<T>[] = []
  for (const item of items) {
    const key = keyOf(item)
    const last = groups.at(-1)
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, label: labelOf(key), items: [item] })
  }
  return groups
}

/** Agrupa itens já ordenados por data. */
export function groupByDay<T extends { date: string }>(items: T[]): TransactionGroup<T>[] {
  return groupBy(items, (item) => item.date, formatDayHeading)
}

export function groupByMonth<T extends { date: string }>(items: T[]): TransactionGroup<T>[] {
  return groupBy(
    items,
    (item) => item.date.slice(0, 7),
    (key) => formatYearMonthLabel(yearMonthOfISO(`${key}-01`)),
  )
}

export function splitPending<T extends { status: TransactionStatus }>(items: T[]): { pending: T[]; paid: T[] } {
  return {
    pending: items.filter((item) => item.status === 'pending'),
    paid: items.filter((item) => item.status === 'paid'),
  }
}
