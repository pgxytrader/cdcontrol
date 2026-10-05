import { formatYearMonthParam, type YearMonth } from '@/lib/dates'

/** Despesa de cartão já comprometida: parcela ou recorrência, pelo mês de vencimento da fatura (AAAA-MM-01). */
export type CommitmentRow = { amountCents: number; referenceMonth: string; kind: 'installment' | 'recurrence' }

export type CommitmentMonth = { ym: YearMonth; key: string; installmentsCents: number; recurrencesCents: number; totalCents: number }
export type Commitment = { months: CommitmentMonth[]; maxTotalCents: number; totalCents: number }

/** Total por mês pedido (zerado quando vazio), separando parcelas e assinaturas. */
export function futureCommitment(rows: CommitmentRow[], months: YearMonth[]): Commitment {
  const byKey = new Map<string, CommitmentMonth>(
    months.map((ym) => {
      const key = formatYearMonthParam(ym)
      return [key, { ym, key, installmentsCents: 0, recurrencesCents: 0, totalCents: 0 }]
    }),
  )
  for (const row of rows) {
    const month = byKey.get(row.referenceMonth.slice(0, 7))
    if (!month) continue
    if (row.kind === 'installment') month.installmentsCents += row.amountCents
    else month.recurrencesCents += row.amountCents
    month.totalCents += row.amountCents
  }
  const list = [...byKey.values()]
  return {
    months: list,
    maxTotalCents: list.reduce((max, month) => Math.max(max, month.totalCents), 0),
    totalCents: list.reduce((sum, month) => sum + month.totalCents, 0),
  }
}
