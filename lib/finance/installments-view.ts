export type InstallmentEntry = {
  id: string
  planId: string
  cardId: string
  description: string
  amountCents: number
  installmentNumber: number
  installmentsCount: number
  /** Mês de vencimento da fatura (AAAA-MM-01). */
  referenceMonth: string
}

export type InstallmentMonth<T extends InstallmentEntry> = {
  referenceMonth: string
  totalCents: number
  byCard: { cardId: string; totalCents: number }[]
  items: (T & { remainingCents: number })[]
}

/** Agrupa as parcelas pelo mês em que a fatura vence, com totais e saldo restante de cada compra. */
export function groupInstallmentsByMonth<T extends InstallmentEntry>(entries: T[]): InstallmentMonth<T>[] {
  const remaining = new Map<string, number>()
  const byPlan = new Map<string, T[]>()
  for (const entry of entries) byPlan.set(entry.planId, [...(byPlan.get(entry.planId) ?? []), entry])
  for (const planEntries of byPlan.values()) {
    let running = 0
    for (const entry of [...planEntries].sort((a, b) => b.installmentNumber - a.installmentNumber)) {
      running += entry.amountCents
      remaining.set(entry.id, running)
    }
  }

  const sorted = [...entries].sort(
    (a, b) => a.referenceMonth.localeCompare(b.referenceMonth) || a.description.localeCompare(b.description, 'pt-BR'),
  )
  const months: InstallmentMonth<T>[] = []
  for (const entry of sorted) {
    let month = months.at(-1)
    if (!month || month.referenceMonth !== entry.referenceMonth) {
      month = { referenceMonth: entry.referenceMonth, totalCents: 0, byCard: [], items: [] }
      months.push(month)
    }
    month.totalCents += entry.amountCents
    const card = month.byCard.find((item) => item.cardId === entry.cardId)
    if (card) card.totalCents += entry.amountCents
    else month.byCard.push({ cardId: entry.cardId, totalCents: entry.amountCents })
    month.items.push({ ...entry, remainingCents: remaining.get(entry.id) ?? entry.amountCents })
  }
  return months
}

export function totalCommitted(entries: { amountCents: number }[]): number {
  return entries.reduce((sum, entry) => sum + entry.amountCents, 0)
}
