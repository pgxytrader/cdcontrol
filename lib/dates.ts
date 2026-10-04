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

const isoDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo. */
export function todayISO(now: Date = new Date()): string {
  return isoDateFormat.format(now)
}

/** Intervalo [start, end) do mês, em AAAA-MM-DD. */
export function monthBounds(ym: YearMonth): { start: string; end: string } {
  return {
    start: `${formatYearMonthParam(ym)}-01`,
    end: `${formatYearMonthParam(shiftYearMonth(ym, 1))}-01`,
  }
}

function parseISODate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

/** Soma dias a uma data de calendário (sem fuso). */
export function addDaysISO(iso: string, days: number): string {
  const { year, month, day } = parseISODate(iso)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function yearMonthOfISO(iso: string): YearMonth {
  const { year, month } = parseISODate(iso)
  return { year, month }
}

/** AAAA-MM-DD → dd/mm/aaaa, sem conversão de fuso. */
export function formatISODateBR(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** "Domingo, 4 de outubro". */
export function formatDayHeading(iso: string): string {
  const { year, month, day } = parseISODate(iso)
  const label = format(new Date(year, month - 1, day), "EEEE, d 'de' MMMM", { locale: ptBR })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
