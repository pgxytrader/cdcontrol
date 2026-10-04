import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const TIME_ZONE = 'America/Sao_Paulo'

export type YearMonth = { year: number; month: number }

const yearMonthParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
})

const dateBR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Mês corrente no fuso de São Paulo. */
export function currentYearMonth(now: Date = new Date()): YearMonth {
  const parts = yearMonthParts.formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  return { year, month }
}

/** Lê "AAAA-MM"; retorna null para qualquer outro formato. */
export function parseYearMonth(value: string | null | undefined): YearMonth | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null
  return { year, month }
}

/** Resolve o parâmetro ?mes= da URL, caindo no mês atual quando ausente ou inválido. */
export function resolveYearMonth(value: string | string[] | undefined, now: Date = new Date()): YearMonth {
  const raw = Array.isArray(value) ? value[0] : value
  return parseYearMonth(raw) ?? currentYearMonth(now)
}

export function shiftYearMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 }
}

export function formatYearMonthParam({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function formatYearMonthLabel({ year, month }: YearMonth): string {
  const label = format(new Date(year, month - 1, 1), 'LLLL yyyy', { locale: ptBR })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** dd/mm/aaaa no fuso de São Paulo. */
export function formatDateBR(value: string | Date): string {
  return dateBR.format(typeof value === 'string' ? new Date(value) : value)
}
