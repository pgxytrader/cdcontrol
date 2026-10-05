import type { ScheduleChange } from '@/lib/finance/card'
import type { CardPurchase } from '@/lib/finance/installments'
import { defaultStatus } from '@/lib/finance/status'
import type { CardSchedule, InvoiceCycle } from '@/lib/finance/types'

/** Ciclo da fatura nas colunas de card_invoices. */
export function cycleColumns(cycle: InvoiceCycle) {
  return {
    closing_month: cycle.closingMonth,
    closing_date: cycle.closingDate,
    due_date: cycle.dueDate,
    reference_month: cycle.referenceMonth,
  }
}

export function ensureInvoiceArgs(cardId: string, cycle: InvoiceCycle) {
  return {
    p_card_id: cardId,
    p_closing_month: cycle.closingMonth,
    p_closing_date: cycle.closingDate,
    p_due_date: cycle.dueDate,
    p_reference_month: cycle.referenceMonth,
  }
}

export type PurchaseFields = { type: 'income' | 'expense'; description: string; categoryId: string; notes: string | null }

/** Argumentos de create_card_purchase: o plano (se parcelado) e uma linha por parcela, já com a fatura. */
export function purchaseRpcArgs(cardId: string, purchase: CardPurchase, fields: PurchaseFields, today: string) {
  return {
    p_card_id: cardId,
    p_plan: purchase.plan
      ? {
          category_id: fields.categoryId,
          description: fields.description,
          total_amount_cents: purchase.plan.totalAmountCents,
          installments_count: purchase.plan.installmentsCount,
          first_installment_number: purchase.plan.firstInstallmentNumber,
          purchase_date: purchase.plan.purchaseDate,
          first_closing_month: purchase.plan.firstClosingMonth,
        }
      : null,
    p_rows: purchase.rows.map((row) => ({
      type: fields.type,
      description: fields.description,
      amount_cents: row.amountCents,
      date: row.date,
      status: defaultStatus(row.date, today),
      category_id: fields.categoryId,
      notes: fields.notes,
      installment_number: row.installmentNumber,
      ...cycleColumns(row.cycle),
    })),
  }
}

/** Argumentos de apply_card_schedule a partir do resultado de rescheduleCard. */
export function scheduleRpcArgs(cardId: string, schedule: CardSchedule, change: ScheduleChange) {
  return {
    p_card_id: cardId,
    p_closing_day: schedule.closingDay,
    p_due_day: schedule.dueDay,
    p_invoices: change.invoices.map(({ id, cycle }) => ({ id, ...cycleColumns(cycle) })),
    p_plans: change.plans.map(({ id, firstClosingMonth }) => ({ id, first_closing_month: firstClosingMonth })),
    p_moves: change.moves.map(({ transactionId, cycle }) => ({ transaction_id: transactionId, ...cycleColumns(cycle) })),
  }
}
