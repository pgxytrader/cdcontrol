import { formatYearMonthLabel, parseYearMonth, yearMonthOfISO } from '@/lib/dates'

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "Pagamento fatura Nubank (nov/2026)" — o mês é o do vencimento. */
export function paymentDescription(cardName: string, referenceMonth: string): string {
  const { year, month } = yearMonthOfISO(referenceMonth)
  return `Pagamento fatura ${cardName} (${MONTH_ABBR[month - 1]}/${year})`
}

/** "Fatura de Novembro 2026". */
export function invoiceTitle(referenceMonth: string): string {
  return `Fatura de ${formatYearMonthLabel(yearMonthOfISO(referenceMonth))}`
}

/** ?fatura=AAAA-MM (mês de fechamento) → AAAA-MM-01; qualquer outra coisa → null. */
export function parseInvoiceParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return parseYearMonth(raw) ? `${raw}-01` : null
}

export function invoiceHref(cardId: string, closingMonth: string): string {
  return `/cartoes/${cardId}?fatura=${closingMonth.slice(0, 7)}`
}
