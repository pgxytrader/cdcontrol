import { cycleForClosingMonth, cycleForDate, shiftClosingMonth } from './invoice'
import type { CardSchedule, InvoiceCycle } from './types'

export type CardUsage = { usedCents: number; availableCents: number; ratio: number }

/**
 * Limite usado = soma dos totais − soma dos pagamentos, em todas as faturas (PRD 8.3),
 * menos as recorrências do cartão com data futura: assinatura só ocupa o limite quando é cobrada (spec Fase 4).
 */
export function cardUsage(
  limitCents: number,
  invoices: { totalCents: number; paidCents: number }[],
  futureRecurringCents = 0,
): CardUsage {
  const usedCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0) - futureRecurringCents
  return { usedCents, availableCents: limitCents - usedCents, ratio: limitCents > 0 ? usedCents / limitCents : 0 }
}

export type UsageLevel = 'ok' | 'warning' | 'over'

/** Alerta visual em 80% e 100% do limite. */
export function usageLevel(ratio: number): UsageLevel {
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'warning'
  return 'ok'
}

export type ScheduleInvoice = { id: string; closingMonth: string; closingDate: string }
/** Só compras e estornos: pagamentos nunca mudam de fatura. */
export type ScheduleTransaction = {
  id: string
  invoiceId: string
  date: string
  installmentPlanId: string | null
  installmentNumber: number | null
}
export type SchedulePlan = { id: string; purchaseDate: string; firstInstallmentNumber: number; firstClosingMonth: string }
export type ScheduleChange = {
  invoices: { id: string; cycle: InvoiceCycle }[]
  plans: { id: string; firstClosingMonth: string }[]
  moves: { transactionId: string; cycle: InvoiceCycle }[]
}

const later = (a: string, b: string) => (a > b ? a : b)

/** O que muda quando o cartão passa a fechar/vencer em outros dias (spec 2.3). */
export function rescheduleCard(
  newSchedule: CardSchedule,
  invoices: ScheduleInvoice[],
  transactions: ScheduleTransaction[],
  plans: SchedulePlan[],
  today: string,
): ScheduleChange {
  const open = invoices
    .filter((invoice) => today < invoice.closingDate)
    .sort((a, b) => a.closingMonth.localeCompare(b.closingMonth))
  if (open.length === 0) return { invoices: [], plans: [], moves: [] }

  const earliest = open[0].closingMonth
  const openIds = new Set(open.map((invoice) => invoice.id))
  const closingMonthOf = new Map(invoices.map((invoice) => [invoice.id, invoice.closingMonth]))

  const anchors = new Map<string, string>()
  const planUpdates: ScheduleChange['plans'] = []
  for (const plan of plans) {
    let anchor = plan.firstClosingMonth
    // Plano normal que ainda não começou a ser cobrado: a parcela 1 volta a seguir a regra
    if (plan.firstInstallmentNumber === 1 && plan.firstClosingMonth >= earliest) {
      anchor = later(cycleForDate(newSchedule, plan.purchaseDate).closingMonth, earliest)
      if (anchor !== plan.firstClosingMonth) planUpdates.push({ id: plan.id, firstClosingMonth: anchor })
    }
    anchors.set(plan.id, anchor)
  }

  const moves: ScheduleChange['moves'] = []
  for (const tx of transactions) {
    if (!openIds.has(tx.invoiceId)) continue
    let target: string
    if (tx.installmentPlanId !== null && tx.installmentNumber !== null) {
      const anchor = anchors.get(tx.installmentPlanId)
      if (!anchor) continue
      target = shiftClosingMonth(anchor, tx.installmentNumber - 1)
    } else {
      target = cycleForDate(newSchedule, tx.date).closingMonth
    }
    // Faturas fechadas antes da mudança não recebem lançamentos
    target = later(target, earliest)
    if (target !== closingMonthOf.get(tx.invoiceId)) {
      moves.push({ transactionId: tx.id, cycle: cycleForClosingMonth(newSchedule, target) })
    }
  }

  return {
    invoices: open.map((invoice) => ({ id: invoice.id, cycle: cycleForClosingMonth(newSchedule, invoice.closingMonth) })),
    plans: planUpdates,
    moves,
  }
}
