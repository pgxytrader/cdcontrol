import { addMonthsClamped } from './invoice'
import type { FundingSource } from './property'

export type PlanSystemKey = 'monthly' | 'intermediate' | 'keys'

export const PLAN_BLOCK_LABELS: Record<PlanSystemKey, string> = {
  monthly: 'Mensais',
  intermediate: 'Intermediárias',
  keys: 'Chaves',
}

export type PaymentPlanInput = {
  monthly: { amountCents: number; count: number; firstDueDate: string } | null
  intermediate: { amountCents: number; count: number; firstDueDate: string; everyMonths: 6 | 12 } | null
  keys: { amountCents: number; dueDate: string } | null
  fundingSource: FundingSource
}

export type PlanRow = {
  systemKey: PlanSystemKey
  description: string
  plannedAmountCents: number
  dueDate: string
  fundingSource: FundingSource
}

/** Gastos previstos do plano da construtora. Datas sempre a partir da 1ª (dia 31 → 28/29 em fevereiro e volta a 31). */
export function buildPaymentPlan(input: PaymentPlanInput): PlanRow[] {
  const rows: PlanRow[] = []
  const { fundingSource } = input
  if (input.monthly) {
    const { amountCents, count, firstDueDate } = input.monthly
    for (let k = 0; k < count; k++) {
      rows.push({
        systemKey: 'monthly',
        description: `Parcela mensal ${k + 1}/${count}`,
        plannedAmountCents: amountCents,
        dueDate: addMonthsClamped(firstDueDate, k),
        fundingSource,
      })
    }
  }
  if (input.intermediate) {
    const { amountCents, count, firstDueDate, everyMonths } = input.intermediate
    for (let k = 0; k < count; k++) {
      rows.push({
        systemKey: 'intermediate',
        description: `Intermediária ${k + 1}/${count}`,
        plannedAmountCents: amountCents,
        dueDate: addMonthsClamped(firstDueDate, k * everyMonths),
        fundingSource,
      })
    }
  }
  if (input.keys) {
    rows.push({
      systemKey: 'keys',
      description: 'Parcela das chaves',
      plannedAmountCents: input.keys.amountCents,
      dueDate: input.keys.dueDate,
      fundingSource,
    })
  }
  return rows
}

export type PlanBlockPreview = { systemKey: PlanSystemKey; count: number; firstDate: string; lastDate: string; totalCents: number }

const ORDER: PlanSystemKey[] = ['monthly', 'intermediate', 'keys']

/** Resumo do que será criado: por bloco e no total. */
export function planPreview(rows: PlanRow[]): { blocks: PlanBlockPreview[]; count: number; totalCents: number } {
  const blocks = ORDER.flatMap((systemKey) => {
    const block = rows.filter((row) => row.systemKey === systemKey)
    if (block.length === 0) return []
    const dates = block.map((row) => row.dueDate).sort()
    return [
      {
        systemKey,
        count: block.length,
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
        totalCents: block.reduce((sum, row) => sum + row.plannedAmountCents, 0),
      },
    ]
  })
  return {
    blocks,
    count: rows.length,
    totalCents: rows.reduce((sum, row) => sum + row.plannedAmountCents, 0),
  }
}
