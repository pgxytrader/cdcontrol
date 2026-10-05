import { formatYearMonthParam, shiftYearMonth, yearMonthOfISO, type YearMonth } from '@/lib/dates'
import type { CardSchedule, InvoiceCycle, LedgerTransaction } from './types'

const pad = (value: number) => String(value).padStart(2, '0')

/** Quantos dias tem o mês (1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Dia `day` do mês, ou o último dia se o mês for mais curto. */
function clampedDate({ year, month }: YearMonth, day: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`
}

const firstDay = (ym: YearMonth) => `${formatYearMonthParam(ym)}-01`

/** Soma n meses (pode ser negativo); dia inexistente vira o último dia do mês (31/01 + 1 = 28/02). */
export function addMonthsClamped(date: string, n: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return clampedDate(shiftYearMonth({ year, month }, n), day)
}

/** Mês de fechamento (AAAA-MM-01) deslocado k meses. */
export function shiftClosingMonth(closingMonth: string, k: number): string {
  return firstDay(shiftYearMonth(yearMonthOfISO(closingMonth), k))
}

/** Datas do ciclo que fecha em `closingMonth` (PRD 8.2). */
export function cycleForClosingMonth(card: CardSchedule, closingMonth: string): InvoiceCycle {
  const closingYm = yearMonthOfISO(closingMonth)
  // Compara os dias configurados, não os ajustados ao tamanho do mês
  const dueYm = card.dueDay > card.closingDay ? closingYm : shiftYearMonth(closingYm, 1)
  return {
    closingMonth: firstDay(closingYm),
    closingDate: clampedDate(closingYm, card.closingDay),
    dueDate: clampedDate(dueYm, card.dueDay),
    referenceMonth: firstDay(dueYm),
  }
}

/** Ciclo em que cai um lançamento: antes do fechamento do mês → ciclo do mês; no dia ou depois → o seguinte. */
export function cycleForDate(card: CardSchedule, date: string): InvoiceCycle {
  const sameMonth = cycleForClosingMonth(card, `${date.slice(0, 7)}-01`)
  if (date < sameMonth.closingDate) return sameMonth
  return cycleForClosingMonth(card, shiftClosingMonth(sameMonth.closingMonth, 1))
}

/** Ciclo do mês de fechamento: as datas salvas, se a fatura já existe; senão, as calculadas. */
export function storedOrComputedCycle(card: CardSchedule, closingMonth: string, stored: InvoiceCycle[]): InvoiceCycle {
  return stored.find((cycle) => cycle.closingMonth === closingMonth) ?? cycleForClosingMonth(card, closingMonth)
}

/**
 * Ciclo em que cai um lançamento considerando as faturas já salvas (spec 2.3 e 8.2): o fechamento salvo vence.
 * Começa no ciclo calculado e avança enquanto a fatura salva daquele mês já fechou no dia ou antes da data.
 * Compra anterior ao fechamento salvo continua na fatura (compra esquecida).
 */
export function resolveCycleForDate(card: CardSchedule, date: string, stored: InvoiceCycle[]): InvoiceCycle {
  let cycle = storedOrComputedCycle(card, cycleForDate(card, date).closingMonth, stored)
  // Sem fatura salva, o ciclo calculado fecha depois da data: o laço termina
  while (cycle.closingDate <= date) {
    cycle = storedOrComputedCycle(card, shiftClosingMonth(cycle.closingMonth, 1), stored)
  }
  return cycle
}

export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'overdue'

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  paid: 'Paga',
  overdue: 'Vencida',
}

/** Status calculado (PRD 8.4): aberta até o fechamento; depois paga, vencida ou fechada. */
export function invoiceStatus(
  dates: { closingDate: string; dueDate: string },
  amounts: { totalCents: number; paidCents: number },
  today: string,
): InvoiceStatus {
  if (today < dates.closingDate) return 'open'
  if (amounts.paidCents >= amounts.totalCents) return 'paid'
  if (today > dates.dueDate) return 'overdue'
  return 'closed'
}

export type InvoiceAmounts = { chargesCents: number; creditsCents: number; totalCents: number; paidCents: number }

/** Mesma regra da view v_invoice_totals: compras − estornos; pago = pagamentos com status pago. */
export function summarizeInvoice(transactions: Pick<LedgerTransaction, 'type' | 'status' | 'amountCents'>[]): InvoiceAmounts {
  let chargesCents = 0
  let creditsCents = 0
  let paidCents = 0
  for (const tx of transactions) {
    if (tx.type === 'expense') chargesCents += tx.amountCents
    else if (tx.type === 'income') creditsCents += tx.amountCents
    else if (tx.type === 'invoice_payment' && tx.status === 'paid') paidCents += tx.amountCents
  }
  return { chargesCents, creditsCents, totalCents: chargesCents - creditsCents, paidCents }
}
