import { addDaysISO, formatISODateBR } from '@/lib/dates'
import { addMonthsClamped, resolveCycleForDate } from './invoice'
import { defaultStatus, effectiveStatus } from './status'
import type { CardSchedule, InvoiceCycle, TransactionStatus, TransactionType } from './types'

export const RECURRENCE_FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
}

/** A série fica gerada até hoje + 12 meses (PRD 8.6). */
export const RECURRENCE_HORIZON_MONTHS = 12

export type RecurrenceSchedule = { frequency: RecurrenceFrequency; startDate: string; endDate: string | null }

export type SeriesType = 'income' | 'expense' | 'transfer'

/** O que cada lançamento da série copia. Conta ou cartão (receita/despesa) ou duas contas (transferência). */
export type SeriesFields = {
  type: SeriesType
  description: string
  amountCents: number
  categoryId: string | null
  accountId: string | null
  destinationAccountId: string | null
  creditCardId: string | null
  notes: string | null
}

export type Series = SeriesFields & RecurrenceSchedule

/** k-ésima data da série (k = 0 é a própria start_date), sempre a partir da âncora: 31/01 → 28/02 → 31/03. */
export function nthOccurrence(schedule: Pick<RecurrenceSchedule, 'frequency' | 'startDate'>, k: number): string {
  if (schedule.frequency === 'weekly') return addDaysISO(schedule.startDate, 7 * k)
  return addMonthsClamped(schedule.startDate, schedule.frequency === 'monthly' ? k : 12 * k)
}

/** Datas da série em [from, until], nunca depois da data final. */
export function occurrenceDates(schedule: RecurrenceSchedule, from: string, until: string): string[] {
  const last = schedule.endDate !== null && schedule.endDate < until ? schedule.endDate : until
  const dates: string[] = []
  for (let k = 0; ; k++) {
    const date = nthOccurrence(schedule, k)
    if (date > last) break
    if (date >= from) dates.push(date)
  }
  return dates
}

export function horizonDate(today: string): string {
  return addMonthsClamped(today, RECURRENCE_HORIZON_MONTHS)
}

/** Até onde a série deve estar gerada: o horizonte ou a data final, o que vier antes. */
export function untilFor(endDate: string | null, today: string): string {
  const horizon = horizonDate(today)
  return endDate !== null && endDate < horizon ? endDate : horizon
}

export type GenerationWindow = { from: string; until: string }

/** O que falta gerar: do dia seguinte a generated_until até o horizonte (ou a data final). Null quando está em dia. */
export function generationWindow(generatedUntil: string, endDate: string | null, today: string): GenerationWindow | null {
  const from = addDaysISO(generatedUntil, 1)
  const until = untilFor(endDate, today)
  return from <= until ? { from, until } : null
}

/** Cartão da série: dias configurados e faturas já salvas (o fechamento salvo vence o calculado). */
export type CardContext = { schedule: CardSchedule; stored: InvoiceCycle[] }

/** Uma linha a gravar. `id` só vem quando um lançamento existente é regravado (editar "este e os próximos"). */
export type Occurrence = {
  id?: string
  date: string
  occurrenceDate: string
  status: TransactionStatus
  cycle: InvoiceCycle | null
}

/** Em conta nascem pendentes; no cartão o status segue a data e a fatura segue a regra 8.2 (como as compras da Fase 3). */
export function buildOccurrences(dates: string[], card: CardContext | null, today: string): Occurrence[] {
  return dates.map((date) =>
    card
      ? { date, occurrenceDate: date, status: defaultStatus(date, today), cycle: resolveCycleForDate(card.schedule, date, card.stored) }
      : { date, occurrenceDate: date, status: 'pending', cycle: null },
  )
}

/** Lançamento já gravado de uma série: o mínimo para decidir o que trocar. */
export type SeriesTransaction = {
  id: string
  occurrenceDate: string
  type: TransactionType
  status: TransactionStatus
  date: string
  accountId: string | null
}

const isPending = (tx: SeriesTransaction, today: string) => effectiveStatus(tx, today) === 'pending'

/** Ocorrências a partir de `fromDate` (inclusive) que ainda não se realizaram. As pagas nunca entram. */
export function occurrencesToReplace(transactions: SeriesTransaction[], fromDate: string, today: string): string[] {
  return transactions.filter((tx) => tx.occurrenceDate >= fromDate && isPending(tx, today)).map((tx) => tx.id)
}

/** Primeira ocorrência não realizada de hoje em diante (a "próxima data" da tela Recorrências). */
export function nextOccurrenceDate(transactions: SeriesTransaction[], today: string): string | null {
  let next: string | null = null
  for (const tx of transactions) {
    if (tx.occurrenceDate >= today && isPending(tx, today) && (next === null || tx.occurrenceDate < next)) next = tx.occurrenceDate
  }
  return next
}

const WEEKDAYS = [
  'Todo domingo',
  'Toda segunda-feira',
  'Toda terça-feira',
  'Toda quarta-feira',
  'Toda quinta-feira',
  'Toda sexta-feira',
  'Todo sábado',
]

/** "Todo dia 10, sem data final", "Toda segunda-feira, até 31/12/2026", "Todo ano em 15/03, sem data final". */
export function describeSchedule(schedule: RecurrenceSchedule): string {
  const [year, month, day] = schedule.startDate.split('-').map(Number)
  let base: string
  if (schedule.frequency === 'monthly') base = `Todo dia ${day}`
  else if (schedule.frequency === 'weekly') base = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  else base = `Todo ano em ${formatISODateBR(schedule.startDate).slice(0, 5)}`
  return `${base}, ${schedule.endDate ? `até ${formatISODateBR(schedule.endDate)}` : 'sem data final'}`
}

export type SeriesState = Series & { id: string; generatedUntil: string }

/** `card` é o cartão dos valores novos (null quando a série fica em conta). */
export type ChangeContext = { transactions: SeriesTransaction[]; today: string; card: CardContext | null }

/** Estado completo da série depois da mudança, o que apagar e o que gravar. */
export type SeriesChange = { series: Series; deleteIds: string[]; occurrences: Occurrence[]; generatedUntil: string }

export type OccurrenceValues = SeriesFields & { date: string; status: TransactionStatus }

export type SeriesEditValues = SeriesFields & { frequency: RecurrenceFrequency; nextDate: string; endDate: string | null }

function seriesOf(state: SeriesState): Series {
  return {
    type: state.type,
    description: state.description,
    amountCents: state.amountCents,
    categoryId: state.categoryId,
    accountId: state.accountId,
    destinationAccountId: state.destinationAccountId,
    creditCardId: state.creditCardId,
    notes: state.notes,
    frequency: state.frequency,
    startDate: state.startDate,
    endDate: state.endDate,
  }
}

function fieldsOf(values: SeriesFields): SeriesFields {
  return {
    type: values.type,
    description: values.description,
    amountCents: values.amountCents,
    categoryId: values.categoryId,
    accountId: values.accountId,
    destinationAccountId: values.destinationAccountId,
    creditCardId: values.creditCardId,
    notes: values.notes,
  }
}

const earlier = (a: string, b: string) => (a < b ? a : b)

/** Ocorrências de `from` até onde a série deve estar gerada. */
function regenerate(series: Series, from: string, ctx: ChangeContext): { occurrences: Occurrence[]; generatedUntil: string } {
  const generatedUntil = untilFor(series.endDate, ctx.today)
  const dates = from <= generatedUntil ? occurrenceDates(series, from, generatedUntil) : []
  return { occurrences: buildOccurrences(dates, ctx.card, ctx.today), generatedUntil }
}

/** Série nova: a primeira ocorrência é o lançamento salvo no formulário. */
export function createSeries(
  series: Series,
  firstStatus: TransactionStatus,
  card: CardContext | null,
  today: string,
): { occurrences: Occurrence[]; generatedUntil: string } {
  const until = untilFor(series.endDate, today)
  // Série que começa depois do horizonte: grava só a primeira
  const generatedUntil = until < series.startDate ? series.startDate : until
  const occurrences = buildOccurrences(occurrenceDates(series, series.startDate, generatedUntil), card, today)
  if (!card && occurrences.length > 0) occurrences[0] = { ...occurrences[0], status: firstStatus }
  return { occurrences, generatedUntil }
}

/** "Editar este e os próximos": regrava este lançamento (mesmo id) e troca as não realizadas seguintes. */
export function changeFollowing(
  current: SeriesState,
  occurrence: SeriesTransaction,
  values: OccurrenceValues,
  ctx: ChangeContext,
): SeriesChange {
  const anchorChanged = values.date !== occurrence.date
  const startDate = anchorChanged ? values.date : current.startDate
  const endDate = current.endDate !== null && current.endDate < startDate ? startDate : current.endDate
  const series: Series = { ...fieldsOf(values), frequency: current.frequency, startDate, endDate }
  const occurrenceDate = anchorChanged ? values.date : occurrence.occurrenceDate

  const others = ctx.transactions.filter((tx) => tx.id !== occurrence.id)
  const deleteIds = [occurrence.id, ...occurrencesToReplace(others, addDaysISO(occurrence.occurrenceDate, 1), ctx.today)]

  const [rewritten] = buildOccurrences([values.date], ctx.card, ctx.today)
  const self: Occurrence = { ...rewritten, id: occurrence.id, occurrenceDate, status: ctx.card ? rewritten.status : values.status }
  const rest = regenerate(series, addDaysISO(occurrenceDate, 1), ctx)
  return { series, deleteIds, occurrences: [self, ...rest.occurrences], generatedUntil: rest.generatedUntil }
}

/** "Excluir este e os próximos": a série termina no dia anterior; este sai mesmo se já pago. */
export function removeFollowing(current: SeriesState, occurrence: SeriesTransaction, ctx: ChangeContext): SeriesChange {
  const endDate = addDaysISO(occurrence.occurrenceDate, -1)
  const others = ctx.transactions.filter((tx) => tx.id !== occurrence.id)
  return {
    series: { ...seriesOf(current), endDate },
    deleteIds: [occurrence.id, ...occurrencesToReplace(others, addDaysISO(occurrence.occurrenceDate, 1), ctx.today)],
    occurrences: [],
    generatedUntil: earlier(endDate, current.generatedUntil),
  }
}

/** Edição pela tela Recorrências: troca as não realizadas de hoje em diante. */
export function changeSeries(current: SeriesState, values: SeriesEditValues, ctx: ChangeContext): SeriesChange {
  const anchorChanged = values.frequency !== current.frequency || values.nextDate !== nextOccurrenceDate(ctx.transactions, ctx.today)
  const series: Series = {
    ...fieldsOf(values),
    frequency: values.frequency,
    startDate: anchorChanged ? values.nextDate : current.startDate,
    endDate: values.endDate,
  }
  const deleteIds = occurrencesToReplace(ctx.transactions, ctx.today, ctx.today)
  return { series, deleteIds, ...regenerate(series, ctx.today, ctx) }
}

/** Encerrar: a série termina hoje e as não realizadas depois de hoje saem. */
export function endSeries(current: SeriesState, ctx: ChangeContext): SeriesChange {
  return {
    series: { ...seriesOf(current), endDate: ctx.today },
    deleteIds: occurrencesToReplace(ctx.transactions, addDaysISO(ctx.today, 1), ctx.today),
    occurrences: [],
    generatedUntil: earlier(ctx.today, current.generatedUntil),
  }
}
