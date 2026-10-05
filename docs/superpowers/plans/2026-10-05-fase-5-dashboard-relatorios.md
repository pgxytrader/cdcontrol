# Fase 5 — Dashboard e relatórios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preencher as telas Início (dashboard) e Relatórios com cards, gráficos e comparações, e exportar os lançamentos filtrados em CSV.

**Architecture:** As consultas buscam os lançamentos do período (só as colunas necessárias, paginadas) e funções puras em `lib/finance/` fazem toda a agregação, reaproveitando `effectiveStatus`, `summarizeMonth` e a soma de subcategorias na mãe. Os gráficos (Recharts) são componentes de cliente que só desenham números prontos vindos do servidor. Sem migration.

**Tech Stack:** Next.js 16.3 (App Router, `searchParams` como Promise, Route Handlers), React 19, TypeScript strict, Tailwind 4, Supabase (RLS), Recharts 3, Vitest 5.

**Spec:** [docs/superpowers/specs/2026-10-05-fase-5-dashboard-relatorios-design.md](../specs/2026-10-05-fase-5-dashboard-relatorios-design.md)

## Global Constraints

- Valores sempre inteiros em centavos; formatação só na exibição (`formatBRL`, `formatSignedBRL` de `lib/finance/money.ts`).
- Transferência e pagamento de fatura **não** são receita nem despesa (PRD 8.5).
- Status: o salvo para lançamentos em conta; compras e estornos no cartão pela data (`effectiveStatus` de `lib/finance/status.ts`).
- Subcategoria soma na categoria-mãe; lançamento de despesa sem categoria entra em "Sem categoria".
- Estorno no cartão (`type = 'income'` com `credit_card_id`) conta como receita nos totais gerais e abate o gasto do cartão.
- Datas: `todayISO()` e meses `YearMonth` de `lib/dates.ts` (fuso America/Sao_Paulo).
- Textos da interface em pt-BR. Receita e despesa nunca diferenciadas só pela cor (sinal +/−, ▲/▼ ou rótulo). Valores com `tabular-nums`.
- Layout: sem rolagem horizontal em 360px; dashboard em 3 colunas a partir de `lg` (1024px).
- Arquivos `server-only` (`import 'server-only'`) não têm teste unitário; regras puras em `lib/finance/*.ts` têm (`lib/**/*.test.ts`, Vitest, ambiente node).
- Next 16: antes de escrever Route Handler ou `error.tsx`, ler `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` e `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` (o `error.tsx` recebe `retry`, não `reset`).
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos: `npm test`, `npm run lint`, `npm run build`, `npx tsc --noEmit`.

## Review Focus

1. **Casa sem nenhum dado** (casa nova, mês vazio): todos os painéis renderizam a frase de vazio sem quebrar — nada de `Math.max()` de lista vazia, divisão por zero no % da rosca ou barra com largura `NaN`. Testes: `futureCommitment([])` e `topSlices([])` (Tasks 2 e 3); `%` com total 0 tratado no componente (Task 7).
2. **Compra no cartão com data futura dentro do mês selecionado** deve contar como previsto, igual ao resumo de Lançamentos; uma compra no cartão salva como `pending` mas com data passada conta como realizado. Teste: `toReportRow` (Task 2).
3. **Exportação em modo busca e com filtros**: o CSV deve trazer as mesmas linhas da tela, inclusive com `q`, e sem sessão a rota não devolve dados. Teste: `buildExportHref` com busca e filtros (Task 4); verificação manual da rota (Task 6).
4. **Valor negativo no CSV não pode ser tratado como fórmula**: a proteção contra fórmula vale para textos, nunca para a coluna Valor (`-1234,56` sai sem `'`). Teste em `transactionsCsv` (Task 4).
5. **Variação percentual arredondando para "−0%"** quando a queda é menor que 0,5%: deve mostrar `0%`. Teste em `changeBetween` (Task 2).

---

### Task 1: Períodos dos relatórios (`lib/finance/periods.ts`)

**Files:**
- Create: `lib/finance/periods.ts`
- Test: `lib/finance/periods.test.ts`

**Interfaces:**
- Consumes: `shiftYearMonth`, `monthBounds`, `YearMonth` de `lib/dates.ts`.
- Produces:
  - `REPORT_PERIODS: readonly ['mes','trimestre','semestre','ano','12m']`, `type ReportPeriod`, `PERIOD_LABELS: Record<ReportPeriod, string>`
  - `type MonthRange = { start: YearMonth; end: YearMonth }` (inclusivo)
  - `parsePeriod(value: string | string[] | undefined): ReportPeriod`
  - `periodRange(period: ReportPeriod, ym: YearMonth): MonthRange`
  - `previousRange(period: ReportPeriod, ym: YearMonth): MonthRange`
  - `monthIndex(ym: YearMonth): number`
  - `monthsIn(range: MonthRange): YearMonth[]`
  - `lastMonths(ym: YearMonth, count: number): YearMonth[]` (termina em `ym`, ordem crescente)
  - `rangeBounds(range: MonthRange): { start: string; end: string }` (ISO, `[start, end)`)
  - `formatMonthShort(ym): string` ("out/2026"), `formatMonthAxis(ym): string` ("out/26"), `periodLabel(range): string`

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/periods.test.ts
import { describe, expect, it } from 'vitest'
import {
  formatMonthAxis,
  formatMonthShort,
  lastMonths,
  monthsIn,
  parsePeriod,
  periodLabel,
  periodRange,
  previousRange,
  rangeBounds,
} from './periods'

const ym = (year: number, month: number) => ({ year, month })
const OCT = ym(2026, 10)

describe('parsePeriod', () => {
  it('aceita os atalhos e cai em "mes" no resto', () => {
    expect(parsePeriod('trimestre')).toBe('trimestre')
    expect(parsePeriod(['ano'])).toBe('ano')
    expect(parsePeriod('12m')).toBe('12m')
    expect(parsePeriod('xx')).toBe('mes')
    expect(parsePeriod(undefined)).toBe('mes')
    expect(parsePeriod('constructor')).toBe('mes')
  })
})

describe('periodRange e previousRange', () => {
  it('mês', () => {
    expect(periodRange('mes', OCT)).toEqual({ start: OCT, end: OCT })
    expect(previousRange('mes', OCT)).toEqual({ start: ym(2026, 9), end: ym(2026, 9) })
  })
  it('trimestre em outubro: ago–out x mai–jul', () => {
    expect(periodRange('trimestre', OCT)).toEqual({ start: ym(2026, 8), end: OCT })
    expect(previousRange('trimestre', OCT)).toEqual({ start: ym(2026, 5), end: ym(2026, 7) })
  })
  it('trimestre atravessando a virada do ano', () => {
    expect(periodRange('trimestre', ym(2026, 2))).toEqual({ start: ym(2025, 12), end: ym(2026, 2) })
    expect(previousRange('trimestre', ym(2026, 2))).toEqual({ start: ym(2025, 9), end: ym(2025, 11) })
  })
  it('semestre', () => {
    expect(periodRange('semestre', OCT)).toEqual({ start: ym(2026, 5), end: OCT })
    expect(previousRange('semestre', OCT)).toEqual({ start: ym(2025, 11), end: ym(2026, 4) })
  })
  it('12 meses', () => {
    expect(periodRange('12m', OCT)).toEqual({ start: ym(2025, 11), end: OCT })
    expect(previousRange('12m', OCT)).toEqual({ start: ym(2024, 11), end: ym(2025, 10) })
  })
  it('ano: janeiro até o mês, contra o mesmo trecho do ano anterior', () => {
    expect(periodRange('ano', OCT)).toEqual({ start: ym(2026, 1), end: OCT })
    expect(previousRange('ano', OCT)).toEqual({ start: ym(2025, 1), end: ym(2025, 10) })
    expect(periodRange('ano', ym(2026, 1))).toEqual({ start: ym(2026, 1), end: ym(2026, 1) })
    expect(previousRange('ano', ym(2026, 1))).toEqual({ start: ym(2025, 1), end: ym(2025, 1) })
  })
})

describe('meses e limites', () => {
  it('monthsIn e lastMonths em ordem crescente', () => {
    expect(monthsIn({ start: ym(2025, 11), end: ym(2026, 2) })).toEqual([ym(2025, 11), ym(2025, 12), ym(2026, 1), ym(2026, 2)])
    expect(lastMonths(OCT, 3)).toEqual([ym(2026, 8), ym(2026, 9), OCT])
    expect(lastMonths(OCT, 12)).toHaveLength(12)
  })
  it('rangeBounds devolve [início, fim)', () => {
    expect(rangeBounds({ start: ym(2026, 8), end: OCT })).toEqual({ start: '2026-08-01', end: '2026-11-01' })
    expect(rangeBounds({ start: ym(2026, 12), end: ym(2026, 12) })).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })
})

describe('rótulos', () => {
  it('mês curto e eixo', () => {
    expect(formatMonthShort(OCT)).toBe('out/2026')
    expect(formatMonthAxis(OCT)).toBe('out/26')
  })
  it('periodLabel', () => {
    expect(periodLabel({ start: OCT, end: OCT })).toBe('out/2026')
    expect(periodLabel({ start: ym(2026, 8), end: OCT })).toBe('ago–out/2026')
    expect(periodLabel({ start: ym(2025, 11), end: OCT })).toBe('nov/2025–out/2026')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/finance/periods.test.ts`
Expected: FAIL — "Failed to resolve import './periods'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/finance/periods.ts
import { monthBounds, shiftYearMonth, type YearMonth } from '@/lib/dates'

export const REPORT_PERIODS = ['mes', 'trimestre', 'semestre', 'ano', '12m'] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  mes: 'Mês',
  trimestre: 'Trimestre',
  semestre: 'Semestre',
  ano: 'Ano',
  '12m': '12 meses',
}

/** Intervalo de meses, inclusivo nas duas pontas. */
export type MonthRange = { start: YearMonth; end: YearMonth }

const LENGTH: Record<Exclude<ReportPeriod, 'ano'>, number> = { mes: 1, trimestre: 3, semestre: 6, '12m': 12 }

/** ?periodo= da URL; ausente ou inválido → "mes". */
export function parsePeriod(value: string | string[] | undefined): ReportPeriod {
  const raw = Array.isArray(value) ? value[0] : value
  return REPORT_PERIODS.find((period) => period === raw) ?? 'mes'
}

/** Período terminando em `ym`; "ano" vai de janeiro até `ym`. */
export function periodRange(period: ReportPeriod, ym: YearMonth): MonthRange {
  if (period === 'ano') return { start: { year: ym.year, month: 1 }, end: ym }
  return { start: shiftYearMonth(ym, -(LENGTH[period] - 1)), end: ym }
}

/** Período anterior de mesmo tamanho; "ano" compara com o mesmo trecho do ano anterior. */
export function previousRange(period: ReportPeriod, ym: YearMonth): MonthRange {
  if (period === 'ano') return { start: { year: ym.year - 1, month: 1 }, end: { year: ym.year - 1, month: ym.month } }
  const { start } = periodRange(period, ym)
  return { start: shiftYearMonth(start, -LENGTH[period]), end: shiftYearMonth(start, -1) }
}

export function monthIndex({ year, month }: YearMonth): number {
  return year * 12 + month - 1
}

export function monthsIn({ start, end }: MonthRange): YearMonth[] {
  const count = Math.max(monthIndex(end) - monthIndex(start) + 1, 0)
  return Array.from({ length: count }, (_, index) => shiftYearMonth(start, index))
}

/** Os `count` meses terminando em `ym`, em ordem crescente. */
export function lastMonths(ym: YearMonth, count: number): YearMonth[] {
  return monthsIn({ start: shiftYearMonth(ym, -(count - 1)), end: ym })
}

/** Datas ISO do intervalo, no formato [start, end). */
export function rangeBounds(range: MonthRange): { start: string; end: string } {
  return { start: monthBounds(range.start).start, end: monthBounds(range.end).end }
}

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "out/2026". */
export function formatMonthShort({ year, month }: YearMonth): string {
  return `${MONTH_ABBR[month - 1]}/${year}`
}

/** "out/26", para eixos de gráfico. */
export function formatMonthAxis({ year, month }: YearMonth): string {
  return `${MONTH_ABBR[month - 1]}/${String(year).slice(2)}`
}

/** "out/2026", "ago–out/2026" ou "nov/2025–out/2026". */
export function periodLabel({ start, end }: MonthRange): string {
  if (monthIndex(start) === monthIndex(end)) return formatMonthShort(end)
  if (start.year === end.year) return `${MONTH_ABBR[start.month - 1]}–${formatMonthShort(end)}`
  return `${formatMonthShort(start)}–${formatMonthShort(end)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/finance/periods.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/finance/periods.ts lib/finance/periods.test.ts
git commit -m "feat(relatorios): períodos (mês, trimestre, semestre, ano, 12 meses) e período anterior

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Agregações dos relatórios (`lib/finance/reports.ts`)

**Files:**
- Create: `lib/finance/reports.ts`
- Test: `lib/finance/reports.test.ts`

**Interfaces:**
- Consumes: `effectiveStatus` (`lib/finance/status.ts`), `summarizeMonth` e `type MonthSummary` (`lib/finance/summary.ts`), `formatYearMonthParam`, `YearMonth` (`lib/dates.ts`), `type Category` (`lib/categories.ts`).
- Produces:
  - `type ReportRow = { type: TransactionType; status: TransactionStatus; date: string; amountCents: number; categoryId: string | null; creditCardId: string | null }`
  - `type RawReportRow = { type: string; status: string; date: string; amount_cents: number; category_id: string | null; account_id: string | null; credit_card_id: string | null }`
  - `toReportRow(raw: RawReportRow, today: string): ReportRow`
  - `type MonthPoint = MonthSummary & { ym: YearMonth; key: string }`; `monthlySeries(rows: ReportRow[], months: YearMonth[]): MonthPoint[]`
  - `NO_CATEGORY = 'none'`; `type CategoryAmount = { paid: number; pending: number }`; `categoryTotals(rows: ReportRow[], categories: ReportCategory[]): Map<string, CategoryAmount>`
  - `type ReportCategory = Pick<Category, 'id' | 'name' | 'color' | 'parentId'>`
  - `type Change = { kind: 'pct'; value: number } | { kind: 'new' } | { kind: 'gone' }`; `changeBetween(current: number, previous: number): Change`
  - `type CategoryLine = { categoryId: string; name: string; color: string; totalCents: number; pendingCents: number; previousCents: number; change: Change }`
  - `type CategoryComparison = { lines: CategoryLine[]; total: { totalCents: number; pendingCents: number; previousCents: number; change: Change } }`; `compareCategories(current, previous, categories): CategoryComparison`
  - `type Slice = { key: string; categoryId: string | null; name: string; color: string; valueCents: number }`; `topSlices(lines: Pick<CategoryLine, 'categoryId' | 'name' | 'color' | 'totalCents'>[], n = 5): Slice[]`
  - `type ReportCard = { id: string; name: string; color: string }`; `type CardMonth = { ym: YearMonth; key: string; byCard: Record<string, number>; totalCents: number }`; `type CardMonthly = { cards: ReportCard[]; months: CardMonth[] }`; `cardMonthly(rows: ReportRow[], cards: ReportCard[], months: YearMonth[]): CardMonthly`

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/reports.test.ts
import { describe, expect, it } from 'vitest'
import {
  cardMonthly,
  categoryTotals,
  changeBetween,
  compareCategories,
  monthlySeries,
  NO_CATEGORY,
  topSlices,
  toReportRow,
  type ReportCategory,
  type ReportRow,
} from './reports'

const ym = (year: number, month: number) => ({ year, month })

const row = (patch: Partial<ReportRow>): ReportRow => ({
  type: 'expense',
  status: 'paid',
  date: '2026-10-05',
  amountCents: 1000,
  categoryId: null,
  creditCardId: null,
  ...patch,
})

const categories: ReportCategory[] = [
  { id: 'casa', name: 'Moradia', color: '#3b82f6', parentId: null },
  { id: 'luz', name: 'Luz', color: '#3b82f6', parentId: 'casa' },
  { id: 'mercado', name: 'Mercado', color: '#22c55e', parentId: null },
  { id: 'lazer', name: 'Lazer', color: '#ec4899', parentId: null },
]

describe('toReportRow', () => {
  const raw = { type: 'expense', status: 'pending', date: '2026-10-01', amount_cents: 500, category_id: 'mercado', account_id: null, credit_card_id: 'nubank' }
  it('compra no cartão segue a data: passada vira realizada, futura vira prevista', () => {
    expect(toReportRow(raw, '2026-10-05').status).toBe('paid')
    expect(toReportRow({ ...raw, status: 'paid', date: '2026-10-20' }, '2026-10-05').status).toBe('pending')
  })
  it('lançamento em conta mantém o status salvo', () => {
    expect(toReportRow({ ...raw, account_id: 'itau', credit_card_id: null }, '2026-10-05').status).toBe('pending')
  })
  it('mapeia os campos', () => {
    expect(toReportRow(raw, '2026-10-05')).toEqual({
      type: 'expense', status: 'paid', date: '2026-10-01', amountCents: 500, categoryId: 'mercado', creditCardId: 'nubank',
    })
  })
})

describe('monthlySeries', () => {
  it('separa realizado e previsto, ignora transferência e pagamento de fatura e zera meses vazios', () => {
    const rows = [
      row({ type: 'income', amountCents: 5000, date: '2026-10-01' }),
      row({ type: 'expense', amountCents: 1200, date: '2026-10-02' }),
      row({ type: 'expense', status: 'pending', amountCents: 300, date: '2026-10-25' }),
      row({ type: 'transfer', amountCents: 9999, date: '2026-10-03' }),
      row({ type: 'invoice_payment', amountCents: 8888, date: '2026-10-04' }),
      row({ type: 'income', amountCents: 200, date: '2026-10-06', creditCardId: 'nubank' }),
    ]
    const [sep, oct] = monthlySeries(rows, [ym(2026, 9), ym(2026, 10)])
    expect(sep).toMatchObject({ key: '2026-09', income: { paid: 0, pending: 0 }, expense: { paid: 0, pending: 0 }, balancePaid: 0 })
    expect(oct).toMatchObject({
      ym: ym(2026, 10),
      key: '2026-10',
      income: { paid: 5200, pending: 0 },
      expense: { paid: 1200, pending: 300 },
      balancePaid: 4000,
      balanceProjected: 3700,
    })
  })
})

describe('categoryTotals', () => {
  it('soma subcategoria na mãe, junta sem categoria e só conta despesas', () => {
    const totals = categoryTotals(
      [
        row({ categoryId: 'casa', amountCents: 1000 }),
        row({ categoryId: 'luz', amountCents: 200, status: 'pending' }),
        row({ categoryId: null, amountCents: 50 }),
        row({ type: 'income', categoryId: 'casa', amountCents: 7000 }),
      ],
      categories,
    )
    expect(totals.get('casa')).toEqual({ paid: 1000, pending: 200 })
    expect(totals.get(NO_CATEGORY)).toEqual({ paid: 50, pending: 0 })
    expect(totals.has('luz')).toBe(false)
  })
})

describe('changeBetween', () => {
  it('percentual arredondado, novo, zerou e sem −0', () => {
    expect(changeBetween(1120, 1000)).toEqual({ kind: 'pct', value: 12 })
    expect(changeBetween(920, 1000)).toEqual({ kind: 'pct', value: -8 })
    expect(changeBetween(500, 0)).toEqual({ kind: 'new' })
    expect(changeBetween(0, 500)).toEqual({ kind: 'gone' })
    expect(changeBetween(0, 0)).toEqual({ kind: 'pct', value: 0 })
    const tiny = changeBetween(9996, 10000)
    expect(tiny).toEqual({ kind: 'pct', value: 0 })
    expect(Object.is(tiny.kind === 'pct' && tiny.value, -0)).toBe(false)
  })
})

describe('compareCategories', () => {
  it('monta as linhas, ordena pelo maior total, tira zeradas e soma o total', () => {
    const current = new Map([
      ['casa', { paid: 1000, pending: 200 }],
      ['mercado', { paid: 1100, pending: 0 }],
      [NO_CATEGORY, { paid: 50, pending: 0 }],
    ])
    const previous = new Map([
      ['casa', { paid: 1000, pending: 0 }],
      ['lazer', { paid: 300, pending: 0 }],
    ])
    const result = compareCategories(current, previous, categories)
    expect(result.lines.map((line) => line.categoryId)).toEqual(['casa', 'mercado', 'lazer', NO_CATEGORY])
    expect(result.lines[0]).toEqual({
      categoryId: 'casa', name: 'Moradia', color: '#3b82f6', totalCents: 1200, pendingCents: 200, previousCents: 1000, change: { kind: 'pct', value: 20 },
    })
    expect(result.lines[1].change).toEqual({ kind: 'new' })
    expect(result.lines[2]).toMatchObject({ name: 'Lazer', totalCents: 0, change: { kind: 'gone' } })
    expect(result.lines[3]).toMatchObject({ name: 'Sem categoria', color: '#64748b' })
    expect(result.total).toEqual({ totalCents: 2350, pendingCents: 200, previousCents: 1300, change: { kind: 'pct', value: 81 } })
  })
  it('empate no total ordena pelo nome', () => {
    const current = new Map([
      ['mercado', { paid: 100, pending: 0 }],
      ['lazer', { paid: 100, pending: 0 }],
    ])
    expect(compareCategories(current, new Map(), categories).lines.map((line) => line.name)).toEqual(['Lazer', 'Mercado'])
  })
})

describe('topSlices', () => {
  const line = (categoryId: string, totalCents: number) => ({ categoryId, name: categoryId, color: '#000', totalCents })
  it('lista vazia', () => {
    expect(topSlices([])).toEqual([])
  })
  it('até 5 sem "Outras"; sem categoria não vira link', () => {
    const slices = topSlices([line('a', 5), line(NO_CATEGORY, 4), line('c', 0)])
    expect(slices.map((slice) => slice.key)).toEqual(['a', NO_CATEGORY])
    expect(slices[1].categoryId).toBeNull()
  })
  it('mais de 5 junta o resto em "Outras"', () => {
    const slices = topSlices([line('a', 70), line('b', 60), line('c', 50), line('d', 40), line('e', 30), line('f', 20), line('g', 10)])
    expect(slices).toHaveLength(6)
    expect(slices[5]).toEqual({ key: 'outras', categoryId: null, name: 'Outras', color: '#475569', valueCents: 30 })
  })
})

describe('cardMonthly', () => {
  const cards = [
    { id: 'nubank', name: 'Nubank', color: '#a855f7' },
    { id: 'inter', name: 'Inter', color: '#f97316' },
    { id: 'velho', name: 'Antigo', color: '#64748b' },
  ]
  it('compras menos estornos por cartão e mês; cartão sem movimento fica fora', () => {
    const rows = [
      row({ creditCardId: 'nubank', amountCents: 1000, date: '2026-09-10' }),
      row({ creditCardId: 'nubank', amountCents: 500, date: '2026-10-10', status: 'pending' }),
      row({ creditCardId: 'inter', type: 'income', amountCents: 300, date: '2026-10-11' }),
      row({ creditCardId: 'nubank', type: 'invoice_payment', amountCents: 9999, date: '2026-10-12' }),
      row({ creditCardId: 'velho', amountCents: 700, date: '2026-01-01' }),
      row({ amountCents: 400, date: '2026-10-01' }),
    ]
    const result = cardMonthly(rows, cards, [ym(2026, 9), ym(2026, 10)])
    expect(result.cards.map((card) => card.id)).toEqual(['inter', 'nubank'])
    expect(result.months[0]).toEqual({ ym: ym(2026, 9), key: '2026-09', byCard: { inter: 0, nubank: 1000 }, totalCents: 1000 })
    expect(result.months[1]).toEqual({ ym: ym(2026, 10), key: '2026-10', byCard: { inter: -300, nubank: 500 }, totalCents: 200 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/finance/reports.test.ts`
Expected: FAIL — "Failed to resolve import './reports'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/finance/reports.ts
import type { Category } from '@/lib/categories'
import { formatYearMonthParam, type YearMonth } from '@/lib/dates'
import { effectiveStatus } from './status'
import { summarizeMonth, type MonthSummary } from './summary'
import type { TransactionStatus, TransactionType } from './types'

/** Linha mínima para relatórios, já com o status efetivo (cartão pela data). */
export type ReportRow = {
  type: TransactionType
  status: TransactionStatus
  date: string
  amountCents: number
  categoryId: string | null
  creditCardId: string | null
}

export type RawReportRow = {
  type: string
  status: string
  date: string
  amount_cents: number
  category_id: string | null
  account_id: string | null
  credit_card_id: string | null
}

export function toReportRow(raw: RawReportRow, today: string): ReportRow {
  const type = raw.type as TransactionType
  const status = effectiveStatus({ type, status: raw.status as TransactionStatus, date: raw.date, accountId: raw.account_id }, today)
  return {
    type,
    status,
    date: raw.date,
    amountCents: Number(raw.amount_cents),
    categoryId: raw.category_id,
    creditCardId: raw.credit_card_id,
  }
}

export type MonthPoint = MonthSummary & { ym: YearMonth; key: string }

/** Receitas e despesas de cada mês pedido (mesma regra de summarizeMonth); meses sem lançamento saem zerados. */
export function monthlySeries(rows: ReportRow[], months: YearMonth[]): MonthPoint[] {
  const byMonth = new Map<string, ReportRow[]>()
  for (const row of rows) {
    const key = row.date.slice(0, 7)
    const list = byMonth.get(key)
    if (list) list.push(row)
    else byMonth.set(key, [row])
  }
  return months.map((ym) => {
    const key = formatYearMonthParam(ym)
    return { ym, key, ...summarizeMonth(byMonth.get(key) ?? []) }
  })
}

export const NO_CATEGORY = 'none'
const NO_CATEGORY_INFO = { name: 'Sem categoria', color: '#64748b' }

export type CategoryAmount = { paid: number; pending: number }
export type ReportCategory = Pick<Category, 'id' | 'name' | 'color' | 'parentId'>

/** Despesas por categoria-mãe (subcategoria soma na mãe; sem categoria em NO_CATEGORY). */
export function categoryTotals(rows: ReportRow[], categories: ReportCategory[]): Map<string, CategoryAmount> {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const totals = new Map<string, CategoryAmount>()
  for (const row of rows) {
    if (row.type !== 'expense') continue
    const category = row.categoryId ? byId.get(row.categoryId) : undefined
    const key = category ? (category.parentId ?? category.id) : NO_CATEGORY
    const amount = totals.get(key) ?? { paid: 0, pending: 0 }
    amount[row.status] += row.amountCents
    totals.set(key, amount)
  }
  return totals
}

export type Change = { kind: 'pct'; value: number } | { kind: 'new' } | { kind: 'gone' }

/** Variação em % (inteiro); "novo" sem gasto antes; "gone" quando zerou. */
export function changeBetween(current: number, previous: number): Change {
  if (previous === 0) return current > 0 ? { kind: 'new' } : { kind: 'pct', value: 0 }
  if (current === 0) return { kind: 'gone' }
  // `|| 0` troca −0 por 0
  return { kind: 'pct', value: Math.round(((current - previous) / previous) * 100) || 0 }
}

export type CategoryLine = {
  categoryId: string
  name: string
  color: string
  totalCents: number
  pendingCents: number
  previousCents: number
  change: Change
}

export type CategoryComparison = {
  lines: CategoryLine[]
  total: { totalCents: number; pendingCents: number; previousCents: number; change: Change }
}

const ZERO: CategoryAmount = { paid: 0, pending: 0 }

/** Uma linha por categoria com gasto em algum dos dois períodos; maior total primeiro, empate pelo nome. */
export function compareCategories(
  current: Map<string, CategoryAmount>,
  previous: Map<string, CategoryAmount>,
  categories: ReportCategory[],
): CategoryComparison {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const keys = new Set([...current.keys(), ...previous.keys()])
  const lines = [...keys]
    .map((key) => {
      const now = current.get(key) ?? ZERO
      const before = previous.get(key) ?? ZERO
      const totalCents = now.paid + now.pending
      const previousCents = before.paid + before.pending
      const info = (key === NO_CATEGORY ? undefined : byId.get(key)) ?? NO_CATEGORY_INFO
      return {
        categoryId: key,
        name: info.name,
        color: info.color,
        totalCents,
        pendingCents: now.pending,
        previousCents,
        change: changeBetween(totalCents, previousCents),
      }
    })
    .filter((line) => line.totalCents !== 0 || line.previousCents !== 0)
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'))

  const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0)
  const pendingCents = lines.reduce((sum, line) => sum + line.pendingCents, 0)
  const previousCents = lines.reduce((sum, line) => sum + line.previousCents, 0)
  return { lines, total: { totalCents, pendingCents, previousCents, change: changeBetween(totalCents, previousCents) } }
}

export type Slice = { key: string; categoryId: string | null; name: string; color: string; valueCents: number }

const OTHERS_COLOR = '#475569'

/** As `n` maiores fatias positivas e "Outras" com a soma do resto (omitida se vazia). */
export function topSlices(lines: Pick<CategoryLine, 'categoryId' | 'name' | 'color' | 'totalCents'>[], n = 5): Slice[] {
  const positive = lines
    .filter((line) => line.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'))
  const slices: Slice[] = positive.slice(0, n).map((line) => ({
    key: line.categoryId,
    categoryId: line.categoryId === NO_CATEGORY ? null : line.categoryId,
    name: line.name,
    color: line.color,
    valueCents: line.totalCents,
  }))
  const rest = positive.slice(n).reduce((sum, line) => sum + line.totalCents, 0)
  if (rest > 0) slices.push({ key: 'outras', categoryId: null, name: 'Outras', color: OTHERS_COLOR, valueCents: rest })
  return slices
}

export type ReportCard = { id: string; name: string; color: string }
export type CardMonth = { ym: YearMonth; key: string; byCard: Record<string, number>; totalCents: number }
export type CardMonthly = { cards: ReportCard[]; months: CardMonth[] }

/** Compras menos estornos por cartão e mês (realizado + previsto). Só cartões com movimento nos meses pedidos. */
export function cardMonthly(rows: ReportRow[], cards: ReportCard[], months: YearMonth[]): CardMonthly {
  const keys = new Set(months.map(formatYearMonthParam))
  const sums = new Map<string, Map<string, number>>()
  const used = new Set<string>()
  for (const row of rows) {
    if (!row.creditCardId || (row.type !== 'expense' && row.type !== 'income')) continue
    const key = row.date.slice(0, 7)
    if (!keys.has(key)) continue
    used.add(row.creditCardId)
    const month = sums.get(key) ?? new Map<string, number>()
    const signed = row.type === 'expense' ? row.amountCents : -row.amountCents
    month.set(row.creditCardId, (month.get(row.creditCardId) ?? 0) + signed)
    sums.set(key, month)
  }
  const shown = cards.filter((card) => used.has(card.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return {
    cards: shown,
    months: months.map((ym) => {
      const key = formatYearMonthParam(ym)
      const month = sums.get(key)
      const byCard = Object.fromEntries(shown.map((card) => [card.id, month?.get(card.id) ?? 0]))
      const totalCents = Object.values(byCard).reduce((sum, value) => sum + value, 0)
      return { ym, key, byCard, totalCents }
    }),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/finance/reports.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/finance/reports.ts lib/finance/reports.test.ts
git commit -m "feat(relatorios): série mensal, despesas por categoria com comparação, fatias da rosca e gasto por cartão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Comprometimento futuro e faturas do dashboard

**Files:**
- Create: `lib/finance/commitment.ts`, `lib/finance/dashboard.ts`
- Test: `lib/finance/commitment.test.ts`, `lib/finance/dashboard.test.ts`

**Interfaces:**
- Consumes: `formatYearMonthParam`, `YearMonth` (`lib/dates.ts`); `invoiceStatus`, `type InvoiceStatus` (`lib/finance/invoice.ts`); `type InvoiceCycle` (`lib/finance/types.ts`).
- Produces:
  - `type CommitmentRow = { amountCents: number; referenceMonth: string; kind: 'installment' | 'recurrence' }` (`referenceMonth` = AAAA-MM-01)
  - `type CommitmentMonth = { ym: YearMonth; key: string; installmentsCents: number; recurrencesCents: number; totalCents: number }`
  - `type Commitment = { months: CommitmentMonth[]; maxTotalCents: number; totalCents: number }`
  - `futureCommitment(rows: CommitmentRow[], months: YearMonth[]): Commitment`
  - `type DashboardCard = { id: string; name: string; color: string; currentCycle: InvoiceCycle }`
  - `type CardInvoiceTotals = { creditCardId: string; cycle: InvoiceCycle; totalCents: number; paidCents: number }`
  - `type DashboardInvoice = { cardId: string; cardName: string; cardColor: string; cycle: InvoiceCycle; totalCents: number; remainingCents: number; status: InvoiceStatus }`
  - `dashboardInvoices(cards: DashboardCard[], invoices: CardInvoiceTotals[], today: string): DashboardInvoice[]`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/finance/commitment.test.ts
import { describe, expect, it } from 'vitest'
import { futureCommitment } from './commitment'

const ym = (year: number, month: number) => ({ year, month })
const months = [ym(2026, 10), ym(2026, 11), ym(2026, 12)]

describe('futureCommitment', () => {
  it('sem lançamentos: meses zerados e máximo 0', () => {
    const result = futureCommitment([], months)
    expect(result.months.map((month) => month.totalCents)).toEqual([0, 0, 0])
    expect(result.maxTotalCents).toBe(0)
    expect(result.totalCents).toBe(0)
  })
  it('separa parcelas e assinaturas pelo mês de vencimento e ignora meses fora da janela', () => {
    const result = futureCommitment(
      [
        { amountCents: 10000, referenceMonth: '2026-10-01', kind: 'installment' },
        { amountCents: 4000, referenceMonth: '2026-10-01', kind: 'recurrence' },
        { amountCents: 10000, referenceMonth: '2026-11-01', kind: 'installment' },
        { amountCents: 9999, referenceMonth: '2027-05-01', kind: 'installment' },
      ],
      months,
    )
    expect(result.months[0]).toEqual({ ym: ym(2026, 10), key: '2026-10', installmentsCents: 10000, recurrencesCents: 4000, totalCents: 14000 })
    expect(result.months[1].totalCents).toBe(10000)
    expect(result.months[2].totalCents).toBe(0)
    expect(result.maxTotalCents).toBe(14000)
    expect(result.totalCents).toBe(24000)
  })
})
```

```ts
// lib/finance/dashboard.test.ts
import { describe, expect, it } from 'vitest'
import { dashboardInvoices } from './dashboard'
import type { InvoiceCycle } from './types'

const cycle = (closingMonth: string, closingDate: string, dueDate: string): InvoiceCycle => ({
  closingMonth,
  closingDate,
  dueDate,
  referenceMonth: `${dueDate.slice(0, 7)}-01`,
})

const SEP = cycle('2026-09-01', '2026-09-03', '2026-09-10')
const OCT = cycle('2026-10-01', '2026-10-03', '2026-10-10')
const NOV = cycle('2026-11-01', '2026-11-03', '2026-11-10')
const DEC = cycle('2026-12-01', '2026-12-03', '2026-12-10')
const card = { id: 'nubank', name: 'Nubank', color: '#a855f7', currentCycle: NOV }

describe('dashboardInvoices', () => {
  it('fechadas não quitadas antes (vencida e fechada), depois a do ciclo atual; pagas e futuras fora', () => {
    const result = dashboardInvoices(
      [card],
      [
        { creditCardId: 'nubank', cycle: SEP, totalCents: 1000, paidCents: 1000 },
        { creditCardId: 'nubank', cycle: OCT, totalCents: 5000, paidCents: 2000 },
        { creditCardId: 'nubank', cycle: NOV, totalCents: 3000, paidCents: 0 },
        { creditCardId: 'nubank', cycle: DEC, totalCents: 800, paidCents: 0 },
        { creditCardId: 'outro', cycle: OCT, totalCents: 7000, paidCents: 0 },
      ],
      '2026-10-12',
    )
    expect(result).toEqual([
      { cardId: 'nubank', cardName: 'Nubank', cardColor: '#a855f7', cycle: OCT, totalCents: 5000, remainingCents: 3000, status: 'overdue' },
      { cardId: 'nubank', cardName: 'Nubank', cardColor: '#a855f7', cycle: NOV, totalCents: 3000, remainingCents: 3000, status: 'open' },
    ])
  })
  it('fatura fechada dentro do prazo aparece como "closed"', () => {
    const result = dashboardInvoices([card], [{ creditCardId: 'nubank', cycle: OCT, totalCents: 5000, paidCents: 0 }], '2026-10-05')
    expect(result[0].status).toBe('closed')
  })
  it('ciclo atual ainda sem fatura sai zerado', () => {
    expect(dashboardInvoices([card], [], '2026-10-12')).toEqual([
      { cardId: 'nubank', cardName: 'Nubank', cardColor: '#a855f7', cycle: NOV, totalCents: 0, remainingCents: 0, status: 'open' },
    ])
  })
  it('sem cartões, lista vazia', () => {
    expect(dashboardInvoices([], [], '2026-10-12')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/finance/commitment.test.ts lib/finance/dashboard.test.ts`
Expected: FAIL — "Failed to resolve import './commitment'" e "'./dashboard'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/finance/commitment.ts
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
```

```ts
// lib/finance/dashboard.ts
import { invoiceStatus, type InvoiceStatus } from './invoice'
import type { InvoiceCycle } from './types'

export type DashboardCard = { id: string; name: string; color: string; currentCycle: InvoiceCycle }
export type CardInvoiceTotals = { creditCardId: string; cycle: InvoiceCycle; totalCents: number; paidCents: number }
export type DashboardInvoice = {
  cardId: string
  cardName: string
  cardColor: string
  cycle: InvoiceCycle
  totalCents: number
  remainingCents: number
  status: InvoiceStatus
}

/** Por cartão: faturas fechadas ainda não quitadas (mais antiga primeiro) e a fatura do ciclo atual. */
export function dashboardInvoices(cards: DashboardCard[], invoices: CardInvoiceTotals[], today: string): DashboardInvoice[] {
  return cards.flatMap((card) => {
    const entry = (cycle: InvoiceCycle, totalCents: number, paidCents: number, status: InvoiceStatus): DashboardInvoice => ({
      cardId: card.id,
      cardName: card.name,
      cardColor: card.color,
      cycle,
      totalCents,
      remainingCents: totalCents - paidCents,
      status,
    })
    const mine = invoices.filter((invoice) => invoice.creditCardId === card.id)
    const unpaidClosed = mine
      .filter((invoice) => invoice.cycle.closingMonth !== card.currentCycle.closingMonth)
      .map((invoice) => ({ invoice, status: invoiceStatus(invoice.cycle, invoice, today) }))
      .filter(({ status }) => status === 'closed' || status === 'overdue')
      .sort((a, b) => a.invoice.cycle.closingDate.localeCompare(b.invoice.cycle.closingDate))
      .map(({ invoice, status }) => entry(invoice.cycle, invoice.totalCents, invoice.paidCents, status))
    const current = mine.find((invoice) => invoice.cycle.closingMonth === card.currentCycle.closingMonth)
    return [...unpaidClosed, entry(card.currentCycle, current?.totalCents ?? 0, current?.paidCents ?? 0, 'open')]
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/finance/commitment.test.ts lib/finance/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/commitment.ts lib/finance/commitment.test.ts lib/finance/dashboard.ts lib/finance/dashboard.test.ts
git commit -m "feat(dashboard): comprometimento futuro por mês e faturas a pagar por cartão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: CSV e parâmetros de exportação

**Files:**
- Create: `lib/finance/csv.ts`
- Modify: `lib/transaction-filters.ts` (acrescentar `queryFilters` e `buildExportHref` no fim do arquivo)
- Test: `lib/finance/csv.test.ts`, `lib/transaction-filters.test.ts` (acrescentar um `describe` no fim)

**Interfaces:**
- Consumes: `type TransactionRow` (`lib/transaction-mappers.ts`), `installmentLabel` (`lib/finance/installments.ts`), `formatISODateBR`, `formatYearMonthParam` (`lib/dates.ts`), `expandCategoryFilter`, `type Category` (`lib/categories.ts`), `filterParams`, `type TransactionsQuery` (`lib/transaction-filters.ts`).
- Produces:
  - `type CsvLookups = { categories: Pick<Category, 'id' | 'name' | 'parentId'>[]; accounts: { id: string; name: string }[]; cards: { id: string; name: string }[] }`
  - `csvText(value: string): string`, `csvAmount(cents: number, type: TransactionType): string`
  - `transactionsCsv(rows: TransactionRow[], lookups: CsvLookups): string`
  - `type QueryFilters = { type?: TransactionType; status?: TransactionStatus; accountId?: string; cardId?: string; categoryIds?: string[] }`
  - `queryFilters(query: TransactionsQuery, categories: Category[]): QueryFilters`
  - `buildExportHref(query: TransactionsQuery): string` → `/lancamentos/exportar?mes=…&…`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/finance/csv.test.ts
import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { csvAmount, csvText, transactionsCsv } from './csv'

const base: TransactionRow = {
  id: '1',
  type: 'expense',
  description: 'Mercado',
  amount_cents: 123456,
  date: '2026-10-05',
  status: 'paid',
  category_id: 'mercado',
  account_id: 'itau',
  destination_account_id: null,
  credit_card_id: null,
  invoice_id: null,
  installment_plan_id: null,
  installment_number: null,
  notes: null,
  created_at: '2026-10-05T10:00:00Z',
  installment_plans: null,
  card_invoices: null,
  recurrence_id: null,
  occurrence_date: null,
  recurrences: null,
}

const lookups = {
  categories: [
    { id: 'mercado', name: 'Mercado', parentId: null },
    { id: 'casa', name: 'Moradia', parentId: null },
    { id: 'luz', name: 'Luz', parentId: 'casa' },
  ],
  accounts: [
    { id: 'itau', name: 'Itaú' },
    { id: 'poup', name: 'Poupança' },
  ],
  cards: [{ id: 'nubank', name: 'Nubank' }],
}

const lines = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n')

describe('csvText', () => {
  it('aspas quando há ; " ou quebra de linha, com " duplicada', () => {
    expect(csvText('simples')).toBe('simples')
    expect(csvText('a;b')).toBe('"a;b"')
    expect(csvText('diz "oi"')).toBe('"diz ""oi"""')
    expect(csvText('linha\nnova')).toBe('"linha\nnova"')
  })
  it('neutraliza fórmulas', () => {
    expect(csvText('=SOMA(A1)')).toBe("'=SOMA(A1)")
    expect(csvText('-desconto')).toBe("'-desconto")
    expect(csvText('+1')).toBe("'+1")
    expect(csvText('@cmd')).toBe("'@cmd")
    expect(csvText('=a;b')).toBe(`"'=a;b"`)
  })
})

describe('csvAmount', () => {
  it('vírgula decimal, sem milhar, despesa negativa', () => {
    expect(csvAmount(123456, 'expense')).toBe('-1234,56')
    expect(csvAmount(5, 'income')).toBe('0,05')
    expect(csvAmount(100000, 'transfer')).toBe('1000,00')
    expect(csvAmount(2500, 'invoice_payment')).toBe('25,00')
  })
})

describe('transactionsCsv', () => {
  it('BOM, cabeçalho e uma despesa em conta', () => {
    const csv = transactionsCsv([base], lookups)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(lines(csv)[0]).toBe('Data;Descrição;Tipo;Categoria;Conta/Cartão;Status;Valor')
    expect(lines(csv)[1]).toBe('05/10/2026;Mercado;Despesa;Mercado;Itaú;Pago;-1234,56')
  })
  it('valor negativo nunca recebe a proteção de fórmula', () => {
    expect(lines(transactionsCsv([base], lookups))[1].endsWith(';-1234,56')).toBe(true)
  })
  it('subcategoria, parcela no cartão e pendente', () => {
    const row: TransactionRow = {
      ...base,
      description: 'Geladeira',
      category_id: 'luz',
      account_id: null,
      credit_card_id: 'nubank',
      installment_plan_id: 'p1',
      installment_number: 3,
      installment_plans: { installments_count: 10 },
      status: 'pending',
      amount_cents: 33333,
    }
    expect(lines(transactionsCsv([row], lookups))[1]).toBe('05/10/2026;Geladeira (3/10);Despesa;Moradia › Luz;Nubank;Pendente;-333,33')
  })
  it('transferência, pagamento de fatura e estorno', () => {
    const transfer: TransactionRow = { ...base, type: 'transfer', description: 'Reserva', category_id: null, destination_account_id: 'poup', amount_cents: 50000 }
    const payment: TransactionRow = { ...base, type: 'invoice_payment', description: 'Pagamento fatura Nubank (out/2026)', category_id: null, credit_card_id: 'nubank', amount_cents: 80000 }
    const refund: TransactionRow = { ...base, type: 'income', description: 'Estorno', category_id: null, account_id: null, credit_card_id: 'nubank', amount_cents: 1500 }
    const [, t, p, r] = lines(transactionsCsv([transfer, payment, refund], lookups))
    expect(t).toBe('05/10/2026;Reserva;Transferência;;Itaú → Poupança;Pago;500,00')
    expect(p).toBe('05/10/2026;Pagamento fatura Nubank (out/2026);Pagamento de fatura;;Itaú → Cartão Nubank;Pago;800,00')
    expect(r).toBe('05/10/2026;Estorno;Receita;;Nubank;Pago;15,00')
  })
  it('descrição com ; aspas, quebra de linha e fórmula', () => {
    const row: TransactionRow = { ...base, description: '=HYPERLINK("x");2\nfim' }
    expect(lines(transactionsCsv([row], lookups)).slice(1).join('\r\n')).toBe(
      `05/10/2026;"'=HYPERLINK(""x"");2\nfim";Despesa;Mercado;Itaú;Pago;-1234,56`,
    )
  })
  it('sem linhas, só o cabeçalho', () => {
    expect(transactionsCsv([], lookups)).toBe('\uFEFFData;Descrição;Tipo;Categoria;Conta/Cartão;Status;Valor\r\n')
  })
})
```

Acrescentar no fim de `lib/transaction-filters.test.ts` (ajustar o `import` do topo do arquivo para incluir `buildExportHref`, `parseTransactionsQuery` e `queryFilters`, se ainda não estiverem):

```ts
describe('exportação', () => {
  const UUID = '0b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'
  const SUB = '1b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'
  const now = new Date('2026-10-15T12:00:00-03:00')

  it('buildExportHref leva mês, filtros e busca', () => {
    const query = parseTransactionsQuery({ mes: '2026-10', tipo: 'despesa', categoria: UUID, q: 'mercado' }, now)
    expect(buildExportHref(query)).toBe(`/lancamentos/exportar?mes=2026-10&q=mercado&tipo=despesa&categoria=${UUID}`)
  })

  it('buildExportHref sem filtros', () => {
    expect(buildExportHref(parseTransactionsQuery({ mes: '2026-09' }, now))).toBe('/lancamentos/exportar?mes=2026-09')
  })

  it('queryFilters expande a categoria-mãe nas subcategorias', () => {
    const categories = [
      { id: UUID, name: 'Moradia', kind: 'expense' as const, parentId: null, icon: 'house', color: '#3b82f6', isDefault: true, archived: false },
      { id: SUB, name: 'Luz', kind: 'expense' as const, parentId: UUID, icon: 'zap', color: '#3b82f6', isDefault: false, archived: false },
    ]
    const query = parseTransactionsQuery({ mes: '2026-10', categoria: UUID, status: 'pago' }, now)
    expect(queryFilters(query, categories)).toEqual({
      type: undefined,
      status: 'paid',
      accountId: undefined,
      cardId: undefined,
      categoryIds: [UUID, SUB],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/finance/csv.test.ts lib/transaction-filters.test.ts`
Expected: FAIL — "Failed to resolve import './csv'" e `buildExportHref is not a function` (ou erro de import).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/finance/csv.ts
import type { Category } from '@/lib/categories'
import { formatISODateBR } from '@/lib/dates'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { installmentLabel } from './installments'
import type { TransactionStatus, TransactionType } from './types'

export type CsvLookups = {
  categories: Pick<Category, 'id' | 'name' | 'parentId'>[]
  accounts: { id: string; name: string }[]
  cards: { id: string; name: string }[]
}

const HEADER = ['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta/Cartão', 'Status', 'Valor']

const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
  invoice_payment: 'Pagamento de fatura',
}

const STATUS_LABELS: Record<TransactionStatus, string> = { paid: 'Pago', pending: 'Pendente' }

/** Campo de texto: `'` na frente de fórmulas (=, +, -, @, tab, CR) e aspas quando há ; " ou quebra de linha. */
export function csvText(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** Vírgula decimal sem separador de milhar; só despesa leva sinal (negativo). Nunca passa por csvText. */
export function csvAmount(cents: number, type: TransactionType): string {
  const abs = Math.abs(cents)
  const text = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
  return type === 'expense' ? `-${text}` : text
}

/** CSV para Excel em pt-BR: BOM UTF-8, separador ";" e quebra de linha CRLF. Linhas já com o status efetivo. */
export function transactionsCsv(rows: TransactionRow[], lookups: CsvLookups): string {
  const categories = new Map(lookups.categories.map((category) => [category.id, category]))
  const accounts = new Map(lookups.accounts.map((account) => [account.id, account.name]))
  const cards = new Map(lookups.cards.map((card) => [card.id, card.name]))
  const nameIn = (map: Map<string, string>, id: string | null) => (id ? (map.get(id) ?? '') : '')

  const categoryName = (id: string | null) => {
    const category = id ? categories.get(id) : undefined
    if (!category) return ''
    const parent = category.parentId ? categories.get(category.parentId) : undefined
    return parent ? `${parent.name} › ${category.name}` : category.name
  }

  const source = (row: TransactionRow) => {
    if (row.type === 'transfer') return `${nameIn(accounts, row.account_id)} → ${nameIn(accounts, row.destination_account_id)}`
    if (row.type === 'invoice_payment') {
      return row.credit_card_id ? `${nameIn(accounts, row.account_id)} → Cartão ${nameIn(cards, row.credit_card_id)}` : nameIn(accounts, row.account_id)
    }
    return row.credit_card_id ? nameIn(cards, row.credit_card_id) : nameIn(accounts, row.account_id)
  }

  const lines = rows.map((row) =>
    [
      formatISODateBR(row.date),
      csvText(installmentLabel(row.description, row.installment_number, row.installment_plans?.installments_count ?? null)),
      TYPE_LABELS[row.type],
      csvText(categoryName(row.category_id)),
      csvText(source(row)),
      STATUS_LABELS[row.status],
      csvAmount(row.amount_cents, row.type),
    ].join(';'),
  )
  return `\uFEFF${[HEADER.join(';'), ...lines].join('\r\n')}\r\n`
}
```

Acrescentar no fim de `lib/transaction-filters.ts` (e o import `import { expandCategoryFilter, type Category } from '@/lib/categories'` no topo):

```ts
export type QueryFilters = {
  type?: TransactionType
  status?: TransactionStatus
  accountId?: string
  cardId?: string
  categoryIds?: string[]
}

/** Filtros da consulta: a categoria-mãe inclui as subcategorias. Usado pela tela e pela exportação. */
export function queryFilters(query: TransactionsQuery, categories: Category[]): QueryFilters {
  return {
    type: query.filters.type,
    status: query.filters.status,
    accountId: query.filters.accountId,
    cardId: query.filters.cardId,
    categoryIds: query.filters.categoryId ? expandCategoryFilter(query.filters.categoryId, categories) : undefined,
  }
}

/** Link de download do CSV com o mesmo mês, filtros e busca da tela. */
export function buildExportHref(query: TransactionsQuery): string {
  const search = new URLSearchParams({ mes: formatYearMonthParam(query.ym), ...filterParams(query) })
  return `/lancamentos/exportar?${search.toString()}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/finance/csv.test.ts lib/transaction-filters.test.ts`
Expected: PASS. Se a ordem dos parâmetros em `buildExportHref` diferir, ela vem de `filterParams` (q, tipo, categoria, conta, cartao, status) — ajuste o teste à ordem real de `filterParams`, não a função.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/csv.ts lib/finance/csv.test.ts lib/transaction-filters.ts lib/transaction-filters.test.ts
git commit -m "feat(lancamentos): CSV para Excel em pt-BR e link de exportação com os filtros da tela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Consultas do dashboard e dos relatórios (server-only)

**Files:**
- Create: `lib/report-rows.ts`, `lib/dashboard.ts`, `lib/reports.ts`
- Modify: `lib/cards.ts` (exportar `listInvoiceTotals`)

**Interfaces:**
- Consumes: Tasks 1–3 (`lastMonths`, `monthIndex`, `periodRange`, `previousRange`, `rangeBounds`, `toReportRow`, `monthlySeries`, `categoryTotals`, `compareCategories`, `topSlices`, `cardMonthly`, `futureCommitment`, `dashboardInvoices`); `listAccounts` (`lib/accounts.ts`), `listCards`, `listCardOptions` (`lib/cards.ts`), `listCategories` (`lib/categories-query.ts`), `getBudgetMonth` (`lib/budgets.ts`), `fetchAllPages` (`lib/fetch-all.ts`), `createClient` (`lib/supabase/server.ts`).
- Produces:
  - `listInvoiceTotals(): Promise<InvoiceTotals[]>` em `lib/cards.ts`
  - `loadReportRows(start: string, end: string, today: string): Promise<ReportRow[]>` em `lib/report-rows.ts`
  - `type Dashboard = { month: MonthPoint; series: MonthPoint[]; accountsBalanceCents: number; slices: Slice[]; expenseTotalCents: number; invoices: DashboardInvoice[]; hasCards: boolean; commitment: Commitment; budgetLines: BudgetLine[] }` e `getDashboard(ym: YearMonth, today: string): Promise<Dashboard>` em `lib/dashboard.ts`
  - `type Reports = { period: ReportPeriod; range: MonthRange; previous: MonthRange; comparison: CategoryComparison; series: MonthPoint[]; cards: CardMonthly }` e `getReports(ym: YearMonth, period: ReportPeriod, today: string): Promise<Reports>` em `lib/reports.ts`

Estes arquivos são `server-only` e não têm teste unitário (a lógica está nas Tasks 1–3); a verificação é `npx tsc --noEmit`, lint e o uso nas telas (Tasks 7 e 8).

- [ ] **Step 1: Exportar as faturas em `lib/cards.ts`**

Logo depois da função `loadInvoiceTotals`, acrescentar:

```ts
/** Totais de todas as faturas da casa (para o painel de faturas do Início). */
export async function listInvoiceTotals(): Promise<InvoiceTotals[]> {
  const supabase = await createClient()
  return loadInvoiceTotals(supabase)
}
```

- [ ] **Step 2: Criar `lib/report-rows.ts`**

```ts
import 'server-only'
import { fetchAllPages } from '@/lib/fetch-all'
import { toReportRow, type ReportRow } from '@/lib/finance/reports'
import { createClient } from '@/lib/supabase/server'

/** Lançamentos com data em [start, end), só as colunas dos relatórios, com o status efetivo. */
export async function loadReportRows(start: string, end: string, today: string): Promise<ReportRow[]> {
  const supabase = await createClient()
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select('id, type, status, date, amount_cents, category_id, account_id, credit_card_id')
      .gte('date', start)
      .lt('date', end)
      .order('id')
      .range(from, to),
  )
  return rows.map((row) => toReportRow(row, today))
}
```

- [ ] **Step 3: Criar `lib/dashboard.ts`**

```ts
import 'server-only'
import { listAccounts } from '@/lib/accounts'
import { getBudgetMonth } from '@/lib/budgets'
import { listCards, listInvoiceTotals } from '@/lib/cards'
import { listCategories } from '@/lib/categories-query'
import { formatYearMonthParam, monthBounds, shiftYearMonth, yearMonthOfISO, type YearMonth } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import type { BudgetLine } from '@/lib/finance/budget'
import { futureCommitment, type Commitment, type CommitmentRow } from '@/lib/finance/commitment'
import { dashboardInvoices, type DashboardInvoice } from '@/lib/finance/dashboard'
import { lastMonths } from '@/lib/finance/periods'
import { categoryTotals, compareCategories, monthlySeries, topSlices, type MonthPoint, type Slice } from '@/lib/finance/reports'
import { loadReportRows } from '@/lib/report-rows'
import { createClient } from '@/lib/supabase/server'

export type Dashboard = {
  month: MonthPoint
  series: MonthPoint[]
  accountsBalanceCents: number
  slices: Slice[]
  expenseTotalCents: number
  invoices: DashboardInvoice[]
  hasCards: boolean
  commitment: Commitment
  budgetLines: BudgetLine[]
}

/** Parcelas e recorrências de cartão nas faturas que vencem nos meses pedidos; faturas já quitadas ficam fora. */
async function loadCommitmentRows(months: YearMonth[]): Promise<CommitmentRow[]> {
  const supabase = await createClient()
  const { data: invoices, error } = await supabase
    .from('v_invoice_totals')
    .select('invoice_id, reference_month, total_cents, paid_cents')
    .gte('reference_month', monthBounds(months[0]).start)
    .lt('reference_month', monthBounds(months[months.length - 1]).end)
  if (error) throw error
  const open = invoices.filter((invoice) => {
    const total = Number(invoice.total_cents ?? 0)
    return !(total > 0 && Number(invoice.paid_cents ?? 0) >= total)
  })
  if (open.length === 0) return []

  const referenceOf = new Map(open.map((invoice) => [invoice.invoice_id as string, invoice.reference_month as string]))
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select('id, invoice_id, amount_cents, installment_plan_id')
      .eq('type', 'expense')
      .in('invoice_id', [...referenceOf.keys()])
      .or('installment_plan_id.not.is.null,recurrence_id.not.is.null')
      .order('id')
      .range(from, to),
  )
  return rows.map((row) => ({
    amountCents: Number(row.amount_cents),
    referenceMonth: referenceOf.get(row.invoice_id as string) as string,
    kind: row.installment_plan_id ? 'installment' : 'recurrence',
  }))
}

/** Dados da tela Início: mês do seletor (cards, rosca, orçamento), 6 meses de barras e o que vale hoje (saldo, faturas, comprometimento). */
export async function getDashboard(ym: YearMonth, today: string): Promise<Dashboard> {
  const months = lastMonths(ym, 6)
  // Comprometimento: do mês de hoje até 5 meses depois, independente do seletor
  const commitmentMonths = lastMonths(shiftYearMonth(yearMonthOfISO(today), 5), 6)
  const [rows, categories, accounts, cards, invoices, budget, commitmentRows] = await Promise.all([
    loadReportRows(monthBounds(months[0]).start, monthBounds(ym).end, today),
    listCategories(),
    listAccounts(),
    listCards(),
    listInvoiceTotals(),
    getBudgetMonth(ym, today),
    loadCommitmentRows(commitmentMonths),
  ])

  const series = monthlySeries(rows, months)
  const key = formatYearMonthParam(ym)
  const monthLines = compareCategories(
    categoryTotals(
      rows.filter((row) => row.date.startsWith(key)),
      categories,
    ),
    new Map(),
    categories,
  ).lines

  return {
    month: series[series.length - 1],
    series,
    accountsBalanceCents: accounts.reduce((sum, account) => sum + account.balanceCents, 0),
    slices: topSlices(monthLines),
    expenseTotalCents: monthLines.reduce((sum, line) => sum + line.totalCents, 0),
    invoices: dashboardInvoices(cards, invoices, today),
    hasCards: cards.length > 0,
    commitment: futureCommitment(commitmentRows, commitmentMonths),
    // Já ordenadas pela proporção do limite; sem limite ficam de fora
    budgetLines: budget.lines.filter((line) => line.progress !== null).slice(0, 5),
  }
}
```

- [ ] **Step 4: Criar `lib/reports.ts`**

```ts
import 'server-only'
import { listCardOptions } from '@/lib/cards'
import { listCategories } from '@/lib/categories-query'
import { monthBounds, type YearMonth } from '@/lib/dates'
import {
  lastMonths,
  monthIndex,
  periodRange,
  previousRange,
  rangeBounds,
  type MonthRange,
  type ReportPeriod,
} from '@/lib/finance/periods'
import {
  cardMonthly,
  categoryTotals,
  compareCategories,
  monthlySeries,
  type CardMonthly,
  type CategoryComparison,
  type MonthPoint,
  type ReportRow,
} from '@/lib/finance/reports'
import { loadReportRows } from '@/lib/report-rows'

export type Reports = {
  period: ReportPeriod
  range: MonthRange
  previous: MonthRange
  comparison: CategoryComparison
  series: MonthPoint[]
  cards: CardMonthly
}

function within(rows: ReportRow[], range: MonthRange): ReportRow[] {
  const { start, end } = rangeBounds(range)
  return rows.filter((row) => row.date >= start && row.date < end)
}

/** Uma busca cobrindo o período anterior e os 12 meses (no máximo 24 meses), agregada em memória. */
export async function getReports(ym: YearMonth, period: ReportPeriod, today: string): Promise<Reports> {
  const range = periodRange(period, ym)
  const previous = previousRange(period, ym)
  const months = lastMonths(ym, 12)
  const from = monthIndex(previous.start) < monthIndex(months[0]) ? previous.start : months[0]
  const [rows, categories, cards] = await Promise.all([
    loadReportRows(monthBounds(from).start, monthBounds(ym).end, today),
    listCategories(),
    listCardOptions(),
  ])
  return {
    period,
    range,
    previous,
    comparison: compareCategories(categoryTotals(within(rows, range), categories), categoryTotals(within(rows, previous), categories), categories),
    series: monthlySeries(rows, months),
    cards: cardMonthly(rows, cards, months),
  }
}
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `npx tsc --noEmit` e depois `npm run lint`
Expected: sem erros. Se o Supabase tipar `row.type`/`row.status` de forma incompatível com `RawReportRow`, ajuste com cast no `map` de `loadReportRows` (`toReportRow(row as RawReportRow, today)` importando o tipo), sem afrouxar `RawReportRow`.

- [ ] **Step 6: Commit**

```bash
git add lib/cards.ts lib/report-rows.ts lib/dashboard.ts lib/reports.ts
git commit -m "feat(dashboard): consultas do Início e dos Relatórios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rota do CSV, botão "Exportar CSV" e tela de erro

**Files:**
- Create: `app/(app)/lancamentos/exportar/route.ts`, `app/(app)/error.tsx`
- Modify: `app/(app)/lancamentos/page.tsx` (usar `queryFilters`), `components/transactions/transactions-toolbar.tsx` (botão)

**Interfaces:**
- Consumes: `queryFilters`, `buildExportHref`, `parseTransactionsQuery` (`lib/transaction-filters.ts`); `transactionsCsv` (`lib/finance/csv.ts`); `listMonthTransactions`, `searchTransactions` (`lib/transactions.ts`); `applyEffectiveStatus` (`lib/transaction-mappers.ts`); `getCurrentUser` (`lib/auth.ts`); `listCategories`, `listAccounts`, `listCardOptions`; `todayISO`, `formatYearMonthParam`.
- Produces: `GET /lancamentos/exportar?mes=…&tipo=…&categoria=…&conta=…&cartao=…&status=…&q=…` → `text/csv`.

- [ ] **Step 1: Ler os guias do Next 16**

Ler `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` e `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`. Confirmar: Route Handler exporta `GET(request: Request)` e não é cacheado por padrão; `route.ts` não pode ficar no mesmo segmento de um `page.tsx` (por isso fica em `lancamentos/exportar/`); `error.tsx` é Client Component e recebe `{ error, retry }`.

- [ ] **Step 2: Usar `queryFilters` na tela Lançamentos**

Em `app/(app)/lancamentos/page.tsx`, trocar o objeto `filters` montado à mão por `queryFilters`, e remover o import de `expandCategoryFilter` que ficar sem uso:

```ts
import { filterParams, parseTransactionsQuery, queryFilters } from '@/lib/transaction-filters'
// ...
  const filters = queryFilters(query, categories)
```

- [ ] **Step 3: Criar a rota**

```ts
// app/(app)/lancamentos/exportar/route.ts
import { listAccounts } from '@/lib/accounts'
import { getCurrentUser } from '@/lib/auth'
import { listCardOptions } from '@/lib/cards'
import { listCategories } from '@/lib/categories-query'
import { formatYearMonthParam, todayISO } from '@/lib/dates'
import { transactionsCsv } from '@/lib/finance/csv'
import { parseTransactionsQuery, queryFilters } from '@/lib/transaction-filters'
import { applyEffectiveStatus } from '@/lib/transaction-mappers'
import { listMonthTransactions, searchTransactions } from '@/lib/transactions'

/** CSV com exatamente as linhas da tela Lançamentos (mesmo mês, filtros e busca). O RLS vale: usa a sessão de quem pede. */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return new Response('Faça login para exportar.', { status: 401 })

  const query = parseTransactionsQuery(Object.fromEntries(new URL(request.url).searchParams))
  const today = todayISO()
  try {
    const [categories, accounts, cards] = await Promise.all([listCategories(), listAccounts({ includeArchived: true }), listCardOptions()])
    const filters = queryFilters(query, categories)
    const found = query.q ? await searchTransactions(query.q, filters, today) : await listMonthTransactions(query.ym, filters, today)
    const rows = found.map((row) => applyEffectiveStatus(row, today))
    const csv = transactionsCsv(rows, { categories, accounts, cards })
    const filename = query.q ? 'lancamentos-busca.csv' : `lancamentos-${formatYearMonthParam(query.ym)}.csv`
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Falha ao exportar lançamentos', error)
    return new Response('Não foi possível exportar os lançamentos.', { status: 500 })
  }
}
```

- [ ] **Step 4: Botão na barra de filtros**

Em `components/transactions/transactions-toolbar.tsx`: importar `Download` de `lucide-react` e `buildExportHref` de `@/lib/transaction-filters`. Dentro de `<div className="flex gap-2">`, depois do `<Sheet>…</Sheet>`, acrescentar:

```tsx
        <Button asChild variant="outline">
          {/* <a> comum: download de arquivo, não navegação do Next */}
          <a href={buildExportHref(query)} download aria-label="Exportar CSV">
            <Download aria-hidden />
            <span className="hidden sm:inline">Exportar CSV</span>
          </a>
        </Button>
```

- [ ] **Step 5: Tela de erro**

```tsx
// app/(app)/error.tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
      <p className="mb-4 text-muted-foreground">Não foi possível carregar esta tela.</p>
      <Button onClick={() => retry()}>Tentar de novo</Button>
    </div>
  )
}
```

- [ ] **Step 6: Verificar**

Run: `npm test`, `npm run lint`, `npm run build`
Expected: tudo passa; o build lista a rota `ƒ /lancamentos/exportar`.

Manual (com `npm run dev` e login): em `/lancamentos?mes=<mês com dados>` clicar em "Exportar CSV" baixa `lancamentos-AAAA-MM.csv` com as mesmas linhas da tela; com um filtro de categoria e com uma busca, idem (busca → `lancamentos-busca.csv`). Numa janela anônima, abrir `/lancamentos/exportar?mes=2026-10` não baixa nada (redireciona para `/login`).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/lancamentos/exportar/route.ts" "app/(app)/error.tsx" "app/(app)/lancamentos/page.tsx" components/transactions/transactions-toolbar.tsx
git commit -m "feat(lancamentos): exportar CSV com os filtros da tela e tela de erro do app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Recharts, componentes de gráfico e tela Início

**Files:**
- Modify: `package.json`/`package-lock.json` (via `npm install`), `components/transactions/month-summary.tsx`, `components/budgets/budget-bar.tsx`, `components/budgets/budget-list.tsx`, `app/(app)/inicio/page.tsx`
- Create: `components/charts/chart-theme.ts`, `components/charts/monthly-bars-chart.tsx`, `components/charts/chart-legend.tsx`, `components/dashboard/panel.tsx`, `components/dashboard/category-donut.tsx`, `components/dashboard/invoices-panel.tsx`, `components/dashboard/commitment-panel.tsx`, `components/dashboard/budget-panel.tsx`

**Interfaces:**
- Consumes: `getDashboard`, `type Dashboard` (Task 5); `formatMonthAxis` (Task 1); `type MonthPoint`, `type Slice` (Task 2); `type Commitment` (Task 3); `type DashboardInvoice` (Task 3); `BudgetBar`, `type BudgetLine`; `InvoiceStatusBadge`; `invoiceHref`; `formatBRL`, `formatSignedBRL`; `formatISODateBR`, `formatYearMonthLabel`, `formatYearMonthParam`, `resolveYearMonth`, `todayISO`.
- Produces (usados também na Task 8):
  - `components/charts/chart-theme.ts`: `CHART_COLORS`, `PENDING_OPACITY`, `tooltipStyle`, `formatTooltipValue(value: unknown): string`, `formatCompactBRL(cents: number): string`
  - `MonthlyBarsChart({ points: MonthPoint[]; showBalance?: boolean; label: string })` (client)
  - `ChartLegend({ items: { label: string; color: string; faded?: boolean; line?: boolean }[] })`
  - `Panel({ title, action?, children, className? })`, `EmptyText({ children })`
  - `SummaryCard` exportado de `month-summary.tsx`; `MonthSummary({ summary, extra? })`
  - `LevelBadge({ line })` exportado de `budget-bar.tsx`

- [ ] **Step 1: Instalar o Recharts**

Run: `npm install recharts@^3.10.1`
Expected: `recharts` em `dependencies` do `package.json`; sem erro de peer dependency (React 19 é aceito).

- [ ] **Step 2: Tema dos gráficos**

```ts
// components/charts/chart-theme.ts
import { formatBRL } from '@/lib/finance/money'

/** Cores do tema (tokens do :root); o previsto usa a mesma cor com opacidade reduzida. */
export const CHART_COLORS = {
  income: 'var(--income)',
  expense: 'var(--expense)',
  primary: 'var(--primary)',
  grid: 'var(--border)',
  muted: 'var(--text-muted)',
} as const

export const PENDING_OPACITY = 0.4

export const tooltipStyle = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 12,
}

export function formatTooltipValue(value: unknown): string {
  return formatBRL(Number(value))
}

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

/** "R$ 1,2 mil", para eixos. */
export function formatCompactBRL(cents: number): string {
  return `R$ ${compact.format(cents / 100)}`
}
```

- [ ] **Step 3: Legenda e gráfico de barras mensais**

```tsx
// components/charts/chart-legend.tsx
import { cn } from '@/lib/utils'

type LegendItem = { label: string; color: string; faded?: boolean; line?: boolean }

/** Legenda em texto (também é a alternativa acessível às cores do gráfico). */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn('inline-block shrink-0', item.line ? 'h-0.5 w-3' : 'size-2.5 rounded-sm', item.faded && 'opacity-40')}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
```

```tsx
// components/charts/monthly-bars-chart.tsx
'use client'

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMonthAxis } from '@/lib/finance/periods'
import type { MonthPoint } from '@/lib/finance/reports'
import { CHART_COLORS, formatCompactBRL, formatTooltipValue, PENDING_OPACITY, tooltipStyle } from './chart-theme'

/** Receitas e despesas por mês: realizado em cor cheia e previsto empilhado em tom claro; saldo opcional em linha. */
export function MonthlyBarsChart({ points, showBalance = false, label }: { points: MonthPoint[]; showBalance?: boolean; label: string }) {
  const data = points.map((point) => ({
    month: formatMonthAxis(point.ym),
    incomePaid: point.income.paid,
    incomePending: point.income.pending,
    expensePaid: point.expense.paid,
    expensePending: point.expense.pending,
    balance: point.balanceProjected,
  }))
  const axisTick = { fill: CHART_COLORS.muted, fontSize: 12 }

  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => formatCompactBRL(Number(value))} tick={axisTick} tickLine={false} axisLine={false} width={72} />
          <Tooltip formatter={formatTooltipValue} contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="incomePaid" name="Receitas" stackId="income" fill={CHART_COLORS.income} />
          <Bar dataKey="incomePending" name="Receitas previstas" stackId="income" fill={CHART_COLORS.income} fillOpacity={PENDING_OPACITY} />
          <Bar dataKey="expensePaid" name="Despesas" stackId="expense" fill={CHART_COLORS.expense} />
          <Bar dataKey="expensePending" name="Despesas previstas" stackId="expense" fill={CHART_COLORS.expense} fillOpacity={PENDING_OPACITY} />
          {showBalance ? (
            <Line dataKey="balance" name="Saldo (com previstos)" type="monotone" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Painel e textos de vazio**

```tsx
// components/dashboard/panel.tsx
import { cn } from '@/lib/utils'

export function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4', className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

export function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}
```

- [ ] **Step 5: Cards do mês com o 4º card**

Em `components/transactions/month-summary.tsx`: exportar `SummaryCard` (trocar `function SummaryCard` por `export function SummaryCard`) e trocar `MonthSummary` por:

```tsx
/** Receitas, despesas e saldo do mês; `extra` acrescenta cards (o Início usa para o saldo das contas). */
export function MonthSummary({ summary, extra }: { summary: Summary; extra?: React.ReactNode }) {
  return (
    <div className={cn('mb-6 grid grid-cols-2 gap-2', extra ? 'lg:grid-cols-4' : 'sm:grid-cols-3')}>
      <SummaryCard
        label="Receitas"
        value={formatSignedBRL(summary.income.paid)}
        pending={summary.income.pending ? `+ ${formatBRL(summary.income.pending)} previsto` : undefined}
        tone="text-income"
      />
      <SummaryCard
        label="Despesas"
        value={formatSignedBRL(-summary.expense.paid)}
        pending={summary.expense.pending ? `− ${formatBRL(summary.expense.pending)} previsto` : undefined}
        tone="text-expense"
      />
      <SummaryCard
        label="Saldo do mês"
        value={formatSignedBRL(summary.balancePaid)}
        pending={summary.balanceProjected !== summary.balancePaid ? `${formatSignedBRL(summary.balanceProjected)} com previstos` : undefined}
        tone={summary.balancePaid < 0 ? 'text-expense' : 'text-foreground'}
        className={extra ? undefined : 'col-span-2 sm:col-span-1'}
      />
      {extra}
    </div>
  )
}
```

- [ ] **Step 6: `LevelBadge` reutilizável**

Mover a função `LevelBadge` de `components/budgets/budget-list.tsx` para `components/budgets/budget-bar.tsx`, exportada (o arquivo já importa `cn`; acrescentar `import type { BudgetLine } from '@/lib/finance/budget'` ao lado do import de `BudgetProgress`):

```tsx
/** Selo "Atenção" (80%) ou "Estourado" (100%); nada abaixo de 80%. */
export function LevelBadge({ line }: { line: BudgetLine }) {
  if (!line.progress || line.progress.level === 'ok') return null
  const over = line.progress.level === 'over'
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', over ? 'bg-expense/15 text-expense' : 'bg-warning/15 text-warning')}>
      {over ? 'Estourado' : 'Atenção'}
    </span>
  )
}
```

Em `budget-list.tsx`, apagar a definição local e importar: `import { BudgetBar, LevelBadge } from './budget-bar'`.

- [ ] **Step 7: Rosca de despesas por categoria**

```tsx
// components/dashboard/category-donut.tsx
'use client'

import Link from 'next/link'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatTooltipValue, tooltipStyle } from '@/components/charts/chart-theme'
import { formatBRL } from '@/lib/finance/money'
import type { Slice } from '@/lib/finance/reports'
import { EmptyText } from './panel'

/** Até 6 fatias; a legenda (nome, valor e %) é a alternativa em texto e leva para Lançamentos filtrado. */
export function CategoryDonut({ slices, totalCents, monthParam }: { slices: Slice[]; totalCents: number; monthParam: string }) {
  if (slices.length === 0) return <EmptyText>Nenhuma despesa neste mês.</EmptyText>
  const sum = slices.reduce((acc, slice) => acc + slice.valueCents, 0)

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
      <div className="relative mx-auto size-40 shrink-0" role="img" aria-label="Gráfico de despesas por categoria">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="valueCents" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="var(--surface)" strokeWidth={2}>
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip formatter={formatTooltipValue} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-sm font-semibold tabular-nums">{formatBRL(totalCents)}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {slices.map((slice) => {
          const percent = sum > 0 ? Math.round((slice.valueCents / sum) * 100) : 0
          const content = (
            <>
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="shrink-0 tabular-nums">{formatBRL(slice.valueCents)}</span>
              <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">{percent}%</span>
            </>
          )
          const rowClass = 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm'
          return (
            <li key={slice.key}>
              {slice.categoryId ? (
                <Link href={`/lancamentos?mes=${monthParam}&categoria=${slice.categoryId}`} className={`${rowClass} hover:bg-surface-2`}>
                  {content}
                </Link>
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 8: Painéis de faturas, comprometimento e orçamento**

```tsx
// components/dashboard/invoices-panel.tsx
import Link from 'next/link'
import { InvoiceStatusBadge } from '@/components/cards/invoice-status-badge'
import { formatISODateBR } from '@/lib/dates'
import type { DashboardInvoice } from '@/lib/finance/dashboard'
import { formatBRL } from '@/lib/finance/money'
import { invoiceHref } from '@/lib/invoice-labels'
import { EmptyText } from './panel'

const dayMonth = (iso: string) => formatISODateBR(iso).slice(0, 5)

export function InvoicesPanel({ invoices, hasCards }: { invoices: DashboardInvoice[]; hasCards: boolean }) {
  if (!hasCards) return <EmptyText>Nenhum cartão cadastrado.</EmptyText>
  return (
    <ul className="space-y-1">
      {invoices.map((invoice) => {
        const open = invoice.status === 'open'
        return (
          <li key={`${invoice.cardId}-${invoice.cycle.closingMonth}`}>
            <Link href={invoiceHref(invoice.cardId, invoice.cycle.closingMonth)} className="flex items-center gap-3 rounded-md p-2 hover:bg-surface-2">
              <span aria-hidden className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: invoice.cardColor }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{invoice.cardName}</span>
                  {open ? null : <InvoiceStatusBadge status={invoice.status} />}
                </span>
                <span className="block text-xs text-muted-foreground">
                  fecha {dayMonth(invoice.cycle.closingDate)} · vence {dayMonth(invoice.cycle.dueDate)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-muted-foreground">{open ? 'parcial' : 'a pagar'}</span>
                <span className="font-medium tabular-nums">{formatBRL(open ? invoice.totalCents : invoice.remainingCents)}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
```

```tsx
// components/dashboard/commitment-panel.tsx
import { formatYearMonthLabel } from '@/lib/dates'
import type { Commitment } from '@/lib/finance/commitment'
import { formatBRL } from '@/lib/finance/money'
import { EmptyText } from './panel'

export function CommitmentPanel({ commitment }: { commitment: Commitment }) {
  if (commitment.totalCents === 0) return <EmptyText>Nada comprometido nos próximos 6 meses.</EmptyText>
  return (
    <ul className="space-y-3">
      {commitment.months.map((month) => {
        const width = commitment.maxTotalCents > 0 ? (month.totalCents / commitment.maxTotalCents) * 100 : 0
        return (
          <li key={month.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{formatYearMonthLabel(month.ym)}</span>
              <span className="font-medium tabular-nums">{formatBRL(month.totalCents)}</span>
            </div>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              parcelas {formatBRL(month.installmentsCents)} · assinaturas {formatBRL(month.recurrencesCents)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
```

```tsx
// components/dashboard/budget-panel.tsx
import { BudgetBar, LevelBadge } from '@/components/budgets/budget-bar'
import type { BudgetLine } from '@/lib/finance/budget'
import { formatBRL } from '@/lib/finance/money'
import { EmptyText } from './panel'

export function BudgetPanel({ lines }: { lines: BudgetLine[] }) {
  if (lines.length === 0) return <EmptyText>Defina limites em Orçamento.</EmptyText>
  return (
    <ul className="space-y-3">
      {lines.map((line) =>
        line.progress ? (
          <li key={line.categoryId} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{line.name}</span>
              <LevelBadge line={line} />
              <span className="shrink-0 tabular-nums">{Math.round(line.progress.ratio * 100)}%</span>
            </div>
            <BudgetBar progress={line.progress} label={`Orçamento de ${line.name}`} />
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatBRL(line.spending.realizedCents + line.spending.plannedCents)} de {formatBRL(line.limitCents ?? 0)}
            </p>
          </li>
        ) : null,
      )}
    </ul>
  )
}
```

- [ ] **Step 9: Página Início**

```tsx
// app/(app)/inicio/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChartLegend } from '@/components/charts/chart-legend'
import { CHART_COLORS } from '@/components/charts/chart-theme'
import { MonthlyBarsChart } from '@/components/charts/monthly-bars-chart'
import { BudgetPanel } from '@/components/dashboard/budget-panel'
import { CategoryDonut } from '@/components/dashboard/category-donut'
import { CommitmentPanel } from '@/components/dashboard/commitment-panel'
import { InvoicesPanel } from '@/components/dashboard/invoices-panel'
import { Panel } from '@/components/dashboard/panel'
import { PageHeader } from '@/components/layout/page-header'
import { MonthSummary, SummaryCard } from '@/components/transactions/month-summary'
import { getDashboard } from '@/lib/dashboard'
import { formatYearMonthParam, resolveYearMonth, todayISO } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'

export const metadata: Metadata = { title: 'Início' }

const panelLink = (href: string, label: string) => (
  <Link href={href} className="text-sm text-primary underline-offset-4 hover:underline">
    {label}
  </Link>
)

export default async function HomePage({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  const { mes } = await searchParams
  const ym = resolveYearMonth(mes)
  const monthParam = formatYearMonthParam(ym)
  const data = await getDashboard(ym, todayISO())

  return (
    <>
      <PageHeader title="Início" ym={ym} basePath="/inicio" />
      <MonthSummary
        summary={data.month}
        extra={
          <SummaryCard
            label="Saldo das contas"
            value={formatBRL(data.accountsBalanceCents)}
            pending="hoje"
            tone={data.accountsBalanceCents < 0 ? 'text-expense' : 'text-foreground'}
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Despesas por categoria" action={panelLink(`/relatorios?mes=${monthParam}`, 'Relatórios')}>
          <CategoryDonut slices={data.slices} totalCents={data.expenseTotalCents} monthParam={monthParam} />
        </Panel>
        <Panel title="Receitas x despesas" className="lg:col-span-2">
          <MonthlyBarsChart points={data.series} label="Receitas e despesas dos últimos 6 meses" />
          <ChartLegend
            items={[
              { label: 'Receitas', color: CHART_COLORS.income },
              { label: 'Despesas', color: CHART_COLORS.expense },
              { label: 'Tom claro = previsto', color: CHART_COLORS.muted, faded: true },
            ]}
          />
        </Panel>
        <Panel title="Faturas" action={panelLink('/cartoes', 'Cartões')}>
          <InvoicesPanel invoices={data.invoices} hasCards={data.hasCards} />
        </Panel>
        <Panel title="Comprometimento futuro" action={panelLink('/parcelas', 'Parcelas')}>
          <CommitmentPanel commitment={data.commitment} />
        </Panel>
        <Panel title="Orçamento" action={panelLink(`/orcamento?mes=${monthParam}`, 'Ver orçamento')}>
          <BudgetPanel lines={data.budgetLines} />
        </Panel>
      </div>
    </>
  )
}
```

- [ ] **Step 10: Verificar**

Run: `npm test`, `npm run lint`, `npm run build`
Expected: tudo passa.

Manual (`npm run dev`): `/inicio` com dados em 360px e 1440px — cards iguais ao resumo de `/lancamentos` do mesmo mês; saldo das contas igual à soma da tela Contas; rosca com no máximo 6 fatias e legenda clicável; barras de 6 meses; faturas; comprometimento; orçamento igual à tela Orçamento; mês sem dados mostra as frases de vazio; sem rolagem horizontal em 360px. A tela Orçamento continua com os selos (após mover `LevelBadge`).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json components/charts components/dashboard components/transactions/month-summary.tsx components/budgets/budget-bar.tsx components/budgets/budget-list.tsx "app/(app)/inicio/page.tsx"
git commit -m "feat(dashboard): tela Início com cards, rosca, barras, faturas, comprometimento e orçamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tela Relatórios

**Files:**
- Modify: `app/(app)/relatorios/page.tsx`
- Create: `components/reports/period-tabs.tsx`, `components/reports/category-comparison.tsx`, `components/reports/monthly-table.tsx`, `components/reports/card-spending-chart.tsx`, `components/reports/card-spending-table.tsx`

**Interfaces:**
- Consumes: `getReports`, `type Reports` (Task 5); `REPORT_PERIODS`, `PERIOD_LABELS`, `parsePeriod`, `periodLabel`, `formatMonthAxis`, `formatMonthShort` (Task 1); `type CategoryComparison`, `type Change`, `type MonthPoint`, `type CardMonthly` (Task 2); `Panel`, `EmptyText`, `MonthlyBarsChart`, `ChartLegend`, `CHART_COLORS`, `tooltipStyle`, `formatTooltipValue`, `formatCompactBRL` (Task 7); `PageHeader`; `formatBRL`, `formatSignedBRL`.
- Produces: tela `/relatorios?mes=AAAA-MM&periodo=…`.

- [ ] **Step 1: Atalhos de período**

```tsx
// components/reports/period-tabs.tsx
import Link from 'next/link'
import { formatYearMonthParam, type YearMonth } from '@/lib/dates'
import { PERIOD_LABELS, REPORT_PERIODS, type ReportPeriod } from '@/lib/finance/periods'
import { cn } from '@/lib/utils'

export function PeriodTabs({ ym, period }: { ym: YearMonth; period: ReportPeriod }) {
  return (
    <nav aria-label="Período" className="flex flex-wrap gap-1">
      {REPORT_PERIODS.map((item) => {
        const active = item === period
        return (
          <Link
            key={item}
            href={`/relatorios?${new URLSearchParams({ mes: formatYearMonthParam(ym), periodo: item }).toString()}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-surface-2',
            )}
          >
            {PERIOD_LABELS[item]}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Lista de despesas por categoria com comparação**

```tsx
// components/reports/category-comparison.tsx
import { EmptyText } from '@/components/dashboard/panel'
import type { CategoryComparison, Change } from '@/lib/finance/reports'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'

/** Gasto maior é ruim: ▲ em vermelho, ▼ em verde; seta e sinal sempre em texto. */
function ChangeText({ change }: { change: Change }) {
  if (change.kind === 'new') return <span className="text-muted-foreground">novo</span>
  if (change.kind === 'gone') return <span className="text-muted-foreground">—</span>
  if (change.value === 0) return <span className="text-muted-foreground">0%</span>
  const up = change.value > 0
  return (
    <span className={cn('tabular-nums', up ? 'text-expense' : 'text-income')}>
      {up ? '▲ +' : '▼ −'}
      {Math.abs(change.value)}%
    </span>
  )
}

export function CategoryComparisonList({ comparison }: { comparison: CategoryComparison }) {
  if (comparison.lines.length === 0) return <EmptyText>Nenhuma despesa no período.</EmptyText>
  return (
    <ul className="divide-y divide-border">
      {comparison.lines.map((line) => (
        <li key={line.categoryId} className="space-y-0.5 py-2">
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
            <span className="min-w-0 flex-1 truncate">{line.name}</span>
            <span className="shrink-0 font-medium tabular-nums">{formatBRL(line.totalCents)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 pl-4.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              antes {formatBRL(line.previousCents)}
              {line.pendingCents > 0 ? ` · inclui ${formatBRL(line.pendingCents)} previsto` : ''}
            </span>
            <ChangeText change={line.change} />
          </div>
        </li>
      ))}
      <li className="flex items-center gap-2 py-2 font-semibold">
        <span className="flex-1">Total</span>
        <span className="text-xs font-normal">
          <ChangeText change={comparison.total.change} />
        </span>
        <span className="tabular-nums">{formatBRL(comparison.total.totalCents)}</span>
      </li>
    </ul>
  )
}
```

- [ ] **Step 3: Tabela mês a mês (evolução)**

```tsx
// components/reports/monthly-table.tsx
import { formatMonthShort } from '@/lib/finance/periods'
import type { MonthPoint } from '@/lib/finance/reports'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'

function Rows({ points }: { points: MonthPoint[] }) {
  return (
    <>
      {/* Desktop: tabela */}
      <table className="hidden w-full text-sm sm:table">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 text-left font-normal">Mês</th>
            <th className="py-1 text-right font-normal">Receitas</th>
            <th className="py-1 text-right font-normal">Despesas</th>
            <th className="py-1 text-right font-normal">Saldo</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {points.map((point) => (
            <tr key={point.key} className="border-t border-border">
              <td className="py-1.5">{formatMonthShort(point.ym)}</td>
              <td className="py-1.5 text-right">{formatBRL(point.income.paid + point.income.pending)}</td>
              <td className="py-1.5 text-right">{formatBRL(point.expense.paid + point.expense.pending)}</td>
              <td className="py-1.5 text-right">{formatSignedBRL(point.balanceProjected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Celular: lista */}
      <ul className="divide-y divide-border text-sm sm:hidden">
        {points.map((point) => (
          <li key={point.key} className="py-2">
            <p className="font-medium">{formatMonthShort(point.ym)}</p>
            <dl className="grid grid-cols-3 gap-2 text-xs tabular-nums">
              <div>
                <dt className="text-muted-foreground">Receitas</dt>
                <dd>{formatBRL(point.income.paid + point.income.pending)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Despesas</dt>
                <dd>{formatBRL(point.expense.paid + point.expense.pending)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Saldo</dt>
                <dd>{formatSignedBRL(point.balanceProjected)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Visível no desktop; no celular fica atrás de "Ver tabela". Valores com previstos. */
export function MonthlyTable({ points }: { points: MonthPoint[] }) {
  return (
    <>
      <div className="hidden lg:block">
        <Rows points={points} />
      </div>
      <details className="lg:hidden">
        <summary className="cursor-pointer text-sm text-primary">Ver tabela</summary>
        <div className="mt-2">
          <Rows points={points} />
        </div>
      </details>
    </>
  )
}
```

- [ ] **Step 4: Gasto por cartão (gráfico e tabela)**

```tsx
// components/reports/card-spending-chart.tsx
'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, formatCompactBRL, formatTooltipValue, tooltipStyle } from '@/components/charts/chart-theme'
import { formatMonthAxis } from '@/lib/finance/periods'
import type { CardMonthly } from '@/lib/finance/reports'

export function CardSpendingChart({ data }: { data: CardMonthly }) {
  const rows = data.months.map((month) => ({ month: formatMonthAxis(month.ym), ...month.byCard }))
  const axisTick = { fill: CHART_COLORS.muted, fontSize: 12 }
  return (
    <div className="h-56 w-full" role="img" aria-label="Gastos por cartão nos últimos 12 meses">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => formatCompactBRL(Number(value))} tick={axisTick} tickLine={false} axisLine={false} width={72} />
          <Tooltip formatter={formatTooltipValue} contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
          {data.cards.map((card) => (
            <Bar key={card.id} dataKey={card.id} name={card.name} stackId="cards" fill={card.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

```tsx
// components/reports/card-spending-table.tsx
import { formatMonthShort } from '@/lib/finance/periods'
import type { CardMonthly } from '@/lib/finance/reports'
import { formatBRL } from '@/lib/finance/money'

function Rows({ data }: { data: CardMonthly }) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Mês</th>
              {data.cards.map((card) => (
                <th key={card.id} className="py-1 text-right font-normal">
                  {card.name}
                </th>
              ))}
              <th className="py-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.months.map((month) => (
              <tr key={month.key} className="border-t border-border">
                <td className="py-1.5">{formatMonthShort(month.ym)}</td>
                {data.cards.map((card) => (
                  <td key={card.id} className="py-1.5 text-right">
                    {formatBRL(month.byCard[card.id] ?? 0)}
                  </td>
                ))}
                <td className="py-1.5 text-right font-medium">{formatBRL(month.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border text-sm sm:hidden">
        {data.months.map((month) => (
          <li key={month.key} className="py-2">
            <p className="flex justify-between font-medium">
              <span>{formatMonthShort(month.ym)}</span>
              <span className="tabular-nums">{formatBRL(month.totalCents)}</span>
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {data.cards.map((card) => `${card.name} ${formatBRL(month.byCard[card.id] ?? 0)}`).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}

export function CardSpendingTable({ data }: { data: CardMonthly }) {
  return (
    <>
      <div className="hidden lg:block">
        <Rows data={data} />
      </div>
      <details className="lg:hidden">
        <summary className="cursor-pointer text-sm text-primary">Ver tabela</summary>
        <div className="mt-2">
          <Rows data={data} />
        </div>
      </details>
    </>
  )
}
```

- [ ] **Step 5: Página Relatórios**

```tsx
// app/(app)/relatorios/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChartLegend } from '@/components/charts/chart-legend'
import { CHART_COLORS } from '@/components/charts/chart-theme'
import { MonthlyBarsChart } from '@/components/charts/monthly-bars-chart'
import { EmptyText, Panel } from '@/components/dashboard/panel'
import { PageHeader } from '@/components/layout/page-header'
import { CardSpendingChart } from '@/components/reports/card-spending-chart'
import { CardSpendingTable } from '@/components/reports/card-spending-table'
import { CategoryComparisonList } from '@/components/reports/category-comparison'
import { MonthlyTable } from '@/components/reports/monthly-table'
import { PeriodTabs } from '@/components/reports/period-tabs'
import { resolveYearMonth, todayISO } from '@/lib/dates'
import { parsePeriod, periodLabel } from '@/lib/finance/periods'
import { getReports } from '@/lib/reports'

export const metadata: Metadata = { title: 'Relatórios' }

type Props = { searchParams: Promise<{ mes?: string | string[]; periodo?: string | string[] }> }

export default async function ReportsPage({ searchParams }: Props) {
  const { mes, periodo } = await searchParams
  const ym = resolveYearMonth(mes)
  const period = parsePeriod(periodo)
  const data = await getReports(ym, period, todayISO())

  return (
    <>
      <PageHeader title="Relatórios" ym={ym} basePath="/relatorios" extraParams={{ periodo: period }} />
      <div className="space-y-4">
        <Panel title="Despesas por categoria">
          <PeriodTabs ym={ym} period={period} />
          <p className="text-sm text-muted-foreground">
            {periodLabel(data.range)} x {periodLabel(data.previous)}
          </p>
          <CategoryComparisonList comparison={data.comparison} />
        </Panel>

        <Panel title="Evolução mensal">
          <MonthlyBarsChart points={data.series} showBalance label="Receitas, despesas e saldo dos últimos 12 meses" />
          <ChartLegend
            items={[
              { label: 'Receitas', color: CHART_COLORS.income },
              { label: 'Despesas', color: CHART_COLORS.expense },
              { label: 'Tom claro = previsto', color: CHART_COLORS.muted, faded: true },
              { label: 'Saldo (com previstos)', color: CHART_COLORS.primary, line: true },
            ]}
          />
          <MonthlyTable points={data.series} />
        </Panel>

        <Panel title="Gastos por cartão">
          {data.cards.cards.length === 0 ? (
            <EmptyText>Nenhum gasto no cartão nos últimos 12 meses.</EmptyText>
          ) : (
            <>
              <CardSpendingChart data={data.cards} />
              <ChartLegend items={data.cards.cards.map((card) => ({ label: card.name, color: card.color }))} />
              <CardSpendingTable data={data.cards} />
            </>
          )}
        </Panel>

        <p className="text-sm">
          <Link href="/lancamentos" className="text-primary underline-offset-4 hover:underline">
            Exportar lançamentos (CSV)
          </Link>
        </p>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Verificar**

Run: `npm test`, `npm run lint`, `npm run build`
Expected: tudo passa.

Manual (`npm run dev`): `/relatorios` em 360px e 1440px — trocar os 5 atalhos (o rótulo mostra os dois intervalos; "Trimestre" com outubro: "ago–out/2026 x mai–jul/2026"; "Ano": "jan–out/2026 x jan–out/2025"); trocar o mês preserva o período; evolução com 12 meses e linha de saldo; gasto por cartão com estorno abatendo; "Ver tabela" abre no celular; sem rolagem horizontal da página em 360px (a tabela de cartões só existe a partir de `sm` e rola dentro do próprio contêiner).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/relatorios/page.tsx" components/reports
git commit -m "feat(relatorios): despesas por categoria com comparação, evolução mensal e gastos por cartão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: README e verificação final

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar o README**

Trocar o título `## Funcionalidades (até a Fase 4)` por `## Funcionalidades (até a Fase 5)` e acrescentar, logo depois do item **Orçamento**:

```markdown
- **Início** (`/inicio`): receitas, despesas e saldo do mês (realizado e previsto), saldo das contas hoje, despesas por categoria (rosca, com link para Lançamentos), receitas x despesas dos últimos 6 meses, faturas abertas e fechadas a pagar, comprometimento futuro (parcelas e assinaturas no cartão nos próximos 6 meses) e as 5 categorias mais perto do limite do orçamento.
- **Relatórios** (`/relatorios`): despesas por categoria no período (Mês, Trimestre, Semestre, Ano ou 12 meses) comparadas com o período anterior; evolução mensal de 12 meses com saldo; gastos por cartão por mês (estornos abatem).
- **Exportar CSV** (`/lancamentos`, botão "Exportar CSV"): baixa as linhas da tela (mês, filtros e busca) em CSV para Excel em português (`;`, vírgula decimal, acentos).
```

- [ ] **Step 2: Verificação completa**

Run: `npm test`, `npm run test:rls`, `npm run lint`, `npm run build`
Expected: tudo passa (o `test:rls` não muda nesta fase; confirma que nada quebrou nas tabelas existentes).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README com as funcionalidades da Fase 5

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
