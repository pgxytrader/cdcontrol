import { addMonthsClamped, resolveCycleForDate, shiftClosingMonth, storedOrComputedCycle } from './invoice'
import type { CardSchedule, InvoiceCycle } from './types'

export const MAX_INSTALLMENTS = 24

/** Divide o total em n parcelas; o resto dos centavos vai para a primeira (PRD 8.3). */
export function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n)
  const remainder = totalCents - base * n
  return Array.from({ length: n }, (_, index) => (index === 0 ? base + remainder : base))
}

export type CardPurchaseInput =
  | { mode: 'single'; amountCents: number; date: string }
  | { mode: 'installments'; totalCents: number; count: number; date: string }
  /** Compra já em andamento: valor de cada parcela, parcela atual e data da parcela atual. */
  | { mode: 'in_progress'; installmentCents: number; current: number; count: number; date: string }

export type PlanDraft = {
  totalAmountCents: number
  installmentsCount: number
  firstInstallmentNumber: number
  purchaseDate: string
  /** Mês de fechamento da fatura da parcela 1 (mesmo que ela não seja criada). */
  firstClosingMonth: string
}

export type RowDraft = { amountCents: number; date: string; installmentNumber: number | null; cycle: InvoiceCycle }

export type CardPurchase = { plan: PlanDraft | null; rows: RowDraft[] }

/** Parcela k sempre na fatura de firstClosingMonth + (k−1), nunca pela data da parcela. */
function installmentCycle(card: CardSchedule, firstClosingMonth: string, k: number, stored: InvoiceCycle[]): InvoiceCycle {
  return storedOrComputedCycle(card, shiftClosingMonth(firstClosingMonth, k - 1), stored)
}

/** `stored`: faturas já salvas do cartão — o fechamento salvo vence o calculado (resolveCycleForDate). */
export function buildCardPurchase(card: CardSchedule, input: CardPurchaseInput, stored: InvoiceCycle[] = []): CardPurchase {
  if (input.mode === 'single') {
    return {
      plan: null,
      rows: [{ amountCents: input.amountCents, date: input.date, installmentNumber: null, cycle: resolveCycleForDate(card, input.date, stored) }],
    }
  }

  if (input.mode === 'installments') {
    const firstClosingMonth = resolveCycleForDate(card, input.date, stored).closingMonth
    return {
      plan: {
        totalAmountCents: input.totalCents,
        installmentsCount: input.count,
        firstInstallmentNumber: 1,
        purchaseDate: input.date,
        firstClosingMonth,
      },
      rows: splitInstallments(input.totalCents, input.count).map((amountCents, index) => ({
        amountCents,
        date: addMonthsClamped(input.date, index),
        installmentNumber: index + 1,
        cycle: installmentCycle(card, firstClosingMonth, index + 1, stored),
      })),
    }
  }

  const offset = input.current - 1
  const firstClosingMonth = shiftClosingMonth(resolveCycleForDate(card, input.date, stored).closingMonth, -offset)
  const rows: RowDraft[] = []
  for (let k = input.current; k <= input.count; k += 1) {
    rows.push({
      amountCents: input.installmentCents,
      date: addMonthsClamped(input.date, k - input.current),
      installmentNumber: k,
      cycle: installmentCycle(card, firstClosingMonth, k, stored),
    })
  }
  return {
    plan: {
      totalAmountCents: input.installmentCents * input.count,
      installmentsCount: input.count,
      firstInstallmentNumber: input.current,
      // Estimada: só para exibição
      purchaseDate: addMonthsClamped(input.date, -offset),
      firstClosingMonth,
    },
    rows,
  }
}

/** Descrição exibida: "Geladeira (3/10)". */
export function installmentLabel(description: string, number: number | null, count: number | null): string {
  return number !== null && count !== null ? `${description} (${number}/${count})` : description
}
