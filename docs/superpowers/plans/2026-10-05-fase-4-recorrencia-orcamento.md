# Fase 4 — Recorrência e orçamento: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lançamentos recorrentes (semanal, mensal, anual) criados pelo formulário rápido e gerados automaticamente até 12 meses à frente, com edição "só este / este e os próximos" e a tela Recorrências; e orçamento mensal por categoria com realizado + previsto e alertas em 80% e 100%.

**Architecture:** Regras puras em `lib/finance/recurrence.ts` e `lib/finance/budget.ts` (datas da série, janela de geração, o que trocar numa mudança da série, limite efetivo do mês, gasto por categoria) são a fonte da verdade e têm testes Vitest. Server Actions calculam as linhas e gravam por RPCs Postgres atômicos `security invoker` (`create_recurrence`, `generate_recurrence_occurrences`, `apply_recurrence_change`, `restore_recurrence`, `apply_budget_change`). A geração roda no layout `(app)` a cada carregamento (`syncRecurrences`), e um índice único `(recurrence_id, occurrence_date)` impede duplicatas. No cartão, cada ocorrência cai na fatura pela regra da Fase 3 (`resolveCycleForDate`).

**Tech Stack:** Next.js 16.3 (App Router), React 19.2, TypeScript strict, Tailwind 4, shadcn (Radix), lucide-react, Supabase (@supabase/ssr 0.12, supabase-js 2.117), zod 4, react-hook-form 7, date-fns 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-fase-4-recorrencia-orcamento-design.md` (base: `docs/PRD.md`; Fase 3: `docs/superpowers/specs/2026-10-04-fase-3-cartoes-faturas-parcelas-design.md`)

## Global Constraints

- Texto da interface em pt-BR; datas dd/mm/aaaa; fuso `America/Sao_Paulo`; moeda BRL.
- Valores sempre inteiros em centavos (`*_cents`, `amountCents`); conversão para reais só na exibição.
- Datas de calendário trafegam como string `AAAA-MM-DD`; meses (orçamento, fatura) como `AAAA-MM-01`. Nunca `new Date('AAAA-MM-DD')` para exibir — use `formatISODateBR`/`formatYearMonthLabel`. "Hoje" é sempre `todayISO()`.
- Toda tabela nova: `household_id not null references households on delete cascade`, RLS + policy `public.is_household_member(household_id)`, `revoke all ... from anon`.
- Funções de trigger: `security definer`, `set search_path = ''`, `revoke all ... from public, anon, authenticated`. RPCs chamados pelo app: `security invoker`, `set search_path = ''`, `grant execute ... to authenticated`.
- Mudanças de schema só via `supabase/migrations/`; depois de aplicar (`npm run db:push`), `npm run db:types`.
- Série: datas sempre calculadas a partir da âncora `start_date` (`addMonthsClamped(start, k)` / `+7k` dias), nunca da ocorrência anterior. Horizonte de geração: hoje + 12 meses (`RECURRENCE_HORIZON_MONTHS`).
- Todo lançamento ligado a uma série tem `recurrence_id`, `occurrence_date` e `source = 'recurrence'`. Operações de série ("este e os próximos", tela Recorrências, encerrar) **nunca** alteram nem apagam ocorrências realizadas (`effectiveStatus = 'paid'`), exceto o próprio lançamento que a pessoa abriu.
- Receitas e despesas no cartão (`account_id` nulo) têm status derivado da data na leitura (`effectiveStatus`); lançamentos em conta usam o status salvo.
- Orçamento só para categorias de despesa de primeiro nível; gasto de subcategoria soma na mãe; valor efetivo 0 = sem limite.
- Receita/despesa, status e alertas nunca diferenciados só pela cor: sinal, ícone ou texto.
- Mobile-first: sem rolagem horizontal em 360px; desktop até `max-w-[1280px]`; valores com `tabular-nums` à direita.
- Comandos via Bash tool (Git Bash) a partir de `gusfer/`; não redirecionar com `>` no PowerShell.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Componentes shadcn são Radix (`asChild`); `cn` vem de `@/lib/utils`; mutações revalidam com `revalidatePath('/', 'layout')`.
- Next.js 16: `params`/`searchParams` são `Promise`; leia `node_modules/next/dist/docs/` antes de usar uma API do Next que você não viu neste repositório.

## Review Focus

1. **Duas sessões abrindo o app ao mesmo tempo** (ou recarregar várias vezes): nenhuma ocorrência duplicada. Teste no Task 4 (gerar a mesma janela duas vezes com `generate_recurrence_occurrences` mantém a contagem).
2. **Série no dia 29/30/31 e anual em 29/02**: cai no último dia dos meses curtos e volta ao dia original. Teste no Task 1 (`occurrenceDates`).
3. **"Só este mês" no mês em que um limite repetido começou**: os meses seguintes continuam com o limite antigo. Teste no Task 3 (`budgetChange`, encadeamento preservado, inclusive com exceção no mês seguinte).
4. **Excluir "este e os próximos" a partir da primeira ocorrência** (a série deixa de existir) e "Desfazer": tudo volta com os mesmos ids. Teste no Task 2 (`removeFollowing` com `endDate < startDate`) e no Task 4 (`apply_recurrence_change` apaga a série; `restore_recurrence` a recria).
5. **Assinatura no cartão cuja fatura já fechou pelas datas salvas**: a ocorrência vai para a fatura seguinte, nunca para uma fechada. Teste no Task 1 (`buildOccurrences` com faturas salvas).

## Decisões deste plano (rulings sobre a spec)

- `apply_budget_change` recebe `(p_category_id, p_upserts jsonb, p_delete_months date[])` em vez de um único upsert: "Só este mês" no mês em que um limite repetido começou precisa gravar também o mês seguinte para não quebrar a cadeia (Review Focus 3).
- `apply_recurrence_change` recebe em `p_patch` o **estado completo** da série (todos os campos), não só o que mudou — campos nulos (`end_date`, `credit_card_id`) também são valores.
- "Editar este e os próximos" reescreve o próprio lançamento aberto dentro do RPC: ele vai em `p_delete_ids` e volta em `p_rows` com o mesmo `id` (insert sem `on conflict`, para um conflito de `occurrence_date` desfazer tudo em vez de perder a linha).
- As funções puras de mudança de série se chamam `createSeries`, `changeFollowing`, `removeFollowing`, `changeSeries` e `endSeries` (a spec agrupa tudo como `seriesChange`); `sortBudgetRows` virou `sortBudgetLines` (opera sobre `BudgetLine`).
- Séries encerradas aparecem na tela só para leitura (não se edita uma série encerrada).
- Limitação aceita: uma ocorrência futura excluída "só este" volta se a série for depois editada pela tela Recorrências (que regenera de hoje em diante).

---

## Mapa de arquivos

```
supabase/migrations/20261005120000_recorrencia_orcamento.sql   Task 4
tests/rls/recurrences.rls.test.ts             Task 4
lib/
  finance/recurrence.ts (+test)                Task 1/2  datas, janela, ocorrências, mudanças da série, describeSchedule
  finance/budget.ts (+test)                    Task 3    limite efetivo, mudança, gasto por categoria, progresso, linhas
  finance/card.ts (+test)                      Task 3    cardUsage com futureRecurringCents
  recurrence-rpc.ts (+test)                    Task 4    argumentos dos RPCs de série e orçamento
  supabase/errors.ts (+test)                   Task 4    INVALID_RECURRENCE, INVALID_BUDGET_CATEGORY, mensagens de arquivar
  supabase/database.types.ts                   Task 4    regenerado
  validation/transaction.ts (+test)            Task 5    repeat, form values, schemas exportados
  validation/recurrence.ts (+test)             Task 5    repeatSchema, edição da série, conversões para Series
  validation/budget.ts (+test)                 Task 5
  validation/transaction-record.ts (+test)     Task 5    colunas de série no snapshot, snapshot da série
  card-context.ts                              Task 6    loadSchedule, loadStoredCycles, loadCardContext (server-only)
  recurrence-server.ts                         Task 6    leitura da série, insertSeries, hasActiveRecurrence (server-only)
  recurrences-sync.ts                          Task 6    syncRecurrences (server-only)
  cards.ts                                     Task 6    uso do limite com recorrências futuras
  actions/transactions.ts                      Task 6    createTransaction com repeat
  actions/card-transactions.ts                 Task 6    createCardTransaction com repeat; helpers movidos
  actions/recurrences.ts                       Task 6    este e os próximos, desfazer, tela, encerrar
  actions/accounts.ts, cards.ts, categories.ts Task 6    arquivar recusa com recorrência ativa
  transaction-mappers.ts (+test)               Task 7    colunas de série, seriesInfo
  recurrences.ts                               Task 8    listRecurrences (server-only)
  budgets.ts                                   Task 9    getBudgetMonth (server-only)
  actions/budgets.ts                           Task 9    setBudget
components/
  transactions/transaction-form.tsx            Task 7    Repetir, escopo da série
  transactions/transaction-modal.tsx           Task 7    series
  transactions/transaction-item.tsx            Task 7    ícone de repetir
  transactions/transaction-list.tsx            Task 7    series
  cards/invoice-transactions.tsx               Task 7    series
  layout/nav-items.ts                          Task 8    Recorrências
  recurrences/recurrence-list.tsx              Task 8
  recurrences/recurrence-form.tsx              Task 8
  budgets/budget-bar.tsx                       Task 9
  budgets/budget-list.tsx                      Task 9
  budgets/budget-form.tsx                      Task 9
app/(app)/
  layout.tsx                                   Task 6    syncRecurrences
  recorrencias/page.tsx                        Task 8
  orcamento/page.tsx                           Task 9
README.md                                      Task 10
```

## Comandos

- `npm test` — testes unitários (Vitest).
- `npx vitest run lib/finance/recurrence.test.ts` — um arquivo.
- `npm run test:rls` — integração contra o Supabase (precisa de `.env.test.local`).
- `npm run db:push` e `npm run db:types` — aplicar migration e regenerar tipos.
- `npm run lint` e `npm run build`.

---

### Task 1: Datas da série e geração de ocorrências

**Files:**
- Create: `lib/finance/recurrence.ts`
- Test: `lib/finance/recurrence.test.ts`

**Interfaces:**
- Consumes: `addMonthsClamped`, `resolveCycleForDate` (`lib/finance/invoice.ts`); `defaultStatus`, `effectiveStatus` (`lib/finance/status.ts`); `addDaysISO`, `formatISODateBR` (`lib/dates.ts`); tipos `CardSchedule`, `InvoiceCycle`, `TransactionStatus`, `TransactionType` (`lib/finance/types.ts`).
- Produces:
  - `RECURRENCE_FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const`, `type RecurrenceFrequency`, `FREQUENCY_LABELS: Record<RecurrenceFrequency, string>`, `RECURRENCE_HORIZON_MONTHS = 12`.
  - `type RecurrenceSchedule = { frequency; startDate: string; endDate: string | null }`.
  - `type SeriesType = 'income' | 'expense' | 'transfer'`; `type SeriesFields = { type; description; amountCents; categoryId: string | null; accountId: string | null; destinationAccountId: string | null; creditCardId: string | null; notes: string | null }`; `type Series = SeriesFields & RecurrenceSchedule`.
  - `nthOccurrence(schedule, k): string`, `occurrenceDates(schedule, from, until): string[]`, `horizonDate(today): string`, `untilFor(endDate, today): string`, `generationWindow(generatedUntil, endDate, today): { from; until } | null`.
  - `type CardContext = { schedule: CardSchedule; stored: InvoiceCycle[] }`; `type Occurrence = { id?: string; date: string; occurrenceDate: string; status: TransactionStatus; cycle: InvoiceCycle | null }`; `buildOccurrences(dates, card, today): Occurrence[]`.
  - `type SeriesTransaction = { id; occurrenceDate; type: TransactionType; status; date; accountId: string | null }`; `occurrencesToReplace(transactions, fromDate, today): string[]`; `nextOccurrenceDate(transactions, today): string | null`.
  - `describeSchedule(schedule): string`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `lib/finance/recurrence.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cycleForClosingMonth } from './invoice'
import {
  buildOccurrences,
  describeSchedule,
  generationWindow,
  nextOccurrenceDate,
  occurrenceDates,
  occurrencesToReplace,
  type SeriesTransaction,
} from './recurrence'

const TODAY = '2026-10-05'

describe('occurrenceDates', () => {
  it('mensal no dia 31 cai no último dia dos meses curtos e volta ao 31', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2026-01-31', endDate: null }, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('em ano bissexto fevereiro tem 29', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2028-01-31', endDate: null }, '2028-02-01', '2028-03-31')).toEqual([
      '2028-02-29',
      '2028-03-31',
    ])
  })

  it('anual em 29/02 cai em 28/02 nos anos normais e volta a 29/02', () => {
    expect(occurrenceDates({ frequency: 'yearly', startDate: '2028-02-29', endDate: null }, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
  })

  it('semanal soma 7 dias a partir da âncora', () => {
    expect(occurrenceDates({ frequency: 'weekly', startDate: '2026-10-05', endDate: null }, '2026-10-01', '2026-10-26')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ])
  })

  it('para na data final mesmo com a janela maior', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2026-10-10', endDate: '2026-12-15' }, '2026-10-01', '2027-03-31')).toEqual([
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
    ])
  })

  it('série que começou no passado devolve só as datas da janela', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2026-01-10', endDate: null }, '2026-09-01', '2026-11-30')).toEqual([
      '2026-09-10',
      '2026-10-10',
      '2026-11-10',
    ])
  })

  it('janela vazia devolve nada', () => {
    expect(occurrenceDates({ frequency: 'monthly', startDate: '2026-01-10', endDate: null }, '2026-11-11', '2026-12-09')).toEqual([])
  })
})

describe('generationWindow', () => {
  it('em dia: nada a gerar', () => {
    expect(generationWindow('2027-10-05', null, TODAY)).toBeNull()
  })

  it('atrasada: do dia seguinte até hoje + 12 meses', () => {
    expect(generationWindow('2027-09-30', null, TODAY)).toEqual({ from: '2027-10-01', until: '2027-10-05' })
  })

  it('encerrada e já gerada até o fim: nada a gerar', () => {
    expect(generationWindow('2026-12-10', '2026-12-10', TODAY)).toBeNull()
  })

  it('data final antes do horizonte limita a janela', () => {
    expect(generationWindow('2026-10-10', '2027-01-31', TODAY)).toEqual({ from: '2026-10-11', until: '2027-01-31' })
  })
})

describe('buildOccurrences', () => {
  const card = { closingDay: 3, dueDay: 10 }

  it('em conta nascem pendentes e sem fatura', () => {
    expect(buildOccurrences(['2026-11-10'], null, TODAY)).toEqual([
      { date: '2026-11-10', occurrenceDate: '2026-11-10', status: 'pending', cycle: null },
    ])
  })

  it('no cartão a fatura segue a regra 8.2 e o status segue a data', () => {
    expect(buildOccurrences(['2026-10-02', '2026-10-03', '2026-11-20'], { schedule: card, stored: [] }, TODAY)).toEqual([
      { date: '2026-10-02', occurrenceDate: '2026-10-02', status: 'paid', cycle: cycleForClosingMonth(card, '2026-10-01') },
      { date: '2026-10-03', occurrenceDate: '2026-10-03', status: 'paid', cycle: cycleForClosingMonth(card, '2026-11-01') },
      { date: '2026-11-20', occurrenceDate: '2026-11-20', status: 'pending', cycle: cycleForClosingMonth(card, '2026-12-01') },
    ])
  })

  it('no cartão nunca cai numa fatura que já fechou pelas datas salvas', () => {
    const stored = [{ closingMonth: '2026-11-01', closingDate: '2026-11-01', dueDate: '2026-11-10', referenceMonth: '2026-11-01' }]
    const [occurrence] = buildOccurrences(['2026-11-02'], { schedule: card, stored }, TODAY)
    expect(occurrence.cycle?.closingMonth).toBe('2026-12-01')
  })
})

const tx = (id: string, occurrenceDate: string, status: 'paid' | 'pending', accountId: string | null = 'acc'): SeriesTransaction => ({
  id,
  occurrenceDate,
  type: 'expense',
  status,
  date: occurrenceDate,
  accountId,
})

describe('occurrencesToReplace e nextOccurrenceDate', () => {
  const transactions = [
    tx('set', '2026-09-10', 'pending'),
    tx('out', '2026-10-10', 'paid'),
    tx('nov', '2026-11-10', 'pending'),
    tx('dez-cartao', '2026-12-10', 'pending', null),
    tx('out-cartao', '2026-10-01', 'pending', null),
  ]

  it('troca só as não realizadas a partir da data; pagas e compras no cartão já passadas ficam', () => {
    expect(occurrencesToReplace(transactions, '2026-10-01', TODAY)).toEqual(['nov', 'dez-cartao'])
  })

  it('a próxima data é a primeira não realizada de hoje em diante', () => {
    expect(nextOccurrenceDate(transactions, TODAY)).toBe('2026-11-10')
    expect(nextOccurrenceDate([tx('out', '2026-10-10', 'paid')], TODAY)).toBeNull()
  })
})

describe('describeSchedule', () => {
  it('mensal, semanal e anual', () => {
    expect(describeSchedule({ frequency: 'monthly', startDate: '2026-10-05', endDate: null })).toBe('Todo dia 5, sem data final')
    expect(describeSchedule({ frequency: 'weekly', startDate: '2026-10-05', endDate: '2026-12-31' })).toBe(
      'Toda segunda-feira, até 31/12/2026',
    )
    expect(describeSchedule({ frequency: 'weekly', startDate: '2026-10-10', endDate: null })).toBe('Todo sábado, sem data final')
    expect(describeSchedule({ frequency: 'yearly', startDate: '2026-03-15', endDate: null })).toBe('Todo ano em 15/03, sem data final')
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

Run: `npx vitest run lib/finance/recurrence.test.ts`
Expected: FAIL — `Failed to resolve import "./recurrence"`.

- [ ] **Step 3: Implemente**

Crie `lib/finance/recurrence.ts`:

```ts
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
```

- [ ] **Step 4: Rode o teste e veja passar**

Run: `npx vitest run lib/finance/recurrence.test.ts`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add lib/finance/recurrence.ts lib/finance/recurrence.test.ts
git commit -m "feat(finance): datas da série, janela de geração e ocorrências recorrentes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Criar, mudar e encerrar uma série

**Files:**
- Modify: `lib/finance/recurrence.ts` (acrescentar ao fim)
- Test: `lib/finance/recurrence-change.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Series`, `SeriesFields`, `SeriesTransaction`, `CardContext`, `Occurrence`, `occurrenceDates`, `untilFor`, `buildOccurrences`, `occurrencesToReplace`, `nextOccurrenceDate`, `RecurrenceFrequency`).
- Produces:
  - `type SeriesState = Series & { id: string; generatedUntil: string }`.
  - `type ChangeContext = { transactions: SeriesTransaction[]; today: string; card: CardContext | null }` — `card` é o contexto do cartão dos **novos** valores (null quando a série fica em conta).
  - `type SeriesChange = { series: Series; deleteIds: string[]; occurrences: Occurrence[]; generatedUntil: string }` — `series` é o estado completo depois da mudança.
  - `type OccurrenceValues = SeriesFields & { date: string; status: TransactionStatus }`.
  - `type SeriesEditValues = SeriesFields & { frequency: RecurrenceFrequency; nextDate: string; endDate: string | null }`.
  - `createSeries(series: Series, firstStatus: TransactionStatus, card: CardContext | null, today: string): { occurrences: Occurrence[]; generatedUntil: string }`.
  - `changeFollowing(current: SeriesState, occurrence: SeriesTransaction, values: OccurrenceValues, ctx: ChangeContext): SeriesChange`.
  - `removeFollowing(current: SeriesState, occurrence: SeriesTransaction, ctx: ChangeContext): SeriesChange`.
  - `changeSeries(current: SeriesState, values: SeriesEditValues, ctx: ChangeContext): SeriesChange`.
  - `endSeries(current: SeriesState, ctx: ChangeContext): SeriesChange`.

Regras (spec 2.1):
- **Criar**: a primeira ocorrência é a própria `start_date` (o lançamento que a pessoa salvou), com o status escolhido no formulário (em conta) ou pela data (cartão). As demais vão até o horizonte; série que começa depois do horizonte grava só a primeira.
- **Editar este e os próximos**: o lançamento aberto é regravado com os novos valores (mesmo `id`); se a data mudou, ela vira a nova `start_date` e a nova `occurrence_date`. As não realizadas depois dele são trocadas pelas datas novas.
- **Excluir este e os próximos**: `end_date` = dia anterior à `occurrence_date`; apaga o lançamento aberto (mesmo pago) e as não realizadas depois dele. `end_date < start_date` faz o RPC apagar a série (Task 4).
- **Editar pela tela**: troca as não realizadas de hoje em diante; mudar a frequência ou a próxima data faz da próxima data a nova `start_date`.
- **Encerrar**: `end_date` = hoje; apaga as não realizadas depois de hoje.

- [ ] **Step 1: Escreva o teste que falha**

Crie `lib/finance/recurrence-change.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  changeFollowing,
  changeSeries,
  createSeries,
  endSeries,
  removeFollowing,
  type ChangeContext,
  type SeriesChange,
  type SeriesFields,
  type SeriesState,
  type SeriesTransaction,
} from './recurrence'

const TODAY = '2026-10-05'

const FIELDS: SeriesFields = {
  type: 'expense',
  description: 'Aluguel',
  amountCents: 200_000,
  categoryId: 'cat',
  accountId: 'acc',
  destinationAccountId: null,
  creditCardId: null,
  notes: null,
}

const CURRENT: SeriesState = {
  id: 'rec',
  ...FIELDS,
  frequency: 'monthly',
  startDate: '2026-09-10',
  endDate: null,
  generatedUntil: '2027-10-05',
}

const tx = (id: string, occurrenceDate: string, status: 'paid' | 'pending'): SeriesTransaction => ({
  id,
  occurrenceDate,
  type: 'expense',
  status,
  date: occurrenceDate,
  accountId: 'acc',
})

// Setembro pago, outubro e novembro pendentes, dezembro pago adiantado
const TRANSACTIONS = [tx('set', '2026-09-10', 'paid'), tx('out', '2026-10-10', 'pending'), tx('nov', '2026-11-10', 'pending'), tx('dez', '2026-12-10', 'paid')]
const CTX: ChangeContext = { transactions: TRANSACTIONS, today: TODAY, card: null }
const occurrence = (id: string) => TRANSACTIONS.find((item) => item.id === id)!
const dates = (change: Pick<SeriesChange, 'occurrences'>) => change.occurrences.map((item) => item.date)

describe('createSeries', () => {
  it('grava a primeira com o status do formulário e as demais pendentes até o horizonte', () => {
    const created = createSeries({ ...FIELDS, frequency: 'monthly', startDate: '2026-10-10', endDate: null }, 'paid', null, TODAY)
    expect(created.occurrences).toHaveLength(12)
    expect(created.occurrences[0]).toEqual({ date: '2026-10-10', occurrenceDate: '2026-10-10', status: 'paid', cycle: null })
    expect(created.occurrences[1].status).toBe('pending')
    expect(created.occurrences.at(-1)?.date).toBe('2027-09-10')
    expect(created.generatedUntil).toBe('2027-10-05')
  })

  it('série que começou no passado gera as ocorrências atrasadas como pendentes', () => {
    const created = createSeries({ ...FIELDS, frequency: 'monthly', startDate: '2026-08-10', endDate: null }, 'paid', null, TODAY)
    expect(created.occurrences).toHaveLength(14)
    expect(created.occurrences[1]).toMatchObject({ date: '2026-09-10', status: 'pending' })
  })

  it('série que começa depois do horizonte grava só a primeira', () => {
    const created = createSeries({ ...FIELDS, frequency: 'yearly', startDate: '2028-01-15', endDate: null }, 'pending', null, TODAY)
    expect(dates(created)).toEqual(['2028-01-15'])
    expect(created.generatedUntil).toBe('2028-01-15')
  })

  it('no cartão o status segue a data e cada uma tem fatura', () => {
    const card = { schedule: { closingDay: 3, dueDay: 10 }, stored: [] }
    const created = createSeries(
      { ...FIELDS, accountId: null, creditCardId: 'card', frequency: 'monthly', startDate: '2026-10-02', endDate: null },
      'pending',
      card,
      TODAY,
    )
    expect(created.occurrences[0]).toMatchObject({ status: 'paid', cycle: { closingMonth: '2026-10-01' } })
    expect(created.occurrences[1]).toMatchObject({ status: 'pending', cycle: { closingMonth: '2026-11-01' } })
  })
})

describe('changeFollowing', () => {
  it('sem mudar a data: regrava este, troca as pendentes seguintes e preserva as pagas', () => {
    const change = changeFollowing(CURRENT, occurrence('out'), { ...FIELDS, amountCents: 250_000, date: '2026-10-10', status: 'pending' }, CTX)
    expect(change.series).toEqual({ ...FIELDS, amountCents: 250_000, frequency: 'monthly', startDate: '2026-09-10', endDate: null })
    expect(change.deleteIds).toEqual(['out', 'nov'])
    expect(change.occurrences[0]).toEqual({ id: 'out', date: '2026-10-10', occurrenceDate: '2026-10-10', status: 'pending', cycle: null })
    expect(dates(change)).toHaveLength(12)
    expect(dates(change).slice(1, 3)).toEqual(['2026-11-10', '2026-12-10'])
    expect(change.generatedUntil).toBe('2027-10-05')
  })

  it('mudando a data: a nova data vira a âncora da série', () => {
    const change = changeFollowing(CURRENT, occurrence('out'), { ...FIELDS, date: '2026-10-15', status: 'paid' }, CTX)
    expect(change.series.startDate).toBe('2026-10-15')
    expect(change.occurrences[0]).toEqual({ id: 'out', date: '2026-10-15', occurrenceDate: '2026-10-15', status: 'paid', cycle: null })
    expect(dates(change)[1]).toBe('2026-11-15')
    expect(change.deleteIds).toEqual(['out', 'nov'])
  })
})

describe('removeFollowing', () => {
  it('encerra no dia anterior e apaga este e as pendentes seguintes', () => {
    const change = removeFollowing(CURRENT, occurrence('nov'), CTX)
    expect(change.series.endDate).toBe('2026-11-09')
    expect(change.deleteIds).toEqual(['nov'])
    expect(change.occurrences).toEqual([])
    expect(change.generatedUntil).toBe('2026-11-09')
  })

  it('a partir da primeira: a data final fica antes do início (o RPC apaga a série)', () => {
    const change = removeFollowing(CURRENT, occurrence('set'), CTX)
    expect(change.series.endDate).toBe('2026-09-09')
    expect(change.series.endDate! < change.series.startDate).toBe(true)
    expect(change.deleteIds).toEqual(['set', 'out', 'nov'])
  })
})

describe('changeSeries', () => {
  it('sem mudar frequência nem próxima data: mantém a âncora e troca as pendentes de hoje em diante', () => {
    const change = changeSeries(CURRENT, { ...FIELDS, amountCents: 210_000, frequency: 'monthly', nextDate: '2026-10-10', endDate: null }, CTX)
    expect(change.series.startDate).toBe('2026-09-10')
    expect(change.series.amountCents).toBe(210_000)
    expect(change.deleteIds).toEqual(['out', 'nov'])
    expect(dates(change)).toHaveLength(12)
    expect(dates(change)[0]).toBe('2026-10-10')
  })

  it('mudando a frequência: a próxima data vira a âncora', () => {
    const change = changeSeries(CURRENT, { ...FIELDS, frequency: 'weekly', nextDate: '2026-10-12', endDate: '2026-11-02' }, CTX)
    expect(change.series).toMatchObject({ frequency: 'weekly', startDate: '2026-10-12', endDate: '2026-11-02' })
    expect(dates(change)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'])
    expect(change.generatedUntil).toBe('2026-11-02')
  })

  it('só a data final: gera até ela', () => {
    const change = changeSeries(CURRENT, { ...FIELDS, frequency: 'monthly', nextDate: '2026-10-10', endDate: '2026-12-31' }, CTX)
    expect(dates(change)).toEqual(['2026-10-10', '2026-11-10', '2026-12-10'])
    expect(change.generatedUntil).toBe('2026-12-31')
  })
})

describe('endSeries', () => {
  it('termina hoje e apaga as pendentes futuras', () => {
    const change = endSeries(CURRENT, CTX)
    expect(change.series.endDate).toBe(TODAY)
    expect(change.deleteIds).toEqual(['out', 'nov'])
    expect(change.generatedUntil).toBe(TODAY)
  })

  it('série que ainda não começou: a data final fica antes do início (o RPC apaga a série)', () => {
    const change = endSeries({ ...CURRENT, startDate: '2026-11-01' }, CTX)
    expect(change.series.endDate! < change.series.startDate).toBe(true)
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

Run: `npx vitest run lib/finance/recurrence-change.test.ts`
Expected: FAIL — `createSeries is not a function` (ou erro de import dos nomes novos).

- [ ] **Step 3: Implemente**

Acrescente ao fim de `lib/finance/recurrence.ts` (e inclua `TransactionStatus` no import de tipos, que já existe):

```ts
export type SeriesState = Series & { id: string; generatedUntil: string }

/** `card` é o cartão dos valores novos (null quando a série fica em conta). */
export type ChangeContext = { transactions: SeriesTransaction[]; today: string; card: CardContext | null }

/** Estado completo da série depois da mudança, o que apagar e o que gravar. */
export type SeriesChange = { series: Series; deleteIds: string[]; occurrences: Occurrence[]; generatedUntil: string }

export type OccurrenceValues = SeriesFields & { date: string; status: TransactionStatus }

export type SeriesEditValues = SeriesFields & { frequency: RecurrenceFrequency; nextDate: string; endDate: string | null }

function seriesOf({ id: _id, generatedUntil: _generatedUntil, ...series }: SeriesState): Series {
  return series
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
```

Se o ESLint reclamar de `_id`/`_generatedUntil` não usados, troque `seriesOf` por uma cópia explícita dos campos (como `fieldsOf`, mais `frequency`, `startDate`, `endDate`).

- [ ] **Step 4: Rode os testes e veja passar**

Run: `npx vitest run lib/finance/recurrence-change.test.ts lib/finance/recurrence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/recurrence.ts lib/finance/recurrence-change.test.ts
git commit -m "feat(finance): criar, editar, excluir e encerrar séries recorrentes preservando as pagas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Orçamento e uso do limite com recorrências

**Files:**
- Create: `lib/finance/budget.ts`
- Test: `lib/finance/budget.test.ts`
- Modify: `lib/finance/card.ts` (`cardUsage`), `lib/finance/card.test.ts`

**Interfaces:**
- Consumes: `effectiveStatus` (`./status`), `usageLevel`, `UsageLevel` (`./card`), `shiftYearMonth`, `yearMonthOfISO`, `formatYearMonthParam` (`@/lib/dates`), tipos de `./types`.
- Produces:
  - `BUDGET_MODES = ['only', 'from'] as const`, `type BudgetMode`.
  - `type BudgetRow = { categoryId: string; month: string; amountCents: number; repeats: boolean }`.
  - `effectiveBudget(rows, categoryId, month): number | null`.
  - `type BudgetUpsert = { month: string; amountCents: number; repeats: boolean }`; `type BudgetChange = { upserts: BudgetUpsert[]; deleteMonths: string[] }`; `budgetChange(rows, categoryId, month, amountCents, mode): BudgetChange`.
  - `type SpendingTransaction = { type: TransactionType; status: TransactionStatus; date: string; accountId: string | null; amountCents: number; categoryId: string | null }`; `type Spending = { realizedCents: number; plannedCents: number }`; `categorySpending(transactions, categories: { id: string; parentId: string | null }[], month, today): Map<string, Spending>`.
  - `type BudgetProgress = { realizedRatio: number; plannedRatio: number; ratio: number; level: UsageLevel }`; `budgetProgress(limitCents, realizedCents, plannedCents): BudgetProgress`.
  - `type BudgetLine = { categoryId: string; name: string; color: string; icon: string; limitCents: number | null; spending: Spending; progress: BudgetProgress | null }`; `buildBudgetLines(categories, rows, spending, month): BudgetLine[]` (já ordenadas); `sortBudgetLines(lines): BudgetLine[]`; `budgetTotals(lines): { budgetedCents: number; realizedCents: number; plannedCents: number }`.
  - `cardUsage(limitCents, invoices, futureRecurringCents = 0): CardUsage`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `lib/finance/budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  budgetChange,
  budgetProgress,
  budgetTotals,
  buildBudgetLines,
  categorySpending,
  effectiveBudget,
  type BudgetChange,
  type BudgetRow,
  type SpendingTransaction,
} from './budget'

const CAT = 'mercado'
const row = (month: string, amountCents: number, repeats: boolean): BudgetRow => ({ categoryId: CAT, month, amountCents, repeats })

/** Aplica a mudança como o RPC: apaga os meses e faz upsert das linhas. */
function apply(rows: BudgetRow[], change: BudgetChange): BudgetRow[] {
  const kept = rows.filter((item) => !change.deleteMonths.includes(item.month))
  for (const upsert of change.upserts) {
    const index = kept.findIndex((item) => item.month === upsert.month)
    const next = { categoryId: CAT, ...upsert }
    if (index >= 0) kept[index] = next
    else kept.push(next)
  }
  return kept
}

const months = (rows: BudgetRow[], list: string[]) => list.map((month) => effectiveBudget(rows, CAT, month))

describe('effectiveBudget', () => {
  it('linha do mês, senão a última que se repete, senão nenhum', () => {
    const rows = [row('2026-10-01', 150_000, true), row('2026-12-01', 300_000, false)]
    expect(months(rows, ['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01'])).toEqual([
      null,
      150_000,
      150_000,
      300_000,
      150_000,
    ])
  })

  it('valor 0 é sem limite', () => {
    expect(effectiveBudget([row('2026-10-01', 0, true)], CAT, '2026-11-01')).toBeNull()
  })

  it('não mistura categorias', () => {
    expect(effectiveBudget([row('2026-10-01', 150_000, true)], 'outra', '2026-10-01')).toBeNull()
  })
})

describe('budgetChange', () => {
  it('a partir deste mês: repete e apaga as repetições futuras, mantendo as exceções', () => {
    const rows = [row('2026-10-01', 150_000, true), row('2026-12-01', 300_000, false), row('2027-02-01', 160_000, true)]
    const change = budgetChange(rows, CAT, '2026-11-01', 170_000, 'from')
    expect(change).toEqual({ upserts: [{ month: '2026-11-01', amountCents: 170_000, repeats: true }], deleteMonths: ['2027-02-01'] })
    expect(months(apply(rows, change), ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-03-01'])).toEqual([
      150_000,
      170_000,
      300_000,
      170_000,
      170_000,
    ])
  })

  it('só este mês num mês sem linha própria: só grava a exceção', () => {
    const rows = [row('2026-10-01', 150_000, true)]
    const change = budgetChange(rows, CAT, '2026-12-01', 300_000, 'only')
    expect(change).toEqual({ upserts: [{ month: '2026-12-01', amountCents: 300_000, repeats: false }], deleteMonths: [] })
    expect(months(apply(rows, change), ['2026-11-01', '2026-12-01', '2027-01-01'])).toEqual([150_000, 300_000, 150_000])
  })

  it('só este mês no mês em que a repetição começou não quebra os meses seguintes', () => {
    const rows = [row('2026-10-01', 150_000, true)]
    const change = budgetChange(rows, CAT, '2026-10-01', 180_000, 'only')
    expect(change.upserts).toEqual([
      { month: '2026-10-01', amountCents: 180_000, repeats: false },
      { month: '2026-11-01', amountCents: 150_000, repeats: true },
    ])
    expect(months(apply(rows, change), ['2026-10-01', '2026-11-01', '2027-03-01'])).toEqual([180_000, 150_000, 150_000])
  })

  it('o encadeamento pula as exceções que já existem nos meses seguintes', () => {
    const rows = [row('2026-10-01', 150_000, true), row('2026-11-01', 100_000, false)]
    const change = budgetChange(rows, CAT, '2026-10-01', 180_000, 'only')
    expect(change.upserts[1]).toEqual({ month: '2026-12-01', amountCents: 150_000, repeats: true })
    expect(months(apply(rows, change), ['2026-10-01', '2026-11-01', '2026-12-01'])).toEqual([180_000, 100_000, 150_000])
  })

  it('remover a partir deste mês é gravar 0 que se repete', () => {
    const rows = [row('2026-10-01', 150_000, true)]
    const change = budgetChange(rows, CAT, '2026-11-01', 0, 'from')
    expect(months(apply(rows, change), ['2026-10-01', '2026-11-01', '2027-05-01'])).toEqual([150_000, null, null])
  })
})

describe('categorySpending', () => {
  const categories = [
    { id: 'mercado', parentId: null },
    { id: 'feira', parentId: 'mercado' },
    { id: 'lazer', parentId: null },
  ]
  const tx = (fields: Partial<SpendingTransaction>): SpendingTransaction => ({
    type: 'expense',
    status: 'paid',
    date: '2026-10-02',
    accountId: 'acc',
    amountCents: 1_000,
    categoryId: 'mercado',
    ...fields,
  })

  it('soma subcategoria na mãe, separa realizado de previsto e ignora o que não é despesa do mês', () => {
    const spending = categorySpending(
      [
        tx({ amountCents: 90_000 }),
        tx({ categoryId: 'feira', amountCents: 5_000 }),
        tx({ status: 'pending', date: '2026-10-28', amountCents: 40_000 }),
        // Cartão: status pela data (02/10 já passou, 20/10 ainda não)
        tx({ accountId: null, status: 'pending', amountCents: 3_000 }),
        tx({ accountId: null, status: 'paid', date: '2026-10-20', amountCents: 7_000 }),
        tx({ type: 'income', categoryId: 'mercado', amountCents: 99_999 }),
        tx({ type: 'transfer', categoryId: null, amountCents: 99_999 }),
        tx({ date: '2026-11-01', amountCents: 99_999 }),
        tx({ categoryId: 'lazer', amountCents: 2_000 }),
      ],
      categories,
      '2026-10-01',
      '2026-10-05',
    )
    expect(spending.get('mercado')).toEqual({ realizedCents: 98_000, plannedCents: 47_000 })
    expect(spending.get('lazer')).toEqual({ realizedCents: 2_000, plannedCents: 0 })
    expect(spending.has('feira')).toBe(false)
  })
})

describe('budgetProgress', () => {
  it('faixas de 79%, 80% e 100%', () => {
    expect(budgetProgress(100_000, 79_000, 0).level).toBe('ok')
    expect(budgetProgress(100_000, 60_000, 20_000)).toEqual({ realizedRatio: 0.6, plannedRatio: 0.2, ratio: 0.8, level: 'warning' })
    expect(budgetProgress(100_000, 100_000, 0).level).toBe('over')
  })

  it('o exemplo da spec: 900 + 400 de 1.500 é atenção', () => {
    const progress = budgetProgress(150_000, 90_000, 40_000)
    expect(Math.round(progress.ratio * 100)).toBe(87)
    expect(progress.level).toBe('warning')
  })
})

describe('buildBudgetLines e budgetTotals', () => {
  const categories = [
    { id: 'mercado', name: 'Mercado', kind: 'expense' as const, parentId: null, archived: false, color: '#22c55e', icon: 'shopping-cart' },
    { id: 'lazer', name: 'Lazer', kind: 'expense' as const, parentId: null, archived: false, color: '#a855f7', icon: 'gamepad-2' },
    { id: 'saude', name: 'Saúde', kind: 'expense' as const, parentId: null, archived: false, color: '#ef4444', icon: 'heart-pulse' },
    { id: 'feira', name: 'Feira', kind: 'expense' as const, parentId: 'mercado', archived: false, color: '#22c55e', icon: 'shopping-cart' },
    { id: 'velha', name: 'Velha', kind: 'expense' as const, parentId: null, archived: true, color: '#64748b', icon: 'circle-ellipsis' },
    { id: 'salario', name: 'Salário', kind: 'income' as const, parentId: null, archived: false, color: '#22c55e', icon: 'briefcase' },
  ]
  const rows: BudgetRow[] = [
    { categoryId: 'mercado', month: '2026-10-01', amountCents: 150_000, repeats: true },
    { categoryId: 'lazer', month: '2026-10-01', amountCents: 50_000, repeats: true },
  ]
  const spending = new Map([
    ['mercado', { realizedCents: 90_000, plannedCents: 40_000 }],
    ['lazer', { realizedCents: 10_000, plannedCents: 0 }],
    ['saude', { realizedCents: 30_000, plannedCents: 0 }],
  ])

  it('só despesas de primeiro nível ativas; com limite primeiro, da mais perto do limite para a mais longe', () => {
    const lines = buildBudgetLines(categories, rows, spending, '2026-10-01')
    expect(lines.map((line) => line.categoryId)).toEqual(['mercado', 'lazer', 'saude'])
    expect(lines[2]).toMatchObject({ limitCents: null, progress: null })
    expect(budgetTotals(lines)).toEqual({ budgetedCents: 200_000, realizedCents: 130_000, plannedCents: 40_000 })
  })
})
```

Acrescente em `lib/finance/card.test.ts`, dentro do `describe` de `cardUsage` (ou num novo `describe('cardUsage com recorrências')`):

```ts
it('desconta as recorrências futuras do limite usado', () => {
  expect(cardUsage(100_000, [{ totalCents: 30_000, paidCents: 0 }], 5_500)).toEqual({
    usedCents: 24_500,
    availableCents: 75_500,
    ratio: 0.245,
  })
})
```

- [ ] **Step 2: Rode os testes e veja falhar**

Run: `npx vitest run lib/finance/budget.test.ts lib/finance/card.test.ts`
Expected: FAIL — import de `./budget` não resolve; o teste novo de `cardUsage` falha (`usedCents` 30000).

- [ ] **Step 3: Implemente**

Em `lib/finance/card.ts`, troque `cardUsage` por:

```ts
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
```

Crie `lib/finance/budget.ts`:

```ts
import { formatYearMonthParam, shiftYearMonth, yearMonthOfISO } from '@/lib/dates'
import { usageLevel, type UsageLevel } from './card'
import { effectiveStatus } from './status'
import type { TransactionStatus, TransactionType } from './types'

export const BUDGET_MODES = ['only', 'from'] as const
/** "Só este mês" ou "a partir deste mês". */
export type BudgetMode = (typeof BUDGET_MODES)[number]

/** Linha de `budgets`. `month` em AAAA-MM-01; 0 = sem limite. */
export type BudgetRow = { categoryId: string; month: string; amountCents: number; repeats: boolean }

const nextMonth = (month: string) => `${formatYearMonthParam(shiftYearMonth(yearMonthOfISO(month), 1))}-01`

/** Limite do mês: a linha do mês; senão a última anterior que se repete; senão nenhum. Valor 0 = sem limite. */
export function effectiveBudget(rows: BudgetRow[], categoryId: string, month: string): number | null {
  const mine = rows.filter((row) => row.categoryId === categoryId)
  const row =
    mine.find((item) => item.month === month) ??
    mine.filter((item) => item.month < month && item.repeats).sort((a, b) => b.month.localeCompare(a.month))[0]
  return row && row.amountCents > 0 ? row.amountCents : null
}

export type BudgetUpsert = { month: string; amountCents: number; repeats: boolean }
export type BudgetChange = { upserts: BudgetUpsert[]; deleteMonths: string[] }

/** O que gravar e apagar ao definir o limite de um mês (spec 2.2). */
export function budgetChange(rows: BudgetRow[], categoryId: string, month: string, amountCents: number, mode: BudgetMode): BudgetChange {
  const mine = rows.filter((row) => row.categoryId === categoryId)
  if (mode === 'from') {
    return {
      upserts: [{ month, amountCents, repeats: true }],
      deleteMonths: mine
        .filter((row) => row.month > month && row.repeats)
        .map((row) => row.month)
        .sort(),
    }
  }

  const upserts: BudgetUpsert[] = [{ month, amountCents, repeats: false }]
  // O limite que se repetia começava neste mês: o primeiro mês seguinte sem linha própria continua com ele
  const own = mine.find((row) => row.month === month)
  if (own?.repeats) {
    let target = nextMonth(month)
    let found = mine.find((row) => row.month === target)
    while (found && !found.repeats) {
      target = nextMonth(target)
      found = mine.find((row) => row.month === target)
    }
    if (!found) upserts.push({ month: target, amountCents: own.amountCents, repeats: true })
  }
  return { upserts, deleteMonths: [] }
}

export type SpendingTransaction = {
  type: TransactionType
  status: TransactionStatus
  date: string
  accountId: string | null
  amountCents: number
  categoryId: string | null
}

export type Spending = { realizedCents: number; plannedCents: number }

/** Despesas do mês por categoria de primeiro nível (subcategoria soma na mãe), realizado x previsto pelo status efetivo. */
export function categorySpending(
  transactions: SpendingTransaction[],
  categories: { id: string; parentId: string | null }[],
  month: string,
  today: string,
): Map<string, Spending> {
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]))
  const prefix = month.slice(0, 7)
  const result = new Map<string, Spending>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.categoryId === null || !tx.date.startsWith(prefix)) continue
    const root = parentOf.get(tx.categoryId) ?? tx.categoryId
    const entry = result.get(root) ?? { realizedCents: 0, plannedCents: 0 }
    if (effectiveStatus(tx, today) === 'paid') entry.realizedCents += tx.amountCents
    else entry.plannedCents += tx.amountCents
    result.set(root, entry)
  }
  return result
}

export type BudgetProgress = { realizedRatio: number; plannedRatio: number; ratio: number; level: UsageLevel }

/** Alerta sobre realizado + previsto: atenção em 80%, estourado em 100%. */
export function budgetProgress(limitCents: number, realizedCents: number, plannedCents: number): BudgetProgress {
  if (limitCents <= 0) return { realizedRatio: 0, plannedRatio: 0, ratio: 0, level: 'ok' }
  const realizedRatio = realizedCents / limitCents
  const plannedRatio = plannedCents / limitCents
  // Divide a soma (não soma as razões): 0,6 + 0,2 em ponto flutuante pode dar 0,7999… e perder o alerta de 80%
  const ratio = (realizedCents + plannedCents) / limitCents
  return { realizedRatio, plannedRatio, ratio, level: usageLevel(ratio) }
}

export type BudgetLine = {
  categoryId: string
  name: string
  color: string
  icon: string
  limitCents: number | null
  spending: Spending
  progress: BudgetProgress | null
}

const spent = (line: BudgetLine) => line.spending.realizedCents + line.spending.plannedCents

/** Com limite primeiro (da mais perto do limite para a mais longe); sem limite depois, por gasto. */
export function sortBudgetLines(lines: BudgetLine[]): BudgetLine[] {
  return [...lines].sort((a, b) => {
    if (a.progress && b.progress) return b.progress.ratio - a.progress.ratio || a.name.localeCompare(b.name, 'pt-BR')
    if (a.progress) return -1
    if (b.progress) return 1
    return spent(b) - spent(a) || a.name.localeCompare(b.name, 'pt-BR')
  })
}

type BudgetCategory = { id: string; name: string; kind: 'income' | 'expense'; parentId: string | null; archived: boolean; color: string; icon: string }

/** Uma linha por categoria de despesa de primeiro nível ativa, já ordenada. */
export function buildBudgetLines(
  categories: BudgetCategory[],
  rows: BudgetRow[],
  spending: Map<string, Spending>,
  month: string,
): BudgetLine[] {
  const lines = categories
    .filter((category) => category.kind === 'expense' && category.parentId === null && !category.archived)
    .map((category) => {
      const limitCents = effectiveBudget(rows, category.id, month)
      const categorySpent = spending.get(category.id) ?? { realizedCents: 0, plannedCents: 0 }
      return {
        categoryId: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        limitCents,
        spending: categorySpent,
        progress: limitCents === null ? null : budgetProgress(limitCents, categorySpent.realizedCents, categorySpent.plannedCents),
      }
    })
  return sortBudgetLines(lines)
}

/** Resumo do topo: total orçado (só linhas com limite), realizado e previsto (todas as linhas). */
export function budgetTotals(lines: BudgetLine[]): { budgetedCents: number; realizedCents: number; plannedCents: number } {
  return lines.reduce(
    (sum, line) => ({
      budgetedCents: sum.budgetedCents + (line.limitCents ?? 0),
      realizedCents: sum.realizedCents + line.spending.realizedCents,
      plannedCents: sum.plannedCents + line.spending.plannedCents,
    }),
    { budgetedCents: 0, realizedCents: 0, plannedCents: 0 },
  )
}
```

- [ ] **Step 4: Rode os testes e veja passar**

Run: `npx vitest run lib/finance/budget.test.ts lib/finance/card.test.ts`
Expected: PASS. Depois rode `npm test` para garantir que nada da Fase 3 quebrou (a assinatura de `cardUsage` só ganhou um parâmetro opcional).

- [ ] **Step 5: Commit**

```bash
git add lib/finance/budget.ts lib/finance/budget.test.ts lib/finance/card.ts lib/finance/card.test.ts
git commit -m "feat(finance): orçamento por categoria com realizado e previsto; recorrências futuras fora do limite do cartão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Migration de recorrências e orçamento, argumentos dos RPCs e testes de RLS

**Files:**
- Create: `supabase/migrations/20261005120000_recorrencia_orcamento.sql`
- Create: `lib/recurrence-rpc.ts`, `lib/recurrence-rpc.test.ts`
- Create: `tests/rls/recurrences.rls.test.ts`
- Modify: `lib/supabase/errors.ts`, `lib/supabase/errors.test.ts`, `lib/supabase/database.types.ts` (gerado)

**Interfaces:**
- Consumes: Tasks 1–3 (`Series`, `SeriesFields`, `Occurrence`, `SeriesChange`, `createSeries`, `changeFollowing`, `removeFollowing`, `buildOccurrences`, `occurrenceDates`, `BudgetChange`, `budgetChange`); `cycleColumns` (`lib/card-rpc.ts`); RPC `ensure_invoice` (Fase 3).
- Produces:
  - Tabelas `recurrences` e `budgets`; colunas `transactions.recurrence_id` e `transactions.occurrence_date`; índice único parcial `(recurrence_id, occurrence_date)`.
  - RPCs: `create_recurrence(p_recurrence jsonb, p_rows jsonb) → uuid`, `generate_recurrence_occurrences(p_recurrence_id uuid, p_rows jsonb, p_generated_until date) → void`, `apply_recurrence_change(p_recurrence_id uuid, p_patch jsonb, p_delete_ids uuid[], p_rows jsonb, p_generated_until date) → void`, `restore_recurrence(p_recurrence jsonb, p_rows jsonb) → void`, `apply_budget_change(p_category_id uuid, p_upserts jsonb, p_delete_months date[]) → void`; `restore_transactions` recriado com as colunas de série; função interna `insert_recurrence_rows(p_recurrence_id uuid, p_rows jsonb)`.
  - `lib/recurrence-rpc.ts`: `seriesColumns(series)`, `occurrenceRows(fields, occurrences)`, `createRecurrenceArgs(householdId, series, created)`, `generateArgs(recurrenceId, series, occurrences, generatedUntil)`, `changeArgs(recurrenceId, change)`, `budgetChangeArgs(categoryId, change)`.
  - `lib/supabase/errors.ts`: mensagens de `INVALID_RECURRENCE` e `INVALID_BUDGET_CATEGORY`; `export const ARCHIVE_BLOCKED = { account, card, category }`.

- [ ] **Step 1: Argumentos dos RPCs — teste que falha**

Crie `lib/recurrence-rpc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { budgetChange } from './finance/budget'
import { createSeries, type Series } from './finance/recurrence'
import { budgetChangeArgs, changeArgs, createRecurrenceArgs, generateArgs } from './recurrence-rpc'

const TODAY = '2026-10-05'
const STREAMING: Series = {
  type: 'expense',
  description: 'Streaming',
  amountCents: 5_590,
  categoryId: 'cat',
  accountId: null,
  destinationAccountId: null,
  creditCardId: 'card',
  notes: null,
  frequency: 'monthly',
  startDate: '2026-10-02',
  endDate: null,
}

describe('createRecurrenceArgs', () => {
  it('leva a série com generated_until e as linhas com o ciclo da fatura no cartão', () => {
    const created = createSeries(STREAMING, 'pending', { schedule: { closingDay: 3, dueDay: 10 }, stored: [] }, TODAY)
    const args = createRecurrenceArgs('house', STREAMING, created)
    expect(args.p_recurrence).toEqual({
      household_id: 'house',
      type: 'expense',
      description: 'Streaming',
      amount_cents: 5_590,
      category_id: 'cat',
      account_id: null,
      destination_account_id: null,
      credit_card_id: 'card',
      frequency: 'monthly',
      start_date: '2026-10-02',
      end_date: null,
      notes: null,
      generated_until: '2027-10-05',
    })
    // 02/10/2026 até 02/10/2027 (o horizonte é 05/10/2027)
    expect(args.p_rows).toHaveLength(13)
    expect(args.p_rows[0]).toEqual({
      type: 'expense',
      description: 'Streaming',
      amount_cents: 5_590,
      date: '2026-10-02',
      occurrence_date: '2026-10-02',
      status: 'paid',
      category_id: 'cat',
      account_id: null,
      destination_account_id: null,
      credit_card_id: 'card',
      notes: null,
      closing_month: '2026-10-01',
      closing_date: '2026-10-03',
      due_date: '2026-10-10',
      reference_month: '2026-10-01',
    })
  })
})

describe('changeArgs e generateArgs', () => {
  it('a linha regravada leva o id; em conta não há colunas de fatura', () => {
    const series: Series = { ...STREAMING, accountId: 'acc', creditCardId: null }
    const args = changeArgs('rec', {
      series,
      deleteIds: ['a', 'b'],
      occurrences: [{ id: 'a', date: '2026-10-10', occurrenceDate: '2026-10-02', status: 'paid', cycle: null }],
      generatedUntil: '2027-10-05',
    })
    expect(args.p_recurrence_id).toBe('rec')
    expect(args.p_delete_ids).toEqual(['a', 'b'])
    expect(args.p_patch).toMatchObject({ account_id: 'acc', credit_card_id: null, end_date: null })
    expect(args.p_rows[0]).toMatchObject({ id: 'a', date: '2026-10-10', occurrence_date: '2026-10-02', account_id: 'acc' })
    expect(args.p_rows[0]).not.toHaveProperty('closing_month')
    expect(args.p_generated_until).toBe('2027-10-05')
  })

  it('generateArgs não leva id nas linhas', () => {
    const args = generateArgs('rec', STREAMING, [{ date: '2026-11-02', occurrenceDate: '2026-11-02', status: 'pending', cycle: null }], '2027-10-05')
    expect(args.p_rows[0]).not.toHaveProperty('id')
    expect(args).toMatchObject({ p_recurrence_id: 'rec', p_generated_until: '2027-10-05' })
  })
})

describe('budgetChangeArgs', () => {
  it('converte upserts e meses a apagar', () => {
    const change = budgetChange([{ categoryId: 'cat', month: '2026-10-01', amountCents: 150_000, repeats: true }], 'cat', '2026-10-01', 180_000, 'only')
    expect(budgetChangeArgs('cat', change)).toEqual({
      p_category_id: 'cat',
      p_upserts: [
        { month: '2026-10-01', amount_cents: 180_000, repeats: false },
        { month: '2026-11-01', amount_cents: 150_000, repeats: true },
      ],
      p_delete_months: [],
    })
  })
})
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npx vitest run lib/recurrence-rpc.test.ts`
Expected: FAIL — `Failed to resolve import "./recurrence-rpc"`.

- [ ] **Step 3: Implemente `lib/recurrence-rpc.ts`**

```ts
import { cycleColumns } from './card-rpc'
import type { BudgetChange } from './finance/budget'
import type { Occurrence, Series, SeriesChange, SeriesFields } from './finance/recurrence'

/** Campos da série nas colunas de recurrences (sem household_id e generated_until). */
export function seriesColumns(series: Series) {
  return {
    type: series.type,
    description: series.description,
    amount_cents: series.amountCents,
    category_id: series.categoryId,
    account_id: series.accountId,
    destination_account_id: series.destinationAccountId,
    credit_card_id: series.creditCardId,
    frequency: series.frequency,
    start_date: series.startDate,
    end_date: series.endDate,
    notes: series.notes,
  }
}

/** Linhas para os RPCs de série: campos da série, datas, status e, no cartão, o ciclo da fatura. `id` só na linha regravada. */
export function occurrenceRows(fields: SeriesFields, occurrences: Occurrence[]) {
  return occurrences.map((occurrence) => ({
    ...(occurrence.id ? { id: occurrence.id } : {}),
    type: fields.type,
    description: fields.description,
    amount_cents: fields.amountCents,
    date: occurrence.date,
    occurrence_date: occurrence.occurrenceDate,
    status: occurrence.status,
    category_id: fields.categoryId,
    account_id: fields.accountId,
    destination_account_id: fields.destinationAccountId,
    credit_card_id: fields.creditCardId,
    notes: fields.notes,
    ...(occurrence.cycle ? cycleColumns(occurrence.cycle) : {}),
  }))
}

export function createRecurrenceArgs(householdId: string, series: Series, created: { occurrences: Occurrence[]; generatedUntil: string }) {
  return {
    p_recurrence: { household_id: householdId, ...seriesColumns(series), generated_until: created.generatedUntil },
    p_rows: occurrenceRows(series, created.occurrences),
  }
}

export function generateArgs(recurrenceId: string, series: Series, occurrences: Occurrence[], generatedUntil: string) {
  return { p_recurrence_id: recurrenceId, p_rows: occurrenceRows(series, occurrences), p_generated_until: generatedUntil }
}

/** Estado completo da série (apply_recurrence_change substitui todos os campos). */
export function changeArgs(recurrenceId: string, change: SeriesChange) {
  return {
    p_recurrence_id: recurrenceId,
    p_patch: seriesColumns(change.series),
    p_delete_ids: change.deleteIds,
    p_rows: occurrenceRows(change.series, change.occurrences),
    p_generated_until: change.generatedUntil,
  }
}

export function budgetChangeArgs(categoryId: string, change: BudgetChange) {
  return {
    p_category_id: categoryId,
    p_upserts: change.upserts.map((upsert) => ({ month: upsert.month, amount_cents: upsert.amountCents, repeats: upsert.repeats })),
    p_delete_months: change.deleteMonths,
  }
}
```

Run: `npx vitest run lib/recurrence-rpc.test.ts`
Expected: PASS.

- [ ] **Step 4: Mensagens de erro — teste e implementação**

Em `lib/supabase/errors.test.ts`, acrescente:

```ts
it('traduz os erros de recorrência e orçamento', () => {
  expect(translateError({ message: 'INVALID_RECURRENCE' })).toBe('Recorrência inválida.')
  expect(translateError({ message: 'INVALID_BUDGET_CATEGORY' })).toBe('Orçamento só vale para categorias de despesa principais.')
})
```

Em `lib/supabase/errors.ts`, acrescente ao `MESSAGES` (depois de `INVALID_INPUT`):

```ts
  INVALID_RECURRENCE: 'Recorrência inválida.',
  INVALID_BUDGET_CATEGORY: 'Orçamento só vale para categorias de despesa principais.',
```

e, depois de `CARD_IN_USE`:

```ts
/** Arquivar com recorrência ativa usando o item (spec 3.5). */
export const ARCHIVE_BLOCKED = {
  account: 'Encerre as recorrências que usam esta conta antes de arquivar.',
  card: 'Encerre as recorrências que usam este cartão antes de arquivar.',
  category: 'Encerre as recorrências que usam esta categoria antes de arquivar.',
} as const
```

Run: `npx vitest run lib/supabase/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Escreva a migration**

Crie `supabase/migrations/20261005120000_recorrencia_orcamento.sql`:

```sql
-- Fase 4 — Recorrência e orçamento.

-- =====================================================================
-- Recorrências (o modelo da série)
-- =====================================================================

create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  -- NO ACTION (padrão): 23503 ao excluir conta/cartão/categoria usados por uma série
  category_id uuid references public.categories (id),
  account_id uuid references public.accounts (id),
  destination_account_id uuid references public.accounts (id),
  credit_card_id uuid references public.credit_cards (id),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  start_date date not null,
  end_date date,
  generated_until date not null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrences_dates check (end_date is null or end_date >= start_date),
  constraint recurrences_shape check (
    (
      type in ('income', 'expense')
      and category_id is not null
      and destination_account_id is null
      and (
        (account_id is not null and credit_card_id is null)
        or (account_id is null and credit_card_id is not null and type = 'expense')
      )
    )
    or (
      type = 'transfer'
      and category_id is null
      and credit_card_id is null
      and account_id is not null
      and destination_account_id is not null
      and destination_account_id <> account_id
    )
  )
);

create index recurrences_household_id_idx on public.recurrences (household_id);
create index recurrences_account_id_idx on public.recurrences (account_id);
create index recurrences_destination_account_id_idx on public.recurrences (destination_account_id);
create index recurrences_credit_card_id_idx on public.recurrences (credit_card_id);
create index recurrences_category_id_idx on public.recurrences (category_id);

create trigger recurrences_set_updated_at
  before update on public.recurrences
  for each row execute function public.set_updated_at();

create or replace function public.recurrences_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_household_id uuid;
begin
  if new.account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;

  if new.destination_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.destination_account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;

  if new.credit_card_id is not null and not exists (
    select 1 from public.credit_cards c where c.id = new.credit_card_id and c.household_id = new.household_id
  ) then
    raise exception 'INVALID_CARD';
  end if;

  if new.category_id is not null then
    select c.kind, c.household_id into v_kind, v_household_id
    from public.categories c
    where c.id = new.category_id;

    if not found or v_household_id <> new.household_id then
      raise exception 'INVALID_CATEGORY';
    end if;
    if v_kind <> new.type then
      raise exception 'CATEGORY_KIND_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

create trigger recurrences_check_refs
  before insert or update on public.recurrences
  for each row execute function public.recurrences_check_refs();

-- =====================================================================
-- Lançamentos: ligação com a série
-- =====================================================================

alter table public.transactions
  add column recurrence_id uuid references public.recurrences (id) on delete set null,
  add column occurrence_date date;

alter table public.transactions add constraint transactions_recurrence_shape check (
  recurrence_id is null
  or (occurrence_date is not null and installment_plan_id is null and type <> 'invoice_payment')
);

create index transactions_recurrence_id_idx on public.transactions (recurrence_id);
-- Duas sessões gerando a mesma janela não duplicam ocorrências
create unique index transactions_recurrence_occurrence_idx
  on public.transactions (recurrence_id, occurrence_date)
  where recurrence_id is not null;

create or replace function public.transactions_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_household_id uuid;
  v_count smallint;
begin
  if new.account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;

  if new.destination_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.destination_account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;

  if new.credit_card_id is not null and not exists (
    select 1 from public.credit_cards c where c.id = new.credit_card_id and c.household_id = new.household_id
  ) then
    raise exception 'INVALID_CARD';
  end if;

  if new.invoice_id is not null and not exists (
    select 1 from public.card_invoices i
    where i.id = new.invoice_id and i.household_id = new.household_id and i.credit_card_id = new.credit_card_id
  ) then
    raise exception 'INVALID_INVOICE';
  end if;

  if new.installment_plan_id is not null then
    select p.installments_count into v_count
    from public.installment_plans p
    where p.id = new.installment_plan_id and p.household_id = new.household_id and p.credit_card_id = new.credit_card_id;
    if not found or new.installment_number is null or new.installment_number not between 1 and v_count then
      raise exception 'INVALID_PLAN';
    end if;
  end if;

  if new.recurrence_id is not null and not exists (
    select 1 from public.recurrences r where r.id = new.recurrence_id and r.household_id = new.household_id
  ) then
    raise exception 'INVALID_RECURRENCE';
  end if;

  if new.category_id is not null then
    select c.kind, c.household_id into v_kind, v_household_id
    from public.categories c
    where c.id = new.category_id;

    if not found or v_household_id <> new.household_id then
      raise exception 'INVALID_CATEGORY';
    end if;
    if v_kind <> new.type then
      raise exception 'CATEGORY_KIND_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

-- =====================================================================
-- Orçamento — limite efetivo calculado no app (lib/finance/budget.ts)
-- =====================================================================

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents >= 0),
  repeats boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_category_month unique (category_id, month)
);

create index budgets_household_id_idx on public.budgets (household_id);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

create or replace function public.budgets_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.categories c
    where c.id = new.category_id
      and c.household_id = new.household_id
      and c.kind = 'expense'
      and c.parent_id is null
  ) then
    raise exception 'INVALID_BUDGET_CATEGORY';
  end if;
  return new;
end;
$$;

create trigger budgets_check_refs
  before insert or update on public.budgets
  for each row execute function public.budgets_check_refs();

-- =====================================================================
-- RPCs (security invoker: o RLS vale para quem chama)
-- =====================================================================

-- Grava ocorrências de uma série. Linha com "id" é um lançamento regravado (sem on conflict: conflito desfaz tudo);
-- sem "id", ocorrência nova que já exista é ignorada.
create or replace function public.insert_recurrence_rows(p_recurrence_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_row jsonb;
  v_card_id uuid;
  v_invoice_id uuid;
begin
  select r.household_id into v_household_id from public.recurrences r where r.id = p_recurrence_id;
  if not found then
    raise exception 'INVALID_RECURRENCE';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_card_id := (v_row ->> 'credit_card_id')::uuid;
    v_invoice_id := null;
    if v_card_id is not null then
      v_invoice_id := public.ensure_invoice(
        v_card_id,
        (v_row ->> 'closing_month')::date,
        (v_row ->> 'closing_date')::date,
        (v_row ->> 'due_date')::date,
        (v_row ->> 'reference_month')::date
      );
    end if;

    if v_row ? 'id' then
      insert into public.transactions (
        id, household_id, type, description, amount_cents, date, status, category_id, account_id,
        destination_account_id, credit_card_id, invoice_id, recurrence_id, occurrence_date, source, notes
      )
      values (
        (v_row ->> 'id')::uuid,
        v_household_id,
        v_row ->> 'type',
        v_row ->> 'description',
        (v_row ->> 'amount_cents')::bigint,
        (v_row ->> 'date')::date,
        v_row ->> 'status',
        (v_row ->> 'category_id')::uuid,
        (v_row ->> 'account_id')::uuid,
        (v_row ->> 'destination_account_id')::uuid,
        v_card_id,
        v_invoice_id,
        p_recurrence_id,
        (v_row ->> 'occurrence_date')::date,
        'recurrence',
        v_row ->> 'notes'
      );
    else
      insert into public.transactions (
        household_id, type, description, amount_cents, date, status, category_id, account_id,
        destination_account_id, credit_card_id, invoice_id, recurrence_id, occurrence_date, source, notes
      )
      values (
        v_household_id,
        v_row ->> 'type',
        v_row ->> 'description',
        (v_row ->> 'amount_cents')::bigint,
        (v_row ->> 'date')::date,
        v_row ->> 'status',
        (v_row ->> 'category_id')::uuid,
        (v_row ->> 'account_id')::uuid,
        (v_row ->> 'destination_account_id')::uuid,
        v_card_id,
        v_invoice_id,
        p_recurrence_id,
        (v_row ->> 'occurrence_date')::date,
        'recurrence',
        v_row ->> 'notes'
      )
      on conflict (recurrence_id, occurrence_date) where recurrence_id is not null do nothing;
    end if;
  end loop;
end;
$$;

-- Série nova: modelo + ocorrências numa transação só
create or replace function public.create_recurrence(p_recurrence jsonb, p_rows jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.recurrences (
    household_id, type, description, amount_cents, category_id, account_id, destination_account_id,
    credit_card_id, frequency, start_date, end_date, generated_until, notes
  )
  values (
    (p_recurrence ->> 'household_id')::uuid,
    p_recurrence ->> 'type',
    p_recurrence ->> 'description',
    (p_recurrence ->> 'amount_cents')::bigint,
    (p_recurrence ->> 'category_id')::uuid,
    (p_recurrence ->> 'account_id')::uuid,
    (p_recurrence ->> 'destination_account_id')::uuid,
    (p_recurrence ->> 'credit_card_id')::uuid,
    p_recurrence ->> 'frequency',
    (p_recurrence ->> 'start_date')::date,
    (p_recurrence ->> 'end_date')::date,
    (p_recurrence ->> 'generated_until')::date,
    p_recurrence ->> 'notes'
  )
  returning id into v_id;

  perform public.insert_recurrence_rows(v_id, p_rows);
  return v_id;
end;
$$;

-- Geração ao abrir o app: idempotente (on conflict) e generated_until nunca volta
create or replace function public.generate_recurrence_occurrences(p_recurrence_id uuid, p_rows jsonb, p_generated_until date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.insert_recurrence_rows(p_recurrence_id, coalesce(p_rows, '[]'::jsonb));
  update public.recurrences r
  set generated_until = greatest(r.generated_until, p_generated_until)
  where r.id = p_recurrence_id;
end;
$$;

-- "Este e os próximos", tela Recorrências e encerrar (calculado em lib/finance/recurrence.ts).
-- p_patch traz o estado completo da série; end_date < start_date apaga a série.
create or replace function public.apply_recurrence_change(
  p_recurrence_id uuid,
  p_patch jsonb,
  p_delete_ids uuid[],
  p_rows jsonb,
  p_generated_until date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start date := (p_patch ->> 'start_date')::date;
  v_end date := (p_patch ->> 'end_date')::date;
begin
  if not exists (select 1 from public.recurrences r where r.id = p_recurrence_id) then
    raise exception 'INVALID_RECURRENCE';
  end if;

  delete from public.transactions t
  where t.recurrence_id = p_recurrence_id and t.id = any (coalesce(p_delete_ids, '{}'::uuid[]));

  if v_end is not null and v_end < v_start then
    -- Os lançamentos que ficaram (pagos) continuam, sem série (on delete set null)
    delete from public.recurrences r where r.id = p_recurrence_id;
    return;
  end if;

  update public.recurrences r
  set
    type = p_patch ->> 'type',
    description = p_patch ->> 'description',
    amount_cents = (p_patch ->> 'amount_cents')::bigint,
    category_id = (p_patch ->> 'category_id')::uuid,
    account_id = (p_patch ->> 'account_id')::uuid,
    destination_account_id = (p_patch ->> 'destination_account_id')::uuid,
    credit_card_id = (p_patch ->> 'credit_card_id')::uuid,
    frequency = p_patch ->> 'frequency',
    start_date = v_start,
    end_date = v_end,
    notes = p_patch ->> 'notes',
    generated_until = p_generated_until
  where r.id = p_recurrence_id;

  perform public.insert_recurrence_rows(p_recurrence_id, coalesce(p_rows, '[]'::jsonb));
end;
$$;

-- "Desfazer" de "excluir este e os próximos": recria ou restaura a série e as linhas com os mesmos ids
create or replace function public.restore_recurrence(p_recurrence jsonb, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.recurrences (
    id, household_id, type, description, amount_cents, category_id, account_id, destination_account_id,
    credit_card_id, frequency, start_date, end_date, generated_until, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.category_id, r.account_id, r.destination_account_id,
    r.credit_card_id, r.frequency, r.start_date, r.end_date, r.generated_until, r.notes
  from jsonb_populate_record(null::public.recurrences, p_recurrence) r
  on conflict (id) do update set
    type = excluded.type,
    description = excluded.description,
    amount_cents = excluded.amount_cents,
    category_id = excluded.category_id,
    account_id = excluded.account_id,
    destination_account_id = excluded.destination_account_id,
    credit_card_id = excluded.credit_card_id,
    frequency = excluded.frequency,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    generated_until = excluded.generated_until,
    notes = excluded.notes;

  insert into public.transactions (
    id, household_id, type, description, amount_cents, date, status, category_id, account_id,
    destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number,
    recurrence_id, occurrence_date, source, external_id, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.date, r.status, r.category_id, r.account_id,
    r.destination_account_id, r.credit_card_id, r.invoice_id, r.installment_plan_id, r.installment_number,
    r.recurrence_id, r.occurrence_date, coalesce(r.source, 'recurrence'), r.external_id, r.notes
  from jsonb_populate_recordset(null::public.transactions, coalesce(p_rows, '[]'::jsonb)) r;
end;
$$;

-- "Desfazer" de qualquer exclusão (Fase 3), agora também com a ligação à série
create or replace function public.restore_transactions(p_plan jsonb, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVALID_INPUT';
  end if;

  if p_plan is not null and jsonb_typeof(p_plan) = 'object' then
    insert into public.installment_plans (
      id, household_id, credit_card_id, category_id, description, total_amount_cents,
      installments_count, first_installment_number, purchase_date, first_closing_month
    )
    select
      r.id, r.household_id, r.credit_card_id, r.category_id, r.description, r.total_amount_cents,
      r.installments_count, r.first_installment_number, r.purchase_date, r.first_closing_month
    from jsonb_populate_record(null::public.installment_plans, p_plan) r;
  end if;

  insert into public.transactions (
    id, household_id, type, description, amount_cents, date, status, category_id, account_id,
    destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number,
    recurrence_id, occurrence_date, source, external_id, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.date, r.status, r.category_id, r.account_id,
    r.destination_account_id, r.credit_card_id, r.invoice_id, r.installment_plan_id, r.installment_number,
    r.recurrence_id, r.occurrence_date, coalesce(r.source, 'manual'), r.external_id, r.notes
  from jsonb_populate_recordset(null::public.transactions, p_rows) r;
end;
$$;

-- Orçamento: upserts e meses a apagar numa transação (calculado por budgetChange)
create or replace function public.apply_budget_change(p_category_id uuid, p_upserts jsonb, p_delete_months date[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select c.household_id into v_household_id from public.categories c where c.id = p_category_id;
  if not found then
    raise exception 'INVALID_BUDGET_CATEGORY';
  end if;

  delete from public.budgets b
  where b.category_id = p_category_id and b.month = any (coalesce(p_delete_months, '{}'::date[]));

  insert into public.budgets (household_id, category_id, month, amount_cents, repeats)
  select
    v_household_id,
    p_category_id,
    (x.value ->> 'month')::date,
    (x.value ->> 'amount_cents')::bigint,
    (x.value ->> 'repeats')::boolean
  from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) as x
  on conflict (category_id, month) do update set amount_cents = excluded.amount_cents, repeats = excluded.repeats;
end;
$$;

-- =====================================================================
-- Permissões e RLS
-- =====================================================================

revoke all on function public.recurrences_check_refs() from public, anon, authenticated;
revoke all on function public.budgets_check_refs() from public, anon, authenticated;

revoke all on function public.insert_recurrence_rows(uuid, jsonb) from public, anon;
revoke all on function public.create_recurrence(jsonb, jsonb) from public, anon;
revoke all on function public.generate_recurrence_occurrences(uuid, jsonb, date) from public, anon;
revoke all on function public.apply_recurrence_change(uuid, jsonb, uuid[], jsonb, date) from public, anon;
revoke all on function public.restore_recurrence(jsonb, jsonb) from public, anon;
revoke all on function public.apply_budget_change(uuid, jsonb, date[]) from public, anon;
-- insert_recurrence_rows é interna, mas os RPCs são invoker: quem chama precisa de execute
grant execute on function public.insert_recurrence_rows(uuid, jsonb) to authenticated;
grant execute on function public.create_recurrence(jsonb, jsonb) to authenticated;
grant execute on function public.generate_recurrence_occurrences(uuid, jsonb, date) to authenticated;
grant execute on function public.apply_recurrence_change(uuid, jsonb, uuid[], jsonb, date) to authenticated;
grant execute on function public.restore_recurrence(jsonb, jsonb) to authenticated;
grant execute on function public.apply_budget_change(uuid, jsonb, date[]) to authenticated;

revoke all on public.recurrences, public.budgets from anon;
revoke truncate, references, trigger on public.recurrences, public.budgets from authenticated;

alter table public.recurrences enable row level security;
alter table public.budgets enable row level security;

create policy recurrences_all on public.recurrences
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy budgets_all on public.budgets
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
```

- [ ] **Step 6: Aplique a migration e regenere os tipos**

Run: `npm run db:push`
Expected: a migration `20261005120000_recorrencia_orcamento.sql` aplicada sem erro.

Run: `npm run db:types && grep -c "recurrences\|budgets\|create_recurrence\|apply_budget_change\|occurrence_date" lib/supabase/database.types.ts`
Expected: um número maior que 0.

Run: `npx tsc --noEmit`
Expected: sem erros (os tipos novos não quebram o código existente).

- [ ] **Step 7: Testes de RLS e dos RPCs**

Crie `tests/rls/recurrences.rls.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { budgetChange, type BudgetRow } from '@/lib/finance/budget'
import {
  buildOccurrences,
  changeFollowing,
  createSeries,
  occurrenceDates,
  removeFollowing,
  type Series,
  type SeriesTransaction,
} from '@/lib/finance/recurrence'
import { budgetChangeArgs, changeArgs, createRecurrenceArgs, generateArgs } from '@/lib/recurrence-rpc'
import { createTestContext, type TestUser } from './helpers'

const ctx = createTestContext()
const TODAY = '2026-10-05'
const RECORD_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, recurrence_id, occurrence_date, source, external_id, notes'
const RECURRENCE_COLUMNS =
  'id, type, description, amount_cents, category_id, account_id, destination_account_id, credit_card_id, frequency, start_date, end_date, generated_until, notes'

type SeriesRow = { id: string; occurrence_date: string; type: 'expense'; status: 'paid' | 'pending'; date: string; account_id: string | null }

const toSeriesTransaction = (row: SeriesRow): SeriesTransaction => ({
  id: row.id,
  occurrenceDate: row.occurrence_date,
  type: row.type,
  status: row.status,
  date: row.date,
  accountId: row.account_id,
})

describe('recorrências e orçamento', () => {
  let a: TestUser
  let b: TestUser
  let houseA: string
  let houseB: string
  let accA: string
  let accB: string
  let mercadoA: string
  let salarioA: string
  let feiraA: string
  let mercadoB: string
  let cardA: string

  async function insertAccount(user: TestUser, householdId: string, name: string): Promise<string> {
    const { data, error } = await user.client
      .from('accounts')
      .insert({
        household_id: householdId,
        name,
        type: 'checking',
        initial_balance_cents: 0,
        initial_balance_date: '2026-01-01',
        color: '#3b82f6',
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  }

  async function categoryId(user: TestUser, householdId: string, name: string, kind: 'income' | 'expense'): Promise<string> {
    const { data, error } = await user.client
      .from('categories')
      .select('id')
      .eq('household_id', householdId)
      .eq('name', name)
      .eq('kind', kind)
      .is('parent_id', null)
      .single()
    if (error) throw error
    return data.id as string
  }

  function rent(overrides: Partial<Series> = {}): Series {
    return {
      type: 'expense',
      description: 'Aluguel',
      amountCents: 200_000,
      categoryId: mercadoA,
      accountId: accA,
      destinationAccountId: null,
      creditCardId: null,
      notes: null,
      frequency: 'monthly',
      startDate: '2026-10-10',
      endDate: null,
      ...overrides,
    }
  }

  async function createRent(series: Series = rent()): Promise<string> {
    const { data, error } = await a.client.rpc('create_recurrence', createRecurrenceArgs(houseA, series, createSeries(series, 'paid', null, TODAY)))
    if (error) throw error
    return data as string
  }

  async function countRows(recurrenceId: string): Promise<number> {
    const { count, error } = await a.client.from('transactions').select('id', { count: 'exact', head: true }).eq('recurrence_id', recurrenceId)
    if (error) throw error
    return count ?? 0
  }

  async function seriesTransactions(recurrenceId: string): Promise<SeriesTransaction[]> {
    const { data, error } = await a.client
      .from('transactions')
      .select('id, occurrence_date, type, status, date, account_id')
      .eq('recurrence_id', recurrenceId)
    if (error) throw error
    return (data as SeriesRow[]).map(toSeriesTransaction)
  }

  beforeAll(async () => {
    ;[a, b] = await Promise.all([ctx.newUser('rec-a'), ctx.newUser('rec-b')])
    houseA = await ctx.createHousehold(a, 'Casa Recorrência A')
    houseB = await ctx.createHousehold(b, 'Casa Recorrência B')
    mercadoA = await categoryId(a, houseA, 'Mercado', 'expense')
    salarioA = await categoryId(a, houseA, 'Salário', 'income')
    mercadoB = await categoryId(b, houseB, 'Mercado', 'expense')
    const { data: feira, error } = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'Feira', kind: 'expense', parent_id: mercadoA, icon: 'shopping-cart', color: '#22c55e' })
      .select('id')
      .single()
    if (error) throw error
    feiraA = feira.id as string
    accA = await insertAccount(a, houseA, 'Conta A')
    accB = await insertAccount(b, houseB, 'Conta B')
    const { data: card, error: cardError } = await a.client
      .from('credit_cards')
      .insert({ household_id: houseA, name: 'Cartão A', brand: 'visa', limit_cents: 500_000, closing_day: 3, due_day: 10, color: '#3b82f6' })
      .select('id')
      .single()
    if (cardError) throw cardError
    cardA = card.id as string
  })

  afterAll(() => ctx.cleanup())

  it('create_recurrence grava a série e as ocorrências; gerar a mesma janela de novo não duplica', async () => {
    const series = rent()
    const id = await createRent(series)
    expect(await countRows(id)).toBe(12)

    const { data: recurrence } = await a.client.from('recurrences').select('generated_until').eq('id', id).single()
    expect(recurrence!.generated_until).toBe('2027-10-05')
    const { data: first } = await a.client
      .from('transactions')
      .select('status, source, occurrence_date')
      .eq('recurrence_id', id)
      .eq('occurrence_date', '2026-10-10')
      .single()
    expect(first).toEqual({ status: 'paid', source: 'recurrence', occurrence_date: '2026-10-10' })

    // Duas sessões gerando a mesma janela
    const occurrences = buildOccurrences(occurrenceDates(series, '2026-11-01', '2027-10-05'), null, TODAY)
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await a.client.rpc('generate_recurrence_occurrences', generateArgs(id, series, occurrences, '2027-10-05'))
      expect(error).toBeNull()
    }
    expect(await countRows(id)).toBe(12)
  })

  it('no cartão cada ocorrência vai para a fatura da regra 8.2', async () => {
    const series = rent({ description: 'Streaming', amountCents: 5_590, accountId: null, creditCardId: cardA, startDate: '2026-10-02' })
    const card = { schedule: { closingDay: 3, dueDay: 10 }, stored: [] }
    const { data: id, error } = await a.client.rpc('create_recurrence', createRecurrenceArgs(houseA, series, createSeries(series, 'pending', card, TODAY)))
    expect(error).toBeNull()
    const { data: rows } = await a.client
      .from('transactions')
      .select('date, card_invoices(closing_month)')
      .eq('recurrence_id', id)
      .order('date')
      .limit(2)
    const pairs = (rows as unknown as { date: string; card_invoices: { closing_month: string } }[]).map((row) => [
      row.date,
      row.card_invoices.closing_month,
    ])
    expect(pairs).toEqual([
      ['2026-10-02', '2026-10-01'],
      ['2026-11-02', '2026-11-01'],
    ])
  })

  it('outra casa não lê nem usa os RPCs com a série, a categoria ou a casa de A', async () => {
    const id = await createRent(rent({ description: 'Isolada' }))
    expect((await b.client.from('recurrences').select('id').eq('id', id)).data).toEqual([])
    expect((await b.client.from('transactions').select('id').eq('recurrence_id', id)).data).toEqual([])

    const generate = await b.client.rpc('generate_recurrence_occurrences', { p_recurrence_id: id, p_rows: [], p_generated_until: '2030-01-01' })
    expect(generate.error?.message).toBe('INVALID_RECURRENCE')
    const change = await b.client.rpc('apply_recurrence_change', {
      p_recurrence_id: id,
      p_patch: {},
      p_delete_ids: [],
      p_rows: [],
      p_generated_until: '2030-01-01',
    })
    expect(change.error?.message).toBe('INVALID_RECURRENCE')
    const budget = await b.client.rpc('apply_budget_change', budgetChangeArgs(mercadoA, budgetChange([], mercadoA, '2026-10-01', 100, 'from')))
    expect(budget.error?.message).toBe('INVALID_BUDGET_CATEGORY')
    const foreign = await b.client.rpc('create_recurrence', createRecurrenceArgs(houseA, rent(), createSeries(rent(), 'paid', null, TODAY)))
    expect(foreign.error).not.toBeNull()

    await a.client.rpc('apply_budget_change', budgetChangeArgs(mercadoA, budgetChange([], mercadoA, '2026-10-01', 100, 'from')))
    expect((await b.client.from('budgets').select('id').eq('household_id', houseA)).data).toEqual([])
  })

  it('os triggers recusam referências de outra casa e categorias erradas', async () => {
    const base = {
      household_id: houseA,
      type: 'expense',
      description: 'Teste',
      amount_cents: 100,
      frequency: 'monthly',
      start_date: '2026-10-10',
      generated_until: '2026-10-10',
    }
    expect((await a.client.from('recurrences').insert({ ...base, category_id: mercadoA, account_id: accB })).error?.message).toBe(
      'INVALID_ACCOUNT',
    )
    expect((await a.client.from('recurrences').insert({ ...base, category_id: salarioA, account_id: accA })).error?.message).toBe(
      'CATEGORY_KIND_MISMATCH',
    )

    const budget = (categoryIdValue: string) =>
      a.client.from('budgets').insert({ household_id: houseA, category_id: categoryIdValue, month: '2026-10-01', amount_cents: 100 })
    expect((await budget(feiraA)).error?.message).toBe('INVALID_BUDGET_CATEGORY')
    expect((await budget(salarioA)).error?.message).toBe('INVALID_BUDGET_CATEGORY')
    expect((await budget(mercadoB)).error?.message).toBe('INVALID_BUDGET_CATEGORY')

    // Lançamento de A ligado a uma série de B
    const seriesB: Series = { ...rent(), categoryId: mercadoB, accountId: accB }
    const { data: idB, error } = await b.client.rpc('create_recurrence', createRecurrenceArgs(houseB, seriesB, createSeries(seriesB, 'paid', null, TODAY)))
    expect(error).toBeNull()
    const linked = await a.client.from('transactions').insert({
      household_id: houseA,
      type: 'expense',
      description: 'Teste',
      amount_cents: 100,
      date: '2026-10-10',
      status: 'paid',
      category_id: mercadoA,
      account_id: accA,
      recurrence_id: idB,
      occurrence_date: '2026-10-10',
    })
    expect(linked.error?.message).toBe('INVALID_RECURRENCE')
  })

  it('constraints de formato', async () => {
    const base = {
      household_id: houseA,
      type: 'expense',
      description: 'Teste',
      amount_cents: 100,
      frequency: 'monthly',
      start_date: '2026-10-10',
      generated_until: '2026-10-10',
    }
    const shape = async (fields: Record<string, unknown>) => (await a.client.from('recurrences').insert({ ...base, ...fields })).error?.code
    expect(await shape({ category_id: mercadoA, account_id: accA, credit_card_id: cardA })).toBe('23514')
    expect(await shape({ type: 'income', category_id: salarioA, credit_card_id: cardA })).toBe('23514')
    expect(await shape({ type: 'transfer', account_id: accA, destination_account_id: accA })).toBe('23514')
    expect(await shape({ category_id: mercadoA, account_id: accA, end_date: '2026-10-01' })).toBe('23514')

    const id = await createRent(rent({ description: 'Formato' }))
    const noOccurrence = await a.client.from('transactions').insert({
      household_id: houseA,
      type: 'expense',
      description: 'Teste',
      amount_cents: 100,
      date: '2026-10-10',
      status: 'paid',
      category_id: mercadoA,
      account_id: accA,
      recurrence_id: id,
    })
    expect(noOccurrence.error?.code).toBe('23514')
  })

  it('create_recurrence é atômico: uma linha inválida não deixa série nem lançamento', async () => {
    const series = rent({ description: 'Atômico' })
    const args = createRecurrenceArgs(houseA, series, createSeries(series, 'paid', null, TODAY))
    args.p_rows[3] = { ...args.p_rows[3], category_id: salarioA }
    const { error } = await a.client.rpc('create_recurrence', args)
    expect(error?.message).toBe('CATEGORY_KIND_MISMATCH')
    expect((await a.client.from('recurrences').select('id').eq('description', 'Atômico')).data).toEqual([])
    expect((await a.client.from('transactions').select('id').eq('description', 'Atômico')).data).toEqual([])
  })

  it('apply_recurrence_change regrava o lançamento aberto, troca os pendentes e preserva os pagos', async () => {
    const series = rent({ description: 'Troca' })
    const id = await createRent(series)
    await a.client.from('transactions').update({ status: 'paid' }).eq('recurrence_id', id).eq('occurrence_date', '2026-12-10')

    const transactions = await seriesTransactions(id)
    const november = transactions.find((tx) => tx.occurrenceDate === '2026-11-10')!
    const change = changeFollowing({ id, ...series, generatedUntil: '2027-10-05' }, november, { ...series, amountCents: 250_000, date: november.date, status: 'pending' }, {
      transactions,
      today: TODAY,
      card: null,
    })
    const { error } = await a.client.rpc('apply_recurrence_change', changeArgs(id, change))
    expect(error).toBeNull()

    const { data: after } = await a.client.from('transactions').select('id, occurrence_date, amount_cents').eq('recurrence_id', id)
    const byDate = new Map((after ?? []).map((row) => [row.occurrence_date as string, row]))
    expect(after).toHaveLength(12)
    expect(byDate.get('2026-10-10')!.amount_cents).toBe(200_000)
    expect(byDate.get('2026-11-10')).toEqual({ id: november.id, occurrence_date: '2026-11-10', amount_cents: 250_000 })
    expect(byDate.get('2026-12-10')!.amount_cents).toBe(200_000)
    expect(byDate.get('2027-01-10')!.amount_cents).toBe(250_000)
    expect((await a.client.from('recurrences').select('amount_cents').eq('id', id).single()).data!.amount_cents).toBe(250_000)
  })

  it('excluir a partir da primeira apaga a série; restore_recurrence devolve tudo com os mesmos ids', async () => {
    const series = rent({ description: 'Volta' })
    const id = await createRent(series)
    const { data: record } = await a.client.from('recurrences').select(RECURRENCE_COLUMNS).eq('id', id).single()
    const { data: rows } = await a.client.from('transactions').select(RECORD_COLUMNS).eq('recurrence_id', id)
    const transactions = await seriesTransactions(id)
    const first = transactions.find((tx) => tx.occurrenceDate === '2026-10-10')!

    const change = removeFollowing({ id, ...series, generatedUntil: record!.generated_until as string }, first, {
      transactions,
      today: TODAY,
      card: null,
    })
    expect(change.deleteIds).toHaveLength(12)
    expect((await a.client.rpc('apply_recurrence_change', changeArgs(id, change))).error).toBeNull()
    expect((await a.client.from('recurrences').select('id').eq('id', id)).data).toEqual([])
    expect(await countRows(id)).toBe(0)

    const restored = await a.client.rpc('restore_recurrence', {
      p_recurrence: { ...record, household_id: houseA },
      p_rows: (rows ?? []).map((row) => ({ ...row, household_id: houseA })),
    })
    expect(restored.error).toBeNull()
    const ids = ((await a.client.from('transactions').select('id').eq('recurrence_id', id)).data ?? []).map((row) => row.id).sort()
    expect(ids).toEqual((rows ?? []).map((row) => row.id).sort())
  })

  it('restore_transactions devolve o lançamento à série', async () => {
    const id = await createRent(rent({ description: 'Só este' }))
    const { data: deleted } = await a.client
      .from('transactions')
      .delete()
      .eq('recurrence_id', id)
      .eq('occurrence_date', '2026-11-10')
      .select(RECORD_COLUMNS)
    const { error } = await a.client.rpc('restore_transactions', {
      p_plan: null,
      p_rows: (deleted ?? []).map((row) => ({ ...row, household_id: houseA })),
    })
    expect(error).toBeNull()
    const { data } = await a.client.from('transactions').select('recurrence_id, occurrence_date, source').eq('id', deleted![0].id).single()
    expect(data).toEqual({ recurrence_id: id, occurrence_date: '2026-11-10', source: 'recurrence' })
  })

  it('apply_budget_change grava e encadeia "só este mês" sem quebrar os meses seguintes', async () => {
    const read = async (): Promise<BudgetRow[]> => {
      const { data } = await a.client.from('budgets').select('category_id, month, amount_cents, repeats').eq('category_id', mercadoA)
      return (data ?? []).map((row) => ({
        categoryId: row.category_id as string,
        month: row.month as string,
        amountCents: Number(row.amount_cents),
        repeats: row.repeats as boolean,
      }))
    }
    // Recomeça do zero (outro teste pode ter gravado Mercado)
    const current = await read()
    await a.client.rpc('apply_budget_change', { p_category_id: mercadoA, p_upserts: [], p_delete_months: current.map((row) => row.month) })

    expect((await a.client.rpc('apply_budget_change', budgetChangeArgs(mercadoA, budgetChange([], mercadoA, '2026-10-01', 150_000, 'from')))).error).toBeNull()
    const second = budgetChange(await read(), mercadoA, '2026-10-01', 180_000, 'only')
    expect((await a.client.rpc('apply_budget_change', budgetChangeArgs(mercadoA, second))).error).toBeNull()

    const { data } = await a.client.from('budgets').select('month, amount_cents, repeats').eq('category_id', mercadoA).order('month')
    expect(data).toEqual([
      { month: '2026-10-01', amount_cents: 180_000, repeats: false },
      { month: '2026-11-01', amount_cents: 150_000, repeats: true },
    ])
  })
})
```

Run: `npm run test:rls`
Expected: PASS em todos os arquivos (`household`, `finance`, `cards` e o novo `recurrences`). O teste de `restore_transactions` da Fase 3 continua passando: as colunas novas são opcionais no snapshot.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261005120000_recorrencia_orcamento.sql lib/recurrence-rpc.ts lib/recurrence-rpc.test.ts lib/supabase/errors.ts lib/supabase/errors.test.ts lib/supabase/database.types.ts tests/rls/recurrences.rls.test.ts
git commit -m "feat(db): recorrências, orçamento e RPCs atômicos de série com testes de RLS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Schemas de repetição, edição da série, orçamento e snapshot

**Files:**
- Create: `lib/validation/fields.ts`
- Modify: `lib/validation/transaction.ts`, `lib/validation/transaction.test.ts`
- Create: `lib/validation/recurrence.ts`, `lib/validation/recurrence.test.ts`
- Create: `lib/validation/budget.ts`, `lib/validation/budget.test.ts`
- Modify: `lib/validation/transaction-record.ts`, `lib/validation/transaction-record.test.ts`
- Modify: `lib/transaction-mappers.ts` (só `rowToFormValues`, para o tipo compilar), `lib/transaction-mappers.test.ts`

**Interfaces:**
- Consumes: Task 1/2 (`RECURRENCE_FREQUENCIES`, `RecurrenceFrequency`, `Series`, `SeriesType`, `OccurrenceValues`, `SeriesEditValues`), Task 3 (`BUDGET_MODES`).
- Produces:
  - `lib/validation/fields.ts`: `MAX_CENTS`, `descriptionSchema`, `amountCentsSchema`, `notesSchema`, `categoryIdSchema`, `repeatSchema` (saída `{ frequency; endDate: string | null } | null`).
  - `transactionSchema` e `cardTransactionSchema` com `repeat`; `TransactionInput['repeat']`, `CardTransactionInput['repeat']`.
  - `TransactionFormValues` com `repeatFrequency: RecurrenceFrequency | ''` e `repeatEndDate: string`; `canRepeat(values): boolean`.
  - `lib/validation/recurrence.ts`: `SERIES_SCOPES = ['one', 'following'] as const`, `type SeriesScope`, `SERIES_SOURCES = ['account', 'card'] as const`, `type SeriesSource`, `recurrenceEditSchema`, `type RecurrenceEditInput`, `toSeriesEditValues(input): SeriesEditValues`, `seriesFromTransactionInput(input): Series | null`, `seriesFromCardInput(input): Series | null`, `occurrenceValuesFromTransactionInput(input): OccurrenceValues`, `occurrenceValuesFromCardInput(input): OccurrenceValues`, `type RecurrenceFormValues`, `toRecurrenceEditInput(values)`, `recurrenceFormResolver`.
  - `lib/validation/budget.ts`: `budgetSchema`, `type BudgetInput`.
  - `lib/validation/transaction-record.ts`: `TRANSACTION_RECORD_COLUMNS` com `recurrence_id, occurrence_date`; `RECURRENCE_RECORD_COLUMNS`; `recurrenceRecordSchema`; `recurrenceSnapshotSchema`; `type RecurrenceRecord`; `type RecurrenceSnapshot`.

- [ ] **Step 1: Mova os campos compartilhados para `lib/validation/fields.ts`**

`validation/recurrence.ts` precisa dos mesmos campos de `transaction.ts`, e `transaction.ts` precisa de `repeatSchema`; um arquivo comum evita import circular. Crie `lib/validation/fields.ts`:

```ts
import { z } from 'zod'
import { RECURRENCE_FREQUENCIES } from '@/lib/finance/recurrence'
import { isoDateSchema } from './common'

export const MAX_CENTS = 99_999_999_999

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, { error: 'Informe a descrição.' })
  .max(120, { error: 'Use no máximo 120 caracteres.' })

export const amountCentsSchema = z
  .number({ error: 'Informe o valor.' })
  .int({ error: 'Informe o valor.' })
  .positive({ error: 'Informe um valor maior que zero.' })
  .max(MAX_CENTS, { error: 'Valor muito alto.' })

export const notesSchema = z
  .string()
  .trim()
  .max(500, { error: 'Use no máximo 500 caracteres.' })
  .nullable()
  .optional()
  .transform((value) => (value ? value : null))

export const categoryIdSchema = z.uuid({ error: 'Escolha a categoria.' })

/** Bloco "Repetir" do formulário rápido; ausente ou nulo = não repete. */
export const repeatSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES, { error: 'Escolha a frequência.' }),
    endDate: isoDateSchema.nullable(),
  })
  .nullable()
  .optional()
  .transform((value) => value ?? null)
```

Em `lib/validation/transaction.ts`, apague as declarações locais `MAX_CENTS`, `description`, `amountCents`, `notes` e `categoryId` e importe-as com os mesmos nomes locais (o resto do arquivo não muda):

```ts
import {
  amountCentsSchema as amountCents,
  categoryIdSchema as categoryId,
  descriptionSchema as description,
  notesSchema as notes,
  repeatSchema,
} from './fields'
```

Run: `npx vitest run lib/validation/transaction.test.ts`
Expected: PASS (só refatoração).

- [ ] **Step 2: Testes de `repeat` no formulário rápido — falham**

Em `lib/validation/transaction.test.ts`:
1. Acrescente `canRepeat` ao import de `./transaction`.
2. Acrescente aos dois fixtures os campos novos — em `form`, depois de `currentInstallment: 1,`:

```ts
  repeatFrequency: '',
  repeatEndDate: '',
```

(`cardForm` herda de `form`.)

3. Acrescente ao fim do arquivo:

```ts
describe('repeat', () => {
  it('sem repetir, repeat é nulo', () => {
    expect(transactionSchema.parse(toTransactionInput(form)).repeat).toBeNull()
  })

  it('mensal sem data final', () => {
    expect(transactionSchema.parse(toTransactionInput({ ...form, repeatFrequency: 'monthly' })).repeat).toEqual({
      frequency: 'monthly',
      endDate: null,
    })
  })

  it('data final antes do lançamento é recusada no campo "Até"', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, repeatFrequency: 'weekly', repeatEndDate: '2026-10-01' }))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['repeatEndDate'])
  })

  it('transferência pode repetir', () => {
    const parsed = transactionSchema.parse(toTransactionInput({ ...form, type: 'transfer', destinationAccountId: ACC_2, repeatFrequency: 'monthly' }))
    expect(parsed.repeat?.frequency).toBe('monthly')
  })

  it('no cartão só a compra à vista repete; o conversor descarta o resto', () => {
    expect(cardTransactionSchema.parse(toCardTransactionInput({ ...cardForm, repeatFrequency: 'monthly' })).repeat).toEqual({
      frequency: 'monthly',
      endDate: null,
    })
    expect(cardTransactionSchema.parse(toCardTransactionInput({ ...cardForm, repeatFrequency: 'monthly', amountCents: 9_000, installmentsCount: 3 })).repeat).toBeNull()
    expect(cardTransactionSchema.parse(toCardTransactionInput({ ...cardForm, type: 'income', repeatFrequency: 'monthly' })).repeat).toBeNull()
    expect(canRepeat({ ...cardForm, installmentsCount: 3 })).toBe(false)
    expect(canRepeat({ ...cardForm, inProgress: true })).toBe(false)
    expect(canRepeat({ ...form, type: 'transfer' })).toBe(true)
  })

  it('o servidor recusa parcelada ou estorno com repetição', () => {
    const base = {
      type: 'expense',
      description: 'TV',
      amountCents: 9_000,
      date: '2026-10-04',
      categoryId: CAT,
      creditCardId: CARD,
      installmentsCount: 3,
      currentInstallment: null,
      repeat: { frequency: 'monthly', endDate: null },
    }
    expect(cardTransactionSchema.safeParse(base).error?.issues[0].path).toEqual(['repeatFrequency'])
    expect(cardTransactionSchema.safeParse({ ...base, type: 'income', installmentsCount: 1 }).success).toBe(false)
  })
})
```

Run: `npx vitest run lib/validation/transaction.test.ts`
Expected: FAIL — erros de tipo/assert: `repeat` não existe na saída; `canRepeat` não exportado.

- [ ] **Step 3: Implemente `repeat` em `lib/validation/transaction.ts`**

1. Import de tipo: `import type { RecurrenceFrequency } from '@/lib/finance/recurrence'`.
2. Em `baseFields`, acrescente `repeat: repeatSchema,`.
3. Acrescente, antes de `transactionSchema`:

```ts
const repeatEndsAfterStart = (value: { date: string; repeat: { endDate: string | null } | null }) =>
  value.repeat === null || value.repeat.endDate === null || value.repeat.endDate >= value.date

const REPEAT_END_ISSUE = { error: 'A data final precisa ser igual ou depois da data do lançamento.', path: ['repeatEndDate'] }
```

4. Encadeie `.refine(repeatEndsAfterStart, REPEAT_END_ISSUE)` no fim de `transactionSchema` (depois do `z.discriminatedUnion([...])`).
5. Em `cardTransactionSchema`, acrescente `repeat: repeatSchema,` ao objeto e, no fim da cadeia de refines:

```ts
  .refine((value) => value.repeat === null || (value.type === 'expense' && value.installmentsCount === 1 && value.currentInstallment === null), {
    error: 'No cartão, só compras à vista se repetem.',
    path: ['repeatFrequency'],
  })
  .refine(repeatEndsAfterStart, REPEAT_END_ISSUE)
```

6. Em `TransactionFormValues`, acrescente:

```ts
  /** "Repetir": '' = não repete. */
  repeatFrequency: RecurrenceFrequency | ''
  /** "Até" (opcional); '' = sem data final. */
  repeatEndDate: string
```

7. Acrescente, depois de `isCardForm`:

```ts
/** "Repetir" vale para conta e transferência; no cartão, só compra à vista (sem parcelas nem em andamento). */
export function canRepeat(values: Pick<TransactionFormValues, 'type' | 'creditCardId' | 'installmentsCount' | 'inProgress'>): boolean {
  if (!isCardForm(values)) return true
  return values.type === 'expense' && values.installmentsCount === 1 && !values.inProgress
}

function toRepeat(values: TransactionFormValues) {
  return values.repeatFrequency ? { frequency: values.repeatFrequency, endDate: values.repeatEndDate || null } : null
}
```

8. Em `toTransactionInput`, acrescente `repeat: toRepeat(values),` ao objeto `base`. Em `toCardTransactionInput`, acrescente `repeat: canRepeat(values) ? toRepeat(values) : null,`.

9. Em `lib/transaction-mappers.ts`, `rowToFormValues` passa a devolver também `repeatFrequency: ''` e `repeatEndDate: ''` (depois de `currentInstallment`). Em `lib/transaction-mappers.test.ts`, acrescente esses dois campos aos objetos esperados de `rowToFormValues`.

Run: `npx vitest run lib/validation/transaction.test.ts lib/transaction-mappers.test.ts`
Expected: PASS.

- [ ] **Step 4: Testes da série e do orçamento — falham**

Crie `lib/validation/recurrence.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  occurrenceValuesFromCardInput,
  occurrenceValuesFromTransactionInput,
  recurrenceEditSchema,
  recurrenceFormResolver,
  seriesFromCardInput,
  seriesFromTransactionInput,
  toRecurrenceEditInput,
  toSeriesEditValues,
  type RecurrenceFormValues,
} from './recurrence'
import { cardTransactionSchema, transactionSchema } from './transaction'

const ACC_1 = '11111111-1111-4111-8111-111111111111'
const ACC_2 = '22222222-2222-4222-8222-222222222222'
const CAT = '33333333-3333-4333-8333-333333333333'
const CARD = '44444444-4444-4444-8444-444444444444'

const values: RecurrenceFormValues = {
  type: 'expense',
  amountCents: 200_000,
  description: 'Aluguel',
  categoryId: CAT,
  accountId: ACC_1,
  creditCardId: '',
  destinationAccountId: '',
  frequency: 'monthly',
  nextDate: '2026-10-10',
  endDate: '',
  notes: '',
}

const parse = (form: RecurrenceFormValues) => recurrenceEditSchema.safeParse(toRecurrenceEditInput(form))
const firstPath = (form: RecurrenceFormValues) => parse(form).error?.issues[0].path

describe('recurrenceEditSchema', () => {
  it('aceita despesa em conta e converte vazios em nulo', () => {
    expect(parse(values).data).toMatchObject({ creditCardId: null, destinationAccountId: null, endDate: null, notes: null })
  })

  it('recusa formatos inválidos no campo certo', () => {
    expect(firstPath({ ...values, categoryId: '' })).toEqual(['categoryId'])
    expect(firstPath({ ...values, creditCardId: CARD })).toEqual(['accountId'])
    expect(firstPath({ ...values, accountId: '' })).toEqual(['accountId'])
    expect(firstPath({ ...values, type: 'income', accountId: '', creditCardId: CARD })).toEqual(['accountId'])
    expect(firstPath({ ...values, type: 'transfer', categoryId: '', destinationAccountId: ACC_1 })).toEqual(['destinationAccountId'])
    expect(firstPath({ ...values, endDate: '2026-10-09' })).toEqual(['endDate'])
  })

  it('toSeriesEditValues limpa o que não pertence ao tipo', () => {
    const parsed = recurrenceEditSchema.parse(toRecurrenceEditInput({ ...values, type: 'transfer', destinationAccountId: ACC_2 }))
    expect(toSeriesEditValues(parsed)).toMatchObject({ type: 'transfer', categoryId: null, creditCardId: null, destinationAccountId: ACC_2 })
  })

  it('o resolver devolve o erro no campo', async () => {
    const result = await recurrenceFormResolver({ ...values, description: ' ' }, undefined, { fields: {}, shouldUseNativeValidation: false })
    expect(result.errors.description?.message).toBe('Informe a descrição.')
  })
})

describe('conversões para a série', () => {
  const accountInput = transactionSchema.parse({
    type: 'expense',
    description: 'Aluguel',
    amountCents: 200_000,
    date: '2026-10-10',
    status: 'paid',
    accountId: ACC_1,
    categoryId: CAT,
    repeat: { frequency: 'monthly', endDate: null },
  })

  it('seriesFromTransactionInput usa a data como âncora', () => {
    expect(seriesFromTransactionInput(accountInput)).toEqual({
      type: 'expense',
      description: 'Aluguel',
      amountCents: 200_000,
      categoryId: CAT,
      accountId: ACC_1,
      destinationAccountId: null,
      creditCardId: null,
      notes: null,
      frequency: 'monthly',
      startDate: '2026-10-10',
      endDate: null,
    })
    expect(seriesFromTransactionInput({ ...accountInput, repeat: null })).toBeNull()
  })

  it('seriesFromCardInput e os valores de uma ocorrência', () => {
    const cardInput = cardTransactionSchema.parse({
      type: 'expense',
      description: 'Streaming',
      amountCents: 5_590,
      date: '2026-10-02',
      categoryId: CAT,
      creditCardId: CARD,
      installmentsCount: 1,
      currentInstallment: null,
      repeat: { frequency: 'monthly', endDate: '2027-06-30' },
    })
    expect(seriesFromCardInput(cardInput)).toMatchObject({ accountId: null, creditCardId: CARD, startDate: '2026-10-02', endDate: '2027-06-30' })
    expect(occurrenceValuesFromCardInput(cardInput)).toMatchObject({ creditCardId: CARD, accountId: null, date: '2026-10-02' })
    expect(occurrenceValuesFromTransactionInput(accountInput)).toMatchObject({ accountId: ACC_1, date: '2026-10-10', status: 'paid' })
  })
})
```

Crie `lib/validation/budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { budgetSchema } from './budget'

const CAT = '33333333-3333-4333-8333-333333333333'

describe('budgetSchema', () => {
  it('aceita valor 0 (remover) e os dois modos', () => {
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-01', amountCents: 0, mode: 'from' }).success).toBe(true)
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-01', amountCents: 150_000, mode: 'only' }).success).toBe(true)
  })

  it('recusa mês fora do dia 1, valor negativo e modo desconhecido', () => {
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-05', amountCents: 1, mode: 'from' }).success).toBe(false)
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-01', amountCents: -1, mode: 'from' }).success).toBe(false)
    expect(budgetSchema.safeParse({ categoryId: CAT, month: '2026-10-01', amountCents: 1, mode: 'sempre' }).success).toBe(false)
  })
})
```

Em `lib/validation/transaction-record.test.ts`:
1. Acrescente ao objeto `record` (depois de `installment_number: 1,`): `recurrence_id: null,` e `occurrence_date: null,`.
2. Acrescente `recurrenceSnapshotSchema` ao import e, ao fim do arquivo:

```ts
describe('recurrenceSnapshotSchema', () => {
  const REC = '77777777-7777-4777-8777-777777777777'
  const recurrence = {
    id: REC,
    type: 'expense',
    description: 'Aluguel',
    amount_cents: 200_000,
    category_id: CAT,
    account_id: ID,
    destination_account_id: null,
    credit_card_id: null,
    frequency: 'monthly',
    start_date: '2026-09-10',
    end_date: null,
    generated_until: '2027-10-05',
    notes: null,
  }
  const row = {
    ...record,
    account_id: ID,
    credit_card_id: null,
    invoice_id: null,
    installment_plan_id: null,
    installment_number: null,
    recurrence_id: REC,
    occurrence_date: '2026-11-10',
    source: 'recurrence',
  }

  it('aceita a série e as linhas apagadas', () => {
    expect(recurrenceSnapshotSchema.safeParse({ recurrence, rows: [row] }).success).toBe(true)
  })

  it('recusa frequência desconhecida e lista vazia', () => {
    expect(recurrenceSnapshotSchema.safeParse({ recurrence: { ...recurrence, frequency: 'daily' }, rows: [row] }).success).toBe(false)
    expect(recurrenceSnapshotSchema.safeParse({ recurrence, rows: [] }).success).toBe(false)
  })
})
```

Run: `npx vitest run lib/validation`
Expected: FAIL — `./recurrence` e `./budget` não existem; `recurrenceSnapshotSchema` não exportado.

- [ ] **Step 5: Implemente `lib/validation/recurrence.ts`**

```ts
import type { FieldErrors, Resolver } from 'react-hook-form'
import { z } from 'zod'
import {
  RECURRENCE_FREQUENCIES,
  type OccurrenceValues,
  type RecurrenceFrequency,
  type Series,
  type SeriesEditValues,
  type SeriesType,
} from '@/lib/finance/recurrence'
import { isoDateSchema } from './common'
import { amountCentsSchema, descriptionSchema, notesSchema } from './fields'
import type { CardTransactionInput, TransactionInput } from './transaction'

/** Alcance ao editar/excluir um lançamento de série. */
export const SERIES_SCOPES = ['one', 'following'] as const
export type SeriesScope = (typeof SERIES_SCOPES)[number]

/** De onde vêm os valores novos de "este e os próximos". */
export const SERIES_SOURCES = ['account', 'card'] as const
export type SeriesSource = (typeof SERIES_SOURCES)[number]

const optionalUuid = z.uuid({ error: 'Escolha uma opção válida.' }).nullable()

/** Edição pela tela Recorrências. O tipo não muda. */
export const recurrenceEditSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    description: descriptionSchema,
    amountCents: amountCentsSchema,
    categoryId: optionalUuid,
    accountId: optionalUuid,
    destinationAccountId: optionalUuid,
    creditCardId: optionalUuid,
    notes: notesSchema,
    frequency: z.enum(RECURRENCE_FREQUENCIES, { error: 'Escolha a frequência.' }),
    nextDate: isoDateSchema,
    endDate: isoDateSchema.nullable(),
  })
  .refine((value) => value.type === 'transfer' || value.categoryId !== null, { error: 'Escolha a categoria.', path: ['categoryId'] })
  .refine((value) => value.type === 'transfer' || (value.accountId === null) !== (value.creditCardId === null), {
    error: 'Escolha a conta ou o cartão.',
    path: ['accountId'],
  })
  .refine((value) => value.creditCardId === null || value.type === 'expense', {
    error: 'No cartão, só despesas se repetem.',
    path: ['accountId'],
  })
  .refine(
    (value) =>
      value.type !== 'transfer' ||
      (value.accountId !== null && value.destinationAccountId !== null && value.accountId !== value.destinationAccountId),
    { error: 'Escolha duas contas diferentes.', path: ['destinationAccountId'] },
  )
  .refine((value) => value.endDate === null || value.endDate >= value.nextDate, {
    error: 'A data final precisa ser igual ou depois da próxima data.',
    path: ['endDate'],
  })

export type RecurrenceEditInput = z.output<typeof recurrenceEditSchema>

/** Normaliza para o tipo: transferência sem categoria nem cartão; receita/despesa sem conta destino. */
export function toSeriesEditValues(input: RecurrenceEditInput): SeriesEditValues {
  const transfer = input.type === 'transfer'
  return {
    type: input.type,
    description: input.description,
    amountCents: input.amountCents,
    categoryId: transfer ? null : input.categoryId,
    accountId: input.accountId,
    destinationAccountId: transfer ? input.destinationAccountId : null,
    creditCardId: transfer ? null : input.creditCardId,
    notes: input.notes,
    frequency: input.frequency,
    nextDate: input.nextDate,
    endDate: input.endDate,
  }
}

function accountFields(input: TransactionInput) {
  const transfer = input.type === 'transfer'
  return {
    type: input.type,
    description: input.description,
    amountCents: input.amountCents,
    categoryId: transfer ? null : input.categoryId,
    accountId: input.accountId,
    destinationAccountId: transfer ? input.destinationAccountId : null,
    creditCardId: null,
    notes: input.notes,
  }
}

function cardFields(input: CardTransactionInput) {
  return {
    type: input.type,
    description: input.description,
    amountCents: input.amountCents,
    categoryId: input.categoryId,
    accountId: null,
    destinationAccountId: null,
    creditCardId: input.creditCardId,
    notes: input.notes,
  }
}

/** Série nova a partir do formulário rápido em conta: a data do lançamento é a âncora. */
export function seriesFromTransactionInput(input: TransactionInput): Series | null {
  if (!input.repeat) return null
  return { ...accountFields(input), frequency: input.repeat.frequency, startDate: input.date, endDate: input.repeat.endDate }
}

/** Série nova a partir do formulário rápido no cartão (só compra à vista chega aqui com repeat). */
export function seriesFromCardInput(input: CardTransactionInput): Series | null {
  if (!input.repeat) return null
  return { ...cardFields(input), frequency: input.repeat.frequency, startDate: input.date, endDate: input.repeat.endDate }
}

/** Valores novos de "editar este e os próximos". */
export function occurrenceValuesFromTransactionInput(input: TransactionInput): OccurrenceValues {
  return { ...accountFields(input), date: input.date, status: input.status }
}

/** No cartão o status segue a data; o valor aqui é ignorado por changeFollowing. */
export function occurrenceValuesFromCardInput(input: CardTransactionInput): OccurrenceValues {
  return { ...cardFields(input), date: input.date, status: 'pending' }
}

/** Estado plano do formulário da tela Recorrências (campos vazios = ''). */
export type RecurrenceFormValues = {
  type: SeriesType
  amountCents: number
  description: string
  categoryId: string
  accountId: string
  creditCardId: string
  destinationAccountId: string
  frequency: RecurrenceFrequency
  nextDate: string
  endDate: string
  notes: string
}

export function toRecurrenceEditInput(values: RecurrenceFormValues): unknown {
  const orNull = (value: string) => value || null
  return {
    type: values.type,
    description: values.description,
    amountCents: values.amountCents,
    categoryId: orNull(values.categoryId),
    accountId: orNull(values.accountId),
    destinationAccountId: orNull(values.destinationAccountId),
    creditCardId: orNull(values.creditCardId),
    notes: values.notes,
    frequency: values.frequency,
    nextDate: values.nextDate,
    endDate: orNull(values.endDate),
  }
}

/** Resolver do react-hook-form com o mesmo schema do servidor. */
export const recurrenceFormResolver: Resolver<RecurrenceFormValues> = async (values) => {
  const parsed = recurrenceEditSchema.safeParse(toRecurrenceEditInput(values))
  if (parsed.success) return { values, errors: {} }
  const errors: Record<string, { type: string; message: string }> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'root')
    if (!errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors: errors as FieldErrors<RecurrenceFormValues> }
}
```

- [ ] **Step 6: Implemente `lib/validation/budget.ts` e o snapshot da série**

Crie `lib/validation/budget.ts`:

```ts
import { z } from 'zod'
import { BUDGET_MODES } from '@/lib/finance/budget'
import { isoDateSchema } from './common'
import { MAX_CENTS } from './fields'

export const budgetSchema = z.object({
  categoryId: z.uuid({ error: 'Categoria inválida.' }),
  month: isoDateSchema.refine((value) => value.endsWith('-01'), { error: 'Mês inválido.' }),
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int({ error: 'Informe o valor.' })
    .min(0, { error: 'Informe um valor válido.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  mode: z.enum(BUDGET_MODES, { error: 'Escolha onde aplicar.' }),
})

export type BudgetInput = z.input<typeof budgetSchema>
```

Em `lib/validation/transaction-record.ts`:
1. `TRANSACTION_RECORD_COLUMNS` passa a terminar em `..., source, external_id, notes, recurrence_id, occurrence_date`.
2. Em `transactionRecordSchema`, acrescente `recurrence_id: nullableUuid,` e `occurrence_date: isoDateSchema.nullable(),`.
3. Acrescente ao fim:

```ts
export const RECURRENCE_RECORD_COLUMNS =
  'id, type, description, amount_cents, category_id, account_id, destination_account_id, credit_card_id, frequency, start_date, end_date, generated_until, notes'

export const recurrenceRecordSchema = z.object({
  id: z.uuid(),
  type: z.enum(['income', 'expense', 'transfer']),
  description: z.string().min(1).max(120),
  amount_cents: z.number().int().positive(),
  category_id: nullableUuid,
  account_id: nullableUuid,
  destination_account_id: nullableUuid,
  credit_card_id: nullableUuid,
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  start_date: isoDateSchema,
  end_date: isoDateSchema.nullable(),
  generated_until: isoDateSchema,
  notes: z.string().max(500).nullable(),
})

/** "Desfazer" de "excluir este e os próximos": a série como estava e as linhas apagadas. */
export const recurrenceSnapshotSchema = z.object({
  recurrence: recurrenceRecordSchema,
  rows: z.array(transactionRecordSchema).min(1).max(1000),
})

export type RecurrenceRecord = z.output<typeof recurrenceRecordSchema>
export type RecurrenceSnapshot = z.output<typeof recurrenceSnapshotSchema>
```

com `import { RECURRENCE_FREQUENCIES } from '@/lib/finance/recurrence'` no topo.

- [ ] **Step 7: Rode os testes e veja passar**

Run: `npx vitest run lib/validation lib/transaction-mappers.test.ts && npx tsc --noEmit`
Expected: PASS e sem erros de tipo. Se `tsc` apontar outros lugares que constroem `TransactionFormValues` (por exemplo `components/transactions/transaction-form.tsx`, em `defaultValues`), acrescente lá `repeatFrequency: ''` e `repeatEndDate: ''` — o formulário de verdade vem no Task 7.

- [ ] **Step 8: Commit**

```bash
git add lib/validation lib/transaction-mappers.ts lib/transaction-mappers.test.ts components/transactions/transaction-form.tsx
git commit -m "feat(validacao): repetir no formulário rápido, edição da série, orçamento e snapshot da série

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Geração ao abrir o app, actions de série, limite do cartão e arquivar

**Files:**
- Create: `lib/card-context.ts`, `lib/recurrence-server.ts`, `lib/recurrences-sync.ts`, `lib/actions/recurrences.ts`
- Modify: `lib/actions/card-transactions.ts`, `lib/actions/transactions.ts`, `lib/actions/accounts.ts`, `lib/actions/cards.ts`, `lib/actions/categories.ts`, `lib/cards.ts`, `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 (`createSeries`, `changeFollowing`, `removeFollowing`, `changeSeries`, `endSeries`, `generationWindow`, `occurrenceDates`, `buildOccurrences`, `horizonDate`, `SeriesState`, `SeriesTransaction`, `CardContext`; `createRecurrenceArgs`, `generateArgs`, `changeArgs`; `seriesFromTransactionInput`, `seriesFromCardInput`, `occurrenceValuesFrom*Input`, `recurrenceEditSchema`, `toSeriesEditValues`, `SERIES_SOURCES`; `RECURRENCE_RECORD_COLUMNS`, `TRANSACTION_RECORD_COLUMNS`, `recurrenceSnapshotSchema`, `RecurrenceRecord`, `RecurrenceSnapshot`, `TransactionRecord`; `ARCHIVE_BLOCKED`; `cardUsage(limit, invoices, futureRecurringCents)`).
- Produces:
  - `lib/card-context.ts` (server-only): `type SupabaseServer`, `loadSchedule(supabase, cardId): Promise<CardSchedule | null>`, `loadStoredCycles(supabase, cardId): Promise<InvoiceCycle[] | null>`, `loadCardContext(supabase, cardId): Promise<CardContext | null>`.
  - `lib/recurrence-server.ts` (server-only): `rowToSeries(record): SeriesState`, `loadSeries(supabase, id): Promise<{ state: SeriesState; record: RecurrenceRecord } | null>`, `loadSeriesTransactions(supabase, recurrenceId): Promise<SeriesTransaction[] | null>`, `loadOccurrence(supabase, transactionId): Promise<{ recurrenceId: string; occurrence: SeriesTransaction } | null>`, `cardContextFor(supabase, creditCardId): Promise<{ ok: true; card: CardContext | null } | { ok: false }>`, `insertSeries(supabase, householdId, series, firstStatus, today): Promise<ActionResult<{ id: string }>>`, `hasActiveRecurrence(supabase, column, id, today): Promise<boolean | null>`.
  - `lib/recurrences-sync.ts` (server-only): `syncRecurrences(today: string): Promise<void>` — nunca lança.
  - `lib/actions/recurrences.ts`: `updateSeriesFollowing(id, input, source): Promise<ActionResult>`, `deleteSeriesFollowing(id): Promise<ActionResult<RecurrenceSnapshot>>`, `restoreSeries(snapshot): Promise<ActionResult>`, `updateRecurrence(id, input): Promise<ActionResult>`, `endRecurrence(id): Promise<ActionResult>`.
  - `createTransaction` e `createCardTransaction` aceitam `repeat` e criam a série.

Este task não tem testes unitários novos (é integração com o Supabase); a verificação é `tsc`, `lint`, `npm test`, `test:rls` e a verificação manual do Task 10.

- [ ] **Step 1: Extraia o contexto do cartão para `lib/card-context.ts`**

Crie `lib/card-context.ts` com as duas funções que hoje são privadas em `lib/actions/card-transactions.ts` (mesmo código) e uma terceira que junta as duas:

```ts
import 'server-only'
import type { CardContext } from '@/lib/finance/recurrence'
import type { CardSchedule, InvoiceCycle } from '@/lib/finance/types'
import type { createClient } from '@/lib/supabase/server'

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export async function loadSchedule(supabase: SupabaseServer, cardId: string): Promise<CardSchedule | null> {
  const { data } = await supabase.from('credit_cards').select('closing_day, due_day').eq('id', cardId).maybeSingle()
  return data ? { closingDay: data.closing_day, dueDay: data.due_day } : null
}

/** Faturas já salvas do cartão: o fechamento salvo vence o calculado (resolveCycleForDate). */
export async function loadStoredCycles(supabase: SupabaseServer, cardId: string): Promise<InvoiceCycle[] | null> {
  const { data, error } = await supabase
    .from('card_invoices')
    .select('closing_month, closing_date, due_date, reference_month')
    .eq('credit_card_id', cardId)
  if (error) return null
  return data.map((row) => ({
    closingMonth: row.closing_month,
    closingDate: row.closing_date,
    dueDate: row.due_date,
    referenceMonth: row.reference_month,
  }))
}

/** Dias do cartão e faturas salvas, para gerar ocorrências no cartão. Null se o cartão não existe ou a leitura falhou. */
export async function loadCardContext(supabase: SupabaseServer, cardId: string): Promise<CardContext | null> {
  const [schedule, stored] = await Promise.all([loadSchedule(supabase, cardId), loadStoredCycles(supabase, cardId)])
  return schedule && stored ? { schedule, stored } : null
}
```

Em `lib/actions/card-transactions.ts`, apague `type SupabaseServer`, `loadSchedule` e `loadStoredCycles` locais e importe-os: `import { loadSchedule, loadStoredCycles, type SupabaseServer } from '@/lib/card-context'`. Remova do import de `@/lib/finance/types` os tipos que deixarem de ser usados.

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; testes passando.

- [ ] **Step 2: Leitura e gravação da série — `lib/recurrence-server.ts`**

```ts
import 'server-only'
import type { ActionResult } from '@/lib/action-result'
import { loadCardContext, type SupabaseServer } from '@/lib/card-context'
import { fetchAllPages } from '@/lib/fetch-all'
import { createSeries, type CardContext, type Series, type SeriesState, type SeriesTransaction } from '@/lib/finance/recurrence'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { createRecurrenceArgs } from '@/lib/recurrence-rpc'
import { translateError } from '@/lib/supabase/errors'
import { RECURRENCE_RECORD_COLUMNS, type RecurrenceRecord } from '@/lib/validation/transaction-record'

export function rowToSeries(record: RecurrenceRecord): SeriesState {
  return {
    id: record.id,
    type: record.type,
    description: record.description,
    amountCents: record.amount_cents,
    categoryId: record.category_id,
    accountId: record.account_id,
    destinationAccountId: record.destination_account_id,
    creditCardId: record.credit_card_id,
    notes: record.notes,
    frequency: record.frequency,
    startDate: record.start_date,
    endDate: record.end_date,
    generatedUntil: record.generated_until,
  }
}

export async function loadSeries(supabase: SupabaseServer, id: string): Promise<{ state: SeriesState; record: RecurrenceRecord } | null> {
  const { data, error } = await supabase.from('recurrences').select(RECURRENCE_RECORD_COLUMNS).eq('id', id).maybeSingle()
  if (error || !data) return null
  const record = data as RecurrenceRecord
  return { state: rowToSeries(record), record }
}

type SeriesTransactionRow = {
  id: string
  occurrence_date: string | null
  type: string
  status: string
  date: string
  account_id: string | null
}

const toSeriesTransaction = (row: SeriesTransactionRow): SeriesTransaction => ({
  id: row.id,
  occurrenceDate: row.occurrence_date ?? row.date,
  type: row.type as TransactionType,
  status: row.status as TransactionStatus,
  date: row.date,
  accountId: row.account_id,
})

const SERIES_TRANSACTION_COLUMNS = 'id, occurrence_date, type, status, date, account_id'

/** Todos os lançamentos da série (paginado). Null se a leitura falhar. */
export async function loadSeriesTransactions(supabase: SupabaseServer, recurrenceId: string): Promise<SeriesTransaction[] | null> {
  try {
    const rows = await fetchAllPages((from, to) =>
      supabase.from('transactions').select(SERIES_TRANSACTION_COLUMNS).eq('recurrence_id', recurrenceId).order('id').range(from, to),
    )
    return (rows as SeriesTransactionRow[]).map(toSeriesTransaction)
  } catch {
    return null
  }
}

/** O lançamento aberto e a série dele; null se não for de uma série. */
export async function loadOccurrence(
  supabase: SupabaseServer,
  transactionId: string,
): Promise<{ recurrenceId: string; occurrence: SeriesTransaction } | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select(`recurrence_id, ${SERIES_TRANSACTION_COLUMNS}`)
    .eq('id', transactionId)
    .maybeSingle()
  if (error || !data?.recurrence_id) return null
  return { recurrenceId: data.recurrence_id, occurrence: toSeriesTransaction(data as SeriesTransactionRow) }
}

/** Contexto do cartão dos valores novos: null em conta; falha se o cartão não existe. */
export async function cardContextFor(
  supabase: SupabaseServer,
  creditCardId: string | null,
): Promise<{ ok: true; card: CardContext | null } | { ok: false }> {
  if (creditCardId === null) return { ok: true, card: null }
  const card = await loadCardContext(supabase, creditCardId)
  return card ? { ok: true, card } : { ok: false }
}

/** Série nova + primeira ocorrência + as seguintes até o horizonte, numa transação (create_recurrence). */
export async function insertSeries(
  supabase: SupabaseServer,
  householdId: string,
  series: Series,
  firstStatus: TransactionStatus,
  today: string,
): Promise<ActionResult<{ id: string }>> {
  const context = await cardContextFor(supabase, series.creditCardId)
  if (!context.ok) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }
  const { data, error } = await supabase.rpc(
    'create_recurrence',
    createRecurrenceArgs(householdId, series, createSeries(series, firstStatus, context.card, today)),
  )
  if (error) return { ok: false, error: translateError(error) }
  return { ok: true, data: { id: data as string } }
}

/** Há recorrência ativa (sem fim ou terminando hoje ou depois) usando o item? Null se a consulta falhar. */
export async function hasActiveRecurrence(
  supabase: SupabaseServer,
  column: 'account_id' | 'destination_account_id' | 'credit_card_id' | 'category_id',
  id: string,
  today: string,
): Promise<boolean | null> {
  const { count, error } = await supabase
    .from('recurrences')
    .select('id', { count: 'exact', head: true })
    .eq(column, id)
    .or(`end_date.is.null,end_date.gte.${today}`)
  if (error) return null
  return (count ?? 0) > 0
}
```

Se o cliente tipado reclamar de `supabase.rpc('create_recurrence', ...)` (`Json` não aceita as linhas), siga o padrão da Fase 3 em `lib/actions/card-transactions.ts` — lá `purchaseRpcArgs` passa direto; se precisar, faça o cast no ponto da chamada (`as unknown as Database['public']['Functions']['create_recurrence']['Args']`) e registre no commit.

- [ ] **Step 3: Geração ao abrir o app — `lib/recurrences-sync.ts` e o layout**

```ts
import 'server-only'
import { loadCardContext } from '@/lib/card-context'
import { buildOccurrences, generationWindow, horizonDate, occurrenceDates } from '@/lib/finance/recurrence'
import { generateArgs } from '@/lib/recurrence-rpc'
import { rowToSeries } from '@/lib/recurrence-server'
import { createClient } from '@/lib/supabase/server'
import { RECURRENCE_RECORD_COLUMNS, type RecurrenceRecord } from '@/lib/validation/transaction-record'

/**
 * Gera as ocorrências que faltam até hoje + 12 meses (PRD 8.6). Roda no layout a cada carregamento:
 * normalmente a consulta volta vazia. Nunca lança — um erro fica no log e a próxima carga tenta de novo
 * (o índice único impede duplicatas).
 */
export async function syncRecurrences(today: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('recurrences')
      .select(RECURRENCE_RECORD_COLUMNS)
      .lt('generated_until', horizonDate(today))
    if (error) throw error

    for (const record of data as RecurrenceRecord[]) {
      const series = rowToSeries(record)
      const window = generationWindow(series.generatedUntil, series.endDate, today)
      if (!window) continue
      try {
        const card = series.creditCardId ? await loadCardContext(supabase, series.creditCardId) : null
        if (series.creditCardId && !card) continue
        const occurrences = buildOccurrences(occurrenceDates(series, window.from, window.until), card, today)
        const { error: rpcError } = await supabase.rpc('generate_recurrence_occurrences', generateArgs(series.id, series, occurrences, window.until))
        if (rpcError) console.error('syncRecurrences', series.id, rpcError.message)
      } catch (cause) {
        console.error('syncRecurrences', series.id, cause)
      }
    }
  } catch (cause) {
    console.error('syncRecurrences', cause)
  }
}
```

Em `app/(app)/layout.tsx`, importe `todayISO` de `@/lib/dates` e `syncRecurrences` de `@/lib/recurrences-sync`, e logo depois de `if (!household) redirect('/bem-vindo')`:

```ts
  // Gera os lançamentos recorrentes que faltam antes de carregar os dados (PRD 8.6)
  await syncRecurrences(todayISO())
```

- [ ] **Step 4: Criar com "Repetir"**

Em `lib/actions/transactions.ts`:
1. Imports: `todayISO` de `@/lib/dates`; `insertSeries` de `@/lib/recurrence-server`; `seriesFromTransactionInput` de `@/lib/validation/recurrence`.
2. Em `createTransaction`, depois de `const supabase = await createClient()` e antes do insert:

```ts
  const series = seriesFromTransactionInput(parsed.data)
  if (series) {
    const created = await insertSeries(supabase, household.id, series, parsed.data.status, todayISO())
    if (!created.ok) return created
    await supabase.from('profiles').update({ last_account_id: parsed.data.accountId, last_credit_card_id: null }).eq('user_id', user.id)
    done()
    return { ok: true, data: { id: created.data.id } }
  }
```

Em `lib/actions/card-transactions.ts`:
1. Imports: `getCurrentHousehold` de `@/lib/household`; `insertSeries` de `@/lib/recurrence-server`; `seriesFromCardInput` de `@/lib/validation/recurrence`.
2. Em `createCardTransaction`, depois de `const supabase = await createClient()`:

```ts
  const series = seriesFromCardInput(parsed.data)
  if (series) {
    const household = await getCurrentHousehold()
    if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }
    const created = await insertSeries(supabase, household.id, series, 'pending', todayISO())
    if (!created.ok) return created
    await supabase.from('profiles').update({ last_credit_card_id: parsed.data.creditCardId, last_account_id: null }).eq('user_id', user.id)
    done()
    return { ok: true, data: { ids: [] } }
  }
```

- [ ] **Step 5: Actions da série — `lib/actions/recurrences.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { todayISO } from '@/lib/dates'
import {
  changeFollowing,
  changeSeries,
  endSeries,
  removeFollowing,
  type OccurrenceValues,
  type SeriesChange,
  type SeriesState,
  type SeriesTransaction,
} from '@/lib/finance/recurrence'
import { getCurrentHousehold } from '@/lib/household'
import { changeArgs } from '@/lib/recurrence-rpc'
import { cardContextFor, loadOccurrence, loadSeries, loadSeriesTransactions } from '@/lib/recurrence-server'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import {
  occurrenceValuesFromCardInput,
  occurrenceValuesFromTransactionInput,
  recurrenceEditSchema,
  SERIES_SOURCES,
  toSeriesEditValues,
} from '@/lib/validation/recurrence'
import { cardTransactionSchema, transactionSchema } from '@/lib/validation/transaction'
import {
  recurrenceSnapshotSchema,
  TRANSACTION_RECORD_COLUMNS,
  type RecurrenceRecord,
  type RecurrenceSnapshot,
  type TransactionRecord,
} from '@/lib/validation/transaction-record'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const sourceSchema = z.enum(SERIES_SOURCES)

function done() {
  revalidatePath('/', 'layout')
}

type LoadedSeries = { state: SeriesState; record: RecurrenceRecord; transactions: SeriesTransaction[] }

async function loadWithTransactions(supabase: SupabaseServer, recurrenceId: string): Promise<LoadedSeries | null> {
  const [series, transactions] = await Promise.all([loadSeries(supabase, recurrenceId), loadSeriesTransactions(supabase, recurrenceId)])
  if (!series || !transactions) return null
  return { ...series, transactions }
}

async function apply(supabase: SupabaseServer, recurrenceId: string, change: SeriesChange): Promise<ActionResult> {
  const { error } = await supabase.rpc('apply_recurrence_change', changeArgs(recurrenceId, change))
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: null }
}

/** Valores novos do formulário rápido, validados pelo mesmo schema do lançamento. */
function parseOccurrenceValues(input: unknown, source: 'account' | 'card'): { ok: true; values: OccurrenceValues } | { ok: false; result: ActionResult } {
  if (source === 'card') {
    const parsed = cardTransactionSchema.safeParse(input)
    if (!parsed.success) return { ok: false, result: invalidInput(parsed.error) }
    if (parsed.data.type !== 'expense' || parsed.data.installmentsCount !== 1 || parsed.data.currentInstallment !== null) {
      return { ok: false, result: { ok: false, error: 'No cartão, só compras à vista se repetem.' } }
    }
    return { ok: true, values: occurrenceValuesFromCardInput(parsed.data) }
  }
  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, result: invalidInput(parsed.error) }
  return { ok: true, values: occurrenceValuesFromTransactionInput(parsed.data) }
}

/** "Editar este e os próximos" a partir de um lançamento da série. */
export async function updateSeriesFollowing(id: unknown, input: unknown, source: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  const parsedSource = sourceSchema.safeParse(source)
  if (!parsedId.success || !parsedSource.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = parseOccurrenceValues(input, parsedSource.data)
  if (!parsed.ok) return parsed.result

  const supabase = await createClient()
  const found = await loadOccurrence(supabase, parsedId.data)
  if (!found) return { ok: false, error: GENERIC_ERROR }
  const loaded = await loadWithTransactions(supabase, found.recurrenceId)
  if (!loaded) return { ok: false, error: GENERIC_ERROR }
  const context = await cardContextFor(supabase, parsed.values.creditCardId)
  if (!context.ok) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }

  const change = changeFollowing(loaded.state, found.occurrence, parsed.values, {
    transactions: loaded.transactions,
    today: todayISO(),
    card: context.card,
  })
  return apply(supabase, loaded.state.id, change)
}

/** "Excluir este e os próximos". Devolve o snapshot do "Desfazer". */
export async function deleteSeriesFollowing(id: unknown): Promise<ActionResult<RecurrenceSnapshot>> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const found = await loadOccurrence(supabase, parsedId.data)
  if (!found) return { ok: false, error: GENERIC_ERROR }
  const loaded = await loadWithTransactions(supabase, found.recurrenceId)
  if (!loaded) return { ok: false, error: GENERIC_ERROR }

  const change = removeFollowing(loaded.state, found.occurrence, { transactions: loaded.transactions, today: todayISO(), card: null })
  const { data: rows, error: rowsError } = await supabase.from('transactions').select(TRANSACTION_RECORD_COLUMNS).in('id', change.deleteIds)
  if (rowsError) return { ok: false, error: translateError(rowsError) }

  const result = await apply(supabase, loaded.state.id, change)
  if (!result.ok) return result
  return { ok: true, data: { recurrence: loaded.record, rows: rows as TransactionRecord[] } }
}

/** "Desfazer": devolve a série como estava e as linhas apagadas, com os mesmos ids. */
export async function restoreSeries(snapshot: unknown): Promise<ActionResult> {
  const parsed = recurrenceSnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_recurrence', {
    p_recurrence: { ...parsed.data.recurrence, household_id: household.id },
    p_rows: parsed.data.rows.map((row) => ({ ...row, household_id: household.id })),
  })
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: null }
}

/** Edição pela tela Recorrências: vale das não realizadas de hoje em diante. Série encerrada não se edita. */
export async function updateRecurrence(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = recurrenceEditSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const today = todayISO()
  if (parsed.data.nextDate < today) {
    return { ok: false, error: 'Verifique os campos destacados.', fieldErrors: { nextDate: ['Escolha hoje ou uma data futura.'] } }
  }

  const supabase = await createClient()
  const loaded = await loadWithTransactions(supabase, parsedId.data)
  if (!loaded) return { ok: false, error: GENERIC_ERROR }
  if (loaded.state.endDate !== null && loaded.state.endDate < today) return { ok: false, error: 'Esta recorrência já foi encerrada.' }

  const values = toSeriesEditValues(parsed.data)
  const context = await cardContextFor(supabase, values.creditCardId)
  if (!context.ok) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }

  return apply(supabase, loaded.state.id, changeSeries(loaded.state, values, { transactions: loaded.transactions, today, card: context.card }))
}

/** Encerra hoje: as não realizadas depois de hoje saem; as pagas ficam. */
export async function endRecurrence(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const loaded = await loadWithTransactions(supabase, parsedId.data)
  if (!loaded) return { ok: false, error: GENERIC_ERROR }

  return apply(supabase, loaded.state.id, endSeries(loaded.state, { transactions: loaded.transactions, today: todayISO(), card: null }))
}
```

- [ ] **Step 6: Arquivar recusa com recorrência ativa**

Em `lib/actions/accounts.ts`, `setAccountArchived` passa a ser:

```ts
export async function setAccountArchived(id: unknown, archived: boolean): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  if (archived) {
    const today = todayISO()
    const [asSource, asDestination] = await Promise.all([
      hasActiveRecurrence(supabase, 'account_id', parsedId.data, today),
      hasActiveRecurrence(supabase, 'destination_account_id', parsedId.data, today),
    ])
    if (asSource === null || asDestination === null) return { ok: false, error: GENERIC_ERROR }
    if (asSource || asDestination) return { ok: false, error: ARCHIVE_BLOCKED.account }
  }

  const { data, error } = await supabase.from('accounts').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
```

(imports: `todayISO` de `@/lib/dates`, `hasActiveRecurrence` de `@/lib/recurrence-server`, `ARCHIVE_BLOCKED` de `@/lib/supabase/errors`.)

Faça o mesmo em `setCardArchived` (`lib/actions/cards.ts`) com uma única verificação `hasActiveRecurrence(supabase, 'credit_card_id', ...)` e `ARCHIVE_BLOCKED.card`, e em `setCategoryArchived` (`lib/actions/categories.ts`) com `'category_id'` e `ARCHIVE_BLOCKED.category`. Desarquivar (`archived === false`) não verifica nada.

- [ ] **Step 7: Limite do cartão sem as recorrências futuras — `lib/cards.ts`**

Acrescente depois de `loadInvoiceTotals`:

```ts
/** Por cartão, a soma das despesas de recorrência com data futura: só ocupam o limite quando a data chega. */
async function loadFutureRecurring(supabase: SupabaseServer, today: string, cardId?: string): Promise<Map<string, number>> {
  const rows = await fetchAllPages((from, to) => {
    let query = supabase
      .from('transactions')
      .select('id, credit_card_id, amount_cents')
      .not('recurrence_id', 'is', null)
      .not('credit_card_id', 'is', null)
      .eq('type', 'expense')
      .gt('date', today)
    if (cardId) query = query.eq('credit_card_id', cardId)
    return query.order('id').range(from, to)
  })
  const totals = new Map<string, number>()
  for (const row of rows) {
    const id = row.credit_card_id as string
    totals.set(id, (totals.get(id) ?? 0) + Number(row.amount_cents))
  }
  return totals
}
```

`withUsage` ganha o parâmetro `futureRecurringCents: number` e passa a usar `cardUsage(card.limitCents, mine, futureRecurringCents)`. Em `listCards`, calcule `today` antes e acrescente `loadFutureRecurring(supabase, today)` ao `Promise.all`; chame `withUsage(toCard(row), invoices, today, future.get(row.id) ?? 0)`. Em `getCard`, o mesmo com `loadFutureRecurring(supabase, today, id)`.

- [ ] **Step 8: Verifique**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run test:rls`
Expected: tudo passando, sem erros de tipo nem de lint.

- [ ] **Step 9: Commit**

```bash
git add lib/card-context.ts lib/recurrence-server.ts lib/recurrences-sync.ts lib/actions lib/cards.ts "app/(app)/layout.tsx"
git commit -m "feat(recorrencia): geração ao abrir o app, actions da série, limite do cartão e arquivar com série ativa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Formulário rápido com "Repetir" e escopo da série

**Files:**
- Modify: `lib/transaction-mappers.ts`, `lib/transaction-mappers.test.ts`
- Modify: `components/transactions/transaction-form.tsx`, `components/transactions/transaction-modal.tsx`, `components/transactions/transaction-item.tsx`, `components/transactions/transaction-list.tsx`, `components/cards/invoice-transactions.tsx`
- Modify (só fixtures, se o `tsc` pedir): testes que montam `TransactionRow` à mão

**Interfaces:**
- Consumes: Task 1 (`FREQUENCY_LABELS`, `describeSchedule`, `RecurrenceFrequency`), Task 5 (`canRepeat`, `TransactionFormValues` com `repeatFrequency`/`repeatEndDate`, `RecurrenceSnapshot`), Task 6 (`updateSeriesFollowing`, `deleteSeriesFollowing`, `restoreSeries`).
- Produces:
  - `TRANSACTION_COLUMNS` com `recurrence_id, occurrence_date, recurrences(frequency)`; `TransactionRow` com `recurrence_id: string | null`, `occurrence_date: string | null`, `recurrences: { frequency: RecurrenceFrequency } | null`.
  - `type SeriesInfo = { frequency: RecurrenceFrequency }`; `seriesInfo(row): SeriesInfo | undefined`.
  - `TransactionModal` e `TransactionForm` com a prop opcional `series?: SeriesInfo`.

- [ ] **Step 1: Colunas da série no `TransactionRow` — teste que falha**

Em `lib/transaction-mappers.test.ts`, acrescente `seriesInfo` ao import e, ao fixture-base de `TransactionRow` usado no arquivo, os campos `recurrence_id: null`, `occurrence_date: null`, `recurrences: null`. Depois acrescente:

```ts
describe('seriesInfo', () => {
  it('só existe em lançamentos de série', () => {
    expect(seriesInfo(row)).toBeUndefined()
    expect(
      seriesInfo({ ...row, recurrence_id: '77777777-7777-4777-8777-777777777777', occurrence_date: '2026-10-10', recurrences: { frequency: 'monthly' } }),
    ).toEqual({ frequency: 'monthly' })
  })
})
```

(`row` é o nome do fixture-base do arquivo; se for outro, use-o.)

Run: `npx vitest run lib/transaction-mappers.test.ts`
Expected: FAIL — `seriesInfo` não exportado.

- [ ] **Step 2: Implemente em `lib/transaction-mappers.ts`**

1. `import type { RecurrenceFrequency } from '@/lib/finance/recurrence'`.
2. `TRANSACTION_COLUMNS` passa a terminar em `..., installment_plans(installments_count), card_invoices(closing_month), recurrence_id, occurrence_date, recurrences(frequency)`.
3. Em `TransactionRow`, depois de `card_invoices`:

```ts
  recurrence_id: string | null
  occurrence_date: string | null
  recurrences: { frequency: RecurrenceFrequency } | null
```

4. Ao fim do arquivo:

```ts
export type SeriesInfo = { frequency: RecurrenceFrequency }

/** Frequência da série, se o lançamento veio de uma recorrência. */
export function seriesInfo(row: TransactionRow): SeriesInfo | undefined {
  if (row.recurrence_id === null) return undefined
  return { frequency: row.recurrences?.frequency ?? 'monthly' }
}
```

Run: `npx tsc --noEmit`
Expected: os testes ou componentes que montam `TransactionRow` à mão (por exemplo `lib/transaction-grouping.test.ts`, `lib/finance/installments-view.test.ts`) acusam os campos novos — acrescente `recurrence_id: null, occurrence_date: null, recurrences: null` a esses fixtures até o `tsc` passar. O `tests/rls/cards.rls.test.ts` já usa cast e não precisa mudar.

Run: `npx vitest run lib/transaction-mappers.test.ts`
Expected: PASS.

- [ ] **Step 3: Ícone de repetir na lista**

Em `components/transactions/transaction-item.tsx`, importe `Repeat` de `lucide-react` e troque a linha do título por:

```tsx
        <span className="flex min-w-0 items-center gap-1 font-medium">
          <span className="truncate">{title}</span>
          {row.recurrence_id ? (
            <>
              <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">(recorrente)</span>
            </>
          ) : null}
        </span>
```

- [ ] **Step 4: Modal e listas passam a série**

Em `components/transactions/transaction-modal.tsx`:
- importe `type SeriesInfo` de `@/lib/transaction-mappers` (junto com `InstallmentInfo`);
- acrescente `series?: SeriesInfo` às props e ao destructuring;
- título: `const title = installment ? 'Editar parcela' : series ? 'Editar lançamento recorrente' : transactionId ? 'Editar lançamento' : 'Novo lançamento'`;
- passe `series={series}` ao `<TransactionForm>`.

Em `components/transactions/transaction-list.tsx` e `components/cards/invoice-transactions.tsx`: importe `seriesInfo` de `@/lib/transaction-mappers` e acrescente ao `<TransactionModal>`:

```tsx
        series={editing ? seriesInfo(editing) : undefined}
```

- [ ] **Step 5: "Repetir" e escopo da série no formulário**

Em `components/transactions/transaction-form.tsx`:

1. Imports novos:

```ts
import { Repeat } from 'lucide-react'
import { deleteSeriesFollowing, restoreSeries, updateSeriesFollowing } from '@/lib/actions/recurrences'
import { describeSchedule, FREQUENCY_LABELS, type RecurrenceFrequency } from '@/lib/finance/recurrence'
import type { RecurrenceSnapshot } from '@/lib/validation/transaction-record'
```

e acrescente `canRepeat` ao import de `@/lib/validation/transaction` e `type SeriesInfo` ao de `@/lib/transaction-mappers`.

2. Constante, depois de `STATUS_OPTIONS`:

```ts
const REPEAT_OPTIONS = [
  { value: '', label: 'Não' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
] as const

type Scope = 'one' | 'rest'
```

3. Props: acrescente a `TransactionFormProps`

```ts
  /** Lançamento de uma série: salvar e excluir perguntam "só este" ou "este e os próximos". */
  series?: SeriesInfo
```

e `series` ao destructuring de `TransactionForm`.

4. `defaultValues` (formulário novo): acrescente `repeatFrequency: ''` e `repeatEndDate: ''`.

5. `useWatch`: acrescente `'repeatFrequency'` e `'repeatEndDate'` ao fim da lista `name` e `repeatFrequency, repeatEndDate` ao fim do array desestruturado.

6. Depois de `const locked = Boolean(installment)`:

```ts
  // Parcela ou lançamento de série: salvar e excluir perguntam o alcance
  const scoped = locked || Boolean(series)
```

7. `canSplit` passa a ser `isCard && type === 'expense' && !transactionId && !repeatFrequency`, e acrescente:

```ts
  const showRepeat = !transactionId && canRepeat({ type, creditCardId, installmentsCount, inProgress })
```

8. Nova função, perto de `changeStatus`:

```ts
  function changeRepeat(value: RecurrenceFrequency | '') {
    form.setValue('repeatFrequency', value, revalidate)
    if (value) {
      // Série e parcelamento não combinam
      form.setValue('installmentsCount', 1)
      form.setValue('inProgress', false)
    } else {
      form.setValue('repeatEndDate', '', revalidate)
    }
  }
```

9. Depois de `toastDeleted`:

```ts
  function toastSeriesDeleted(snapshot: RecurrenceSnapshot) {
    toast('Lançamentos excluídos.', {
      action: {
        label: 'Desfazer',
        onClick: async () => {
          const restored = await restoreSeries(snapshot)
          if (restored.ok) toast.success('Lançamentos restaurados.')
          else toast.error(restored.error)
        },
      },
    })
  }
```

10. Em `onSubmit` e `onDelete`, troque `if (locked)` por `if (scoped)`.

11. Substitua `applyScope` inteira por:

```ts
  /** Parcela: só os campos descritivos (Fase 3). */
  async function applyInstallmentScope(id: string, action: 'save' | 'delete', scope: InstallmentScope): Promise<boolean> {
    if (action === 'save') {
      const values = form.getValues()
      const result = await updateInstallments(id, { scope, description: values.description, categoryId: values.categoryId, notes: values.notes })
      if (!result.ok) {
        applyActionErrors(form, result)
        return false
      }
      toast.success(scope === 'one' ? 'Parcela atualizada.' : 'Parcelas atualizadas.')
      return true
    }
    const result = await deleteInstallments(id, scope)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    toastDeleted(result.data, scope === 'one' ? 'Parcela excluída.' : 'Parcelas excluídas.')
    return true
  }

  /** Série: "só este" usa as actions normais; "este e os próximos" muda a série (Fase 4). */
  async function applySeriesScope(id: string, action: 'save' | 'delete', scope: Scope): Promise<boolean> {
    if (action === 'delete') {
      if (scope === 'one') {
        const result = await deleteTransaction(id)
        if (!result.ok) {
          toast.error(result.error)
          return false
        }
        toastDeleted(result.data, 'Lançamento excluído.')
        return true
      }
      const result = await deleteSeriesFollowing(id)
      if (!result.ok) {
        toast.error(result.error)
        return false
      }
      toastSeriesDeleted(result.data)
      return true
    }

    const values = form.getValues()
    const onCard = isCardForm(values)
    const input = onCard ? toCardTransactionInput(values) : toTransactionInput(values)
    let result: ActionResult<unknown>
    if (scope === 'rest') result = await updateSeriesFollowing(id, input, onCard ? 'card' : 'account')
    else result = onCard ? await updateCardTransaction(id, input) : await updateTransaction(id, input)
    if (!result.ok) {
      applyActionErrors(form, result)
      return false
    }
    toast.success(scope === 'one' ? 'Lançamento atualizado.' : 'Este e os próximos atualizados.')
    return true
  }

  async function applyScope(scope: Scope) {
    if (!transactionId || !scopeAction) return
    setBusy(true)
    try {
      const ok = series
        ? await applySeriesScope(transactionId, scopeAction, scope)
        : await applyInstallmentScope(transactionId, scopeAction, scope === 'one' ? 'one' : 'future')
      if (ok) onDone()
    } finally {
      setBusy(false)
      setScopeAction(null)
    }
  }

  const scopeLabels = series
    ? { one: 'Só este', rest: 'Este e os próximos' }
    : { one: 'Só esta parcela', rest: 'Esta e as futuras' }
```

12. No JSX, logo no início do `<form>` (antes do `Segmented` de tipo):

```tsx
      {series ? (
        <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
          <Repeat className="size-4 shrink-0" aria-hidden />
          {FREQUENCY_LABELS[series.frequency]} · {initial?.description}. Frequência e data final mudam na tela Recorrências.
        </p>
      ) : null}
```

13. Depois do aviso `beforeInitialBalance` e antes do `Segmented` de status:

```tsx
      {showRepeat ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Repetir</p>
          <Segmented label="Repetir" value={repeatFrequency} options={REPEAT_OPTIONS} onChange={changeRepeat} />
          {repeatFrequency ? (
            <>
              <Field id="tx-repeat-end" label="Até (opcional)" error={errors.repeatEndDate?.message}>
                <Input
                  id="tx-repeat-end"
                  type="date"
                  min={ISO_DATE.test(date) ? date : undefined}
                  aria-invalid={Boolean(errors.repeatEndDate)}
                  aria-describedby={errors.repeatEndDate ? 'tx-repeat-end-error' : undefined}
                  {...form.register('repeatEndDate')}
                />
              </Field>
              {ISO_DATE.test(date) ? (
                <p className="text-sm text-muted-foreground">
                  {describeSchedule({ frequency: repeatFrequency, startDate: date, endDate: ISO_DATE.test(repeatEndDate) ? repeatEndDate : null })}.
                  Os próximos ficam como previstos.
                </p>
              ) : null}
            </>
          ) : null}
          {errors.repeatFrequency ? (
            <p role="alert" className="text-sm text-expense">
              {errors.repeatFrequency.message}
            </p>
          ) : null}
        </div>
      ) : null}
```

14. No bloco de alcance, troque os textos fixos e as chamadas:

```tsx
            <Button type="button" variant="outline" disabled={busy} onClick={() => applyScope('one')}>
              {scopeLabels.one}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => applyScope('rest')}>
              {scopeLabels.rest}
            </Button>
```

- [ ] **Step 6: Verifique**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sem erros; testes passando.

Run: `npm run build`
Expected: build ok.

- [ ] **Step 7: Commit**

```bash
git add lib/transaction-mappers.ts lib/transaction-mappers.test.ts components/transactions components/cards/invoice-transactions.tsx lib
git commit -m "feat(lancamentos): repetir no formulário rápido e só este / este e os próximos nas séries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tela Recorrências

**Files:**
- Modify: `lib/finance/recurrence.ts` (tipo `RecurrenceItem` e `sortRecurrenceItems`), `lib/finance/recurrence.test.ts`
- Create: `lib/recurrences.ts`
- Create: `components/recurrences/recurrence-list.tsx`, `components/recurrences/recurrence-form.tsx`
- Create: `app/(app)/recorrencias/page.tsx`
- Modify: `components/layout/nav-items.ts`

**Interfaces:**
- Consumes: Task 1/2 (`SeriesState`, `nextOccurrenceDate`, `describeSchedule`, `occurrenceDates`, `horizonDate`, `RECURRENCE_FREQUENCIES`, `FREQUENCY_LABELS`), Task 5 (`RecurrenceFormValues`, `recurrenceFormResolver`, `toRecurrenceEditInput`), Task 6 (`rowToSeries`, `updateRecurrence`, `endRecurrence`); `useTransactionFormData` (contas, cartões, categorias); `QuickAddButton`; `ResponsiveModal`; `encodeSource`/`decodeSource`.
- Produces:
  - `type RecurrenceItem = SeriesState & { nextDate: string | null }`; `sortRecurrenceItems(items): RecurrenceItem[]`.
  - `listRecurrences(today): Promise<{ active: RecurrenceItem[]; ended: RecurrenceItem[] }>` (server-only).
  - Rota `/recorrencias` e item "Recorrências" no menu.

- [ ] **Step 1: Ordem das recorrências — teste que falha**

Em `lib/finance/recurrence.test.ts`, acrescente `sortRecurrenceItems` e `type RecurrenceItem` ao import e:

```ts
describe('sortRecurrenceItems', () => {
  const item = (id: string, description: string, nextDate: string | null): RecurrenceItem => ({
    id,
    description,
    nextDate,
    type: 'expense',
    amountCents: 100,
    categoryId: 'cat',
    accountId: 'acc',
    destinationAccountId: null,
    creditCardId: null,
    notes: null,
    frequency: 'monthly',
    startDate: '2026-01-01',
    endDate: null,
    generatedUntil: '2027-10-05',
  })

  it('pela próxima data; sem próxima data no fim; empate pela descrição', () => {
    const sorted = sortRecurrenceItems([item('a', 'Luz', null), item('b', 'Aluguel', '2026-10-10'), item('c', 'Água', '2026-10-10'), item('d', 'Salário', '2026-10-06')])
    expect(sorted.map((entry) => entry.id)).toEqual(['d', 'c', 'b', 'a'])
  })
})
```

Run: `npx vitest run lib/finance/recurrence.test.ts`
Expected: FAIL — `sortRecurrenceItems` não exportado.

- [ ] **Step 2: Implemente**

Acrescente ao fim de `lib/finance/recurrence.ts`:

```ts
/** Série com a próxima data não realizada (tela Recorrências). */
export type RecurrenceItem = SeriesState & { nextDate: string | null }

/** Pela próxima data (as sem próxima no fim), depois pela descrição. */
export function sortRecurrenceItems(items: RecurrenceItem[]): RecurrenceItem[] {
  return [...items].sort((a, b) => {
    if (a.nextDate !== b.nextDate) {
      if (a.nextDate === null) return 1
      if (b.nextDate === null) return -1
      return a.nextDate.localeCompare(b.nextDate)
    }
    return a.description.localeCompare(b.description, 'pt-BR')
  })
}
```

Run: `npx vitest run lib/finance/recurrence.test.ts`
Expected: PASS.

- [ ] **Step 3: Consulta — `lib/recurrences.ts`**

```ts
import 'server-only'
import { fetchAllPages } from '@/lib/fetch-all'
import { nextOccurrenceDate, sortRecurrenceItems, type RecurrenceItem, type SeriesTransaction } from '@/lib/finance/recurrence'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { rowToSeries } from '@/lib/recurrence-server'
import { createClient } from '@/lib/supabase/server'
import { RECURRENCE_RECORD_COLUMNS, type RecurrenceRecord } from '@/lib/validation/transaction-record'

/** Séries ativas (sem fim ou terminando hoje ou depois) e encerradas, com a próxima data. */
export async function listRecurrences(today: string): Promise<{ active: RecurrenceItem[]; ended: RecurrenceItem[] }> {
  const supabase = await createClient()
  const [{ data, error }, upcoming] = await Promise.all([
    supabase.from('recurrences').select(RECURRENCE_RECORD_COLUMNS).order('description'),
    fetchAllPages((from, to) =>
      supabase
        .from('transactions')
        .select('id, recurrence_id, occurrence_date, type, status, date, account_id')
        .not('recurrence_id', 'is', null)
        .gte('occurrence_date', today)
        .order('id')
        .range(from, to),
    ),
  ])
  if (error) throw error

  const bySeries = new Map<string, SeriesTransaction[]>()
  for (const row of upcoming) {
    const list = bySeries.get(row.recurrence_id as string) ?? []
    list.push({
      id: row.id as string,
      occurrenceDate: row.occurrence_date as string,
      type: row.type as TransactionType,
      status: row.status as TransactionStatus,
      date: row.date as string,
      accountId: row.account_id as string | null,
    })
    bySeries.set(row.recurrence_id as string, list)
  }

  const items = (data as RecurrenceRecord[]).map((record) => {
    const state = rowToSeries(record)
    return { ...state, nextDate: nextOccurrenceDate(bySeries.get(state.id) ?? [], today) }
  })
  const isActive = (item: RecurrenceItem) => item.endDate === null || item.endDate >= today
  return {
    active: sortRecurrenceItems(items.filter(isActive)),
    ended: items.filter((item) => !isActive(item)).sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '')),
  }
}
```

- [ ] **Step 4: Menu**

Em `components/layout/nav-items.ts`, importe `Repeat` de `lucide-react`, acrescente ao `NAV` (depois de `parcelas`):

```ts
  recorrencias: { href: '/recorrencias', label: 'Recorrências', icon: Repeat },
```

e troque `MORE_NAV` por:

```ts
export const MORE_NAV: NavItem[] = [NAV.parcelas, NAV.recorrencias, NAV.contas, NAV.imovel, NAV.relatorios, NAV.orcamento, NAV.configuracoes]
```

- [ ] **Step 5: Formulário de edição — `components/recurrences/recurrence-form.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { Segmented } from '@/components/form/segmented'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { endRecurrence, updateRecurrence } from '@/lib/actions/recurrences'
import { activeCategories, buildCategoryTree } from '@/lib/categories'
import { todayISO } from '@/lib/dates'
import {
  describeSchedule,
  FREQUENCY_LABELS,
  horizonDate,
  occurrenceDates,
  RECURRENCE_FREQUENCIES,
  type RecurrenceItem,
} from '@/lib/finance/recurrence'
import { applyActionErrors } from '@/lib/forms'
import { decodeSource, encodeSource } from '@/lib/transaction-mappers'
import { recurrenceFormResolver, toRecurrenceEditInput, type RecurrenceFormValues } from '@/lib/validation/recurrence'

const FREQUENCY_OPTIONS = RECURRENCE_FREQUENCIES.map((value) => ({ value, label: FREQUENCY_LABELS[value] }))
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Próxima data sugerida: a próxima não realizada ou, se não houver, a próxima data do calendário da série. */
function suggestedNextDate(item: RecurrenceItem, today: string): string {
  return item.nextDate ?? occurrenceDates({ ...item, endDate: null }, today, horizonDate(today))[0] ?? today
}

export function RecurrenceForm({ item, onDone }: { item: RecurrenceItem; onDone: () => void }) {
  const data = useTransactionFormData()
  const [today] = useState(() => todayISO())
  const [ending, startEnding] = useTransition()
  const form = useForm<RecurrenceFormValues>({
    resolver: recurrenceFormResolver,
    defaultValues: {
      type: item.type,
      amountCents: item.amountCents,
      description: item.description,
      categoryId: item.categoryId ?? '',
      accountId: item.accountId ?? '',
      creditCardId: item.creditCardId ?? '',
      destinationAccountId: item.destinationAccountId ?? '',
      frequency: item.frequency,
      nextDate: suggestedNextDate(item, today),
      endDate: item.endDate ?? '',
      notes: item.notes ?? '',
    },
  })
  const { errors, isSubmitting } = form.formState
  const [frequency, nextDate, endDate, accountId, creditCardId] = useWatch({
    control: form.control,
    name: ['frequency', 'nextDate', 'endDate', 'accountId', 'creditCardId'],
  })

  const kind = item.type === 'income' ? 'income' : 'expense'
  const tree = buildCategoryTree(
    activeCategories(data.categories).filter((category) => category.kind === kind || category.id === item.categoryId),
  )
  const accounts = data.accounts.filter((account) => !account.archived || account.id === item.accountId || account.id === item.destinationAccountId)
  const cards = item.type === 'expense' ? data.cards.filter((card) => !card.archived || card.id === item.creditCardId) : []

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateRecurrence(item.id, toRecurrenceEditInput(values))
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success('Recorrência atualizada.')
    onDone()
  })

  function end() {
    if (!window.confirm('Encerrar esta recorrência? Os lançamentos previstos depois de hoje serão excluídos; os já pagos ficam.')) return
    startEnding(async () => {
      const result = await endRecurrence(item.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Recorrência encerrada.')
      onDone()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-2" noValidate>
      <Field id="rec-amount" label="Valor" error={errors.amountCents?.message}>
        <Controller
          control={form.control}
          name="amountCents"
          render={({ field }) => (
            <MoneyInput
              id="rec-amount"
              valueCents={field.value}
              onChangeCents={field.onChange}
              aria-invalid={Boolean(errors.amountCents)}
              aria-describedby={errors.amountCents ? 'rec-amount-error' : undefined}
            />
          )}
        />
      </Field>

      <Field id="rec-description" label="Descrição" error={errors.description?.message}>
        <Input id="rec-description" autoComplete="off" aria-invalid={Boolean(errors.description)} {...form.register('description')} />
      </Field>

      {item.type === 'transfer' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="rec-account" label="De" error={errors.accountId?.message}>
            <NativeSelect id="rec-account" {...form.register('accountId')}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="rec-destination" label="Para" error={errors.destinationAccountId?.message}>
            <NativeSelect id="rec-destination" {...form.register('destinationAccountId')}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      ) : (
        <>
          <Field id="rec-category" label="Categoria" error={errors.categoryId?.message}>
            <NativeSelect id="rec-category" {...form.register('categoryId')}>
              <option value="" disabled>
                Escolha…
              </option>
              {tree.flatMap((node) => [
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>,
                ...node.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {`  ↳ ${child.name}`}
                  </option>
                )),
              ])}
            </NativeSelect>
          </Field>
          <Field id="rec-source" label="Pagar com" error={errors.accountId?.message}>
            <NativeSelect
              id="rec-source"
              value={encodeSource({ accountId, creditCardId })}
              onChange={(event) => {
                const source = decodeSource(event.target.value)
                form.setValue('accountId', source.accountId)
                form.setValue('creditCardId', source.creditCardId)
              }}
            >
              <optgroup label="Contas">
                {accounts.map((account) => (
                  <option key={account.id} value={`account:${account.id}`}>
                    {account.name}
                  </option>
                ))}
              </optgroup>
              {cards.length > 0 ? (
                <optgroup label="Cartões">
                  {cards.map((card) => (
                    <option key={card.id} value={`card:${card.id}`}>
                      {card.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </NativeSelect>
          </Field>
        </>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Frequência</p>
        <Segmented label="Frequência" value={frequency} options={FREQUENCY_OPTIONS} onChange={(value) => form.setValue('frequency', value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rec-next" label="Próxima data" error={errors.nextDate?.message}>
          <Input id="rec-next" type="date" min={today} aria-invalid={Boolean(errors.nextDate)} {...form.register('nextDate')} />
        </Field>
        <Field id="rec-end" label="Até (opcional)" error={errors.endDate?.message}>
          <Input id="rec-end" type="date" min={nextDate} aria-invalid={Boolean(errors.endDate)} {...form.register('endDate')} />
        </Field>
      </div>
      {ISO_DATE.test(nextDate) ? (
        <p className="-mt-3 text-sm text-muted-foreground">
          {describeSchedule({ frequency, startDate: nextDate, endDate: ISO_DATE.test(endDate) ? endDate : null })}. Vale para os
          lançamentos previstos de hoje em diante; os já pagos não mudam.
        </p>
      ) : null}

      <Field id="rec-notes" label="Observação" error={errors.notes?.message}>
        <textarea
          id="rec-notes"
          rows={2}
          className="w-full rounded-lg border border-input bg-surface-2 px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          {...form.register('notes')}
        />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting || ending}>
          {isSubmitting ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="outline" className="text-expense" onClick={end} disabled={isSubmitting || ending}>
          Encerrar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 6: Lista — `components/recurrences/recurrence-list.tsx`**

```tsx
'use client'

import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { CategoryIcon } from '@/components/categories/category-icon'
import { QuickAddButton } from '@/components/layout/quick-add'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { formatISODateBR } from '@/lib/dates'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import { describeSchedule, type RecurrenceItem } from '@/lib/finance/recurrence'
import { cn } from '@/lib/utils'
import { RecurrenceForm } from './recurrence-form'

function useLabels() {
  const data = useTransactionFormData()
  const accounts = new Map(data.accounts.map((account) => [account.id, account.name]))
  const cards = new Map(data.cards.map((card) => [card.id, card.name]))
  const categories = new Map(data.categories.map((category) => [category.id, category]))
  return {
    source(item: RecurrenceItem) {
      if (item.type === 'transfer') return `${accounts.get(item.accountId ?? '') ?? '?'} → ${accounts.get(item.destinationAccountId ?? '') ?? '?'}`
      return item.creditCardId ? (cards.get(item.creditCardId) ?? '?') : (accounts.get(item.accountId ?? '') ?? '?')
    },
    category: (item: RecurrenceItem) => (item.categoryId ? categories.get(item.categoryId) : undefined),
  }
}

function Amount({ item }: { item: RecurrenceItem }) {
  if (item.type === 'transfer') return <span className="shrink-0 font-medium tabular-nums">{formatBRL(item.amountCents)}</span>
  const income = item.type === 'income'
  return (
    <span className={cn('shrink-0 font-medium tabular-nums', income ? 'text-income' : 'text-expense')}>
      {formatSignedBRL(income ? item.amountCents : -item.amountCents)}
    </span>
  )
}

function Row({ item, detail }: { item: RecurrenceItem; detail: string }) {
  const labels = useLabels()
  const category = labels.category(item)
  return (
    <span className="flex w-full items-center gap-3">
      {item.type === 'transfer' ? (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
          <ArrowLeftRight className="size-4" />
        </span>
      ) : (
        <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.description}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {describeSchedule(item)} · {labels.source(item)}
        </span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Amount item={item} />
    </span>
  )
}

export function RecurrenceList({ active, ended }: { active: RecurrenceItem[]; ended: RecurrenceItem[] }) {
  const [editing, setEditing] = useState<RecurrenceItem | null>(null)

  return (
    <>
      {active.length === 0 ? (
        <div className="space-y-4 rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          <p>Nenhuma recorrência ativa. Ao lançar, escolha “Repetir” para o app gerar os próximos lançamentos sozinho.</p>
          <div className="mx-auto max-w-xs">
            <QuickAddButton />
          </div>
        </div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {active.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="w-full rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-2"
              >
                <Row item={item} detail={item.nextDate ? `Próxima: ${formatISODateBR(item.nextDate)}` : 'Nenhuma prevista'} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {ended.length > 0 ? (
        <details className="mt-6 rounded-xl border border-border bg-surface p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Encerradas ({ended.length})</summary>
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {ended.map((item) => (
              <li key={item.id} className="opacity-80">
                <Row item={item} detail={`Encerrada em ${formatISODateBR(item.endDate ?? item.startDate)}`} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ResponsiveModal
        open={editing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditing(null)
        }}
        title="Editar recorrência"
      >
        {editing ? <RecurrenceForm key={editing.id} item={editing} onDone={() => setEditing(null)} /> : null}
      </ResponsiveModal>
    </>
  )
}
```

- [ ] **Step 7: Página — `app/(app)/recorrencias/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { RecurrenceList } from '@/components/recurrences/recurrence-list'
import { todayISO } from '@/lib/dates'
import { listRecurrences } from '@/lib/recurrences'

export const metadata: Metadata = { title: 'Recorrências' }

export default async function RecurrencesPage() {
  const { active, ended } = await listRecurrences(todayISO())
  return (
    <>
      <PageHeader title="Recorrências" />
      <RecurrenceList active={active} ended={ended} />
    </>
  )
}
```

- [ ] **Step 8: Verifique**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tudo passando; a rota `/recorrencias` aparece na saída do build.

- [ ] **Step 9: Commit**

```bash
git add lib/finance/recurrence.ts lib/finance/recurrence.test.ts lib/recurrences.ts components/recurrences components/layout/nav-items.ts "app/(app)/recorrencias"
git commit -m "feat(recorrencias): tela com séries ativas e encerradas, edição e encerrar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tela Orçamento

**Files:**
- Create: `lib/budgets.ts`, `lib/actions/budgets.ts`
- Create: `components/budgets/budget-bar.tsx`, `components/budgets/budget-form.tsx`, `components/budgets/budget-list.tsx`
- Modify: `app/(app)/orcamento/page.tsx`

**Interfaces:**
- Consumes: Task 3 (`BudgetRow`, `BudgetLine`, `BudgetProgress`, `BudgetMode`, `budgetChange`, `categorySpending`, `buildBudgetLines`, `budgetTotals`), Task 4 (`budgetChangeArgs`), Task 5 (`budgetSchema`); `listCategories`; `PageHeader` com seletor de mês; `resolveYearMonth`, `monthBounds`.
- Produces: `getBudgetMonth(ym, today): Promise<{ month: string; lines: BudgetLine[]; totals: { budgetedCents; realizedCents; plannedCents } }>` (server-only); `setBudget(input): Promise<ActionResult>`; tela `/orcamento`.

- [ ] **Step 1: Consulta — `lib/budgets.ts`**

```ts
import 'server-only'
import { listCategories } from '@/lib/categories-query'
import { monthBounds, type YearMonth } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import { budgetTotals, buildBudgetLines, categorySpending, type BudgetLine, type BudgetRow } from '@/lib/finance/budget'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

export type BudgetMonth = { month: string; lines: BudgetLine[]; totals: ReturnType<typeof budgetTotals> }

/** Linhas do orçamento do mês: limites até o mês, categorias e despesas do mês. */
export async function getBudgetMonth(ym: YearMonth, today: string): Promise<BudgetMonth> {
  const supabase = await createClient()
  const { start, end } = monthBounds(ym)
  const [categories, budgets, expenses] = await Promise.all([
    listCategories(),
    fetchAllPages((from, to) =>
      supabase.from('budgets').select('id, category_id, month, amount_cents, repeats').lte('month', start).order('id').range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('transactions')
        .select('id, type, status, date, account_id, amount_cents, category_id')
        .eq('type', 'expense')
        .gte('date', start)
        .lt('date', end)
        .order('id')
        .range(from, to),
    ),
  ])

  const rows: BudgetRow[] = budgets.map((row) => ({
    categoryId: row.category_id as string,
    month: row.month as string,
    amountCents: Number(row.amount_cents),
    repeats: row.repeats as boolean,
  }))
  const spending = categorySpending(
    expenses.map((row) => ({
      type: row.type as TransactionType,
      status: row.status as TransactionStatus,
      date: row.date as string,
      accountId: row.account_id as string | null,
      amountCents: Number(row.amount_cents),
      categoryId: row.category_id as string | null,
    })),
    categories,
    start,
    today,
  )
  const lines = buildBudgetLines(categories, rows, spending, start)
  return { month: start, lines, totals: budgetTotals(lines) }
}
```

- [ ] **Step 2: Action — `lib/actions/budgets.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { budgetChange, type BudgetRow } from '@/lib/finance/budget'
import { budgetChangeArgs } from '@/lib/recurrence-rpc'
import { translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { budgetSchema } from '@/lib/validation/budget'

/** Define (ou remove, com 0) o limite do mês: "só este mês" ou "a partir deste mês". */
export async function setBudget(input: unknown): Promise<ActionResult> {
  const parsed = budgetSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const { categoryId, month, amountCents, mode } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.from('budgets').select('category_id, month, amount_cents, repeats').eq('category_id', categoryId)
  if (error) return { ok: false, error: translateError(error) }

  const rows: BudgetRow[] = data.map((row) => ({
    categoryId: row.category_id,
    month: row.month,
    amountCents: Number(row.amount_cents),
    repeats: row.repeats,
  }))
  const { error: rpcError } = await supabase.rpc('apply_budget_change', budgetChangeArgs(categoryId, budgetChange(rows, categoryId, month, amountCents, mode)))
  if (rpcError) return { ok: false, error: translateError(rpcError) }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}
```

- [ ] **Step 3: Barra em dois tons — `components/budgets/budget-bar.tsx`**

```tsx
import type { BudgetProgress } from '@/lib/finance/budget'
import type { UsageLevel } from '@/lib/finance/card'
import { cn } from '@/lib/utils'

const FILL: Record<UsageLevel, string> = { ok: 'bg-primary', warning: 'bg-warning', over: 'bg-expense' }

/** Realizado em cor cheia e previsto em tom claro; o percentual vai em texto ao lado (não só pela cor). */
export function BudgetBar({ progress, label }: { progress: BudgetProgress; label: string }) {
  const realized = Math.min(progress.realizedRatio * 100, 100)
  const planned = Math.min(progress.plannedRatio * 100, 100 - realized)
  const percent = Math.round(progress.ratio * 100)
  return (
    <div
      className="flex h-2 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
      aria-valuetext={`${percent}% do limite`}
    >
      <div className={cn('h-full', FILL[progress.level])} style={{ width: `${realized}%` }} />
      <div className={cn('h-full opacity-40', FILL[progress.level])} style={{ width: `${planned}%` }} />
    </div>
  )
}
```

- [ ] **Step 4: Modal do limite — `components/budgets/budget-form.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { Segmented } from '@/components/form/segmented'
import { Button } from '@/components/ui/button'
import { setBudget } from '@/lib/actions/budgets'
import { formatYearMonthLabel, yearMonthOfISO } from '@/lib/dates'
import type { BudgetLine, BudgetMode } from '@/lib/finance/budget'

const MODE_OPTIONS = [
  { value: 'from', label: 'A partir deste mês' },
  { value: 'only', label: 'Só este mês' },
] as const

export function BudgetForm({ line, month, onDone }: { line: BudgetLine; month: string; onDone: () => void }) {
  const [amountCents, setAmountCents] = useState(line.limitCents ?? 0)
  const [mode, setMode] = useState<BudgetMode>('from')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const monthLabel = formatYearMonthLabel(yearMonthOfISO(month)).toLowerCase()

  function save(value: number) {
    startTransition(async () => {
      const result = await setBudget({ categoryId: line.categoryId, month, amountCents: value, mode })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(value === 0 ? 'Limite removido.' : 'Limite salvo.')
      onDone()
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (amountCents <= 0) {
      setError('Informe um valor maior que zero ou use “Remover limite”.')
      return
    }
    setError(null)
    save(amountCents)
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-2" noValidate>
      <Field id="budget-amount" label={`Limite de ${line.name}`} error={error ?? undefined}>
        <MoneyInput
          id="budget-amount"
          autoFocus
          valueCents={amountCents}
          onChangeCents={setAmountCents}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'budget-amount-error' : undefined}
        />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Aplicar</p>
        <Segmented label="Aplicar" value={mode} options={MODE_OPTIONS} onChange={setMode} />
        <p className="text-sm text-muted-foreground">
          {mode === 'from' ? `Vale de ${monthLabel} em diante, até você mudar.` : `Vale só para ${monthLabel}.`}
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        {line.limitCents !== null ? (
          <Button type="button" variant="outline" className="text-expense" disabled={pending} onClick={() => save(0)}>
            Remover limite
          </Button>
        ) : null}
      </div>
    </form>
  )
}
```

- [ ] **Step 5: Lista e resumo — `components/budgets/budget-list.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { CategoryIcon } from '@/components/categories/category-icon'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import type { BudgetLine } from '@/lib/finance/budget'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { BudgetBar } from './budget-bar'
import { BudgetForm } from './budget-form'

type Totals = { budgetedCents: number; realizedCents: number; plannedCents: number }

function Summary({ totals }: { totals: Totals }) {
  const items = [
    { label: 'Orçado', value: totals.budgetedCents },
    { label: 'Realizado', value: totals.realizedCents },
    { label: 'Previsto', value: totals.plannedCents },
  ]
  return (
    <dl className="mb-6 grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="truncate text-right font-semibold tabular-nums sm:text-lg">{formatBRL(item.value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function detailText(line: BudgetLine): string {
  const { realizedCents, plannedCents } = line.spending
  if (line.limitCents === null) return `${formatBRL(realizedCents + plannedCents)} no mês`
  const planned = plannedCents > 0 ? ` + ${formatBRL(plannedCents)} previstos` : ''
  return `${formatBRL(realizedCents)} gastos${planned} de ${formatBRL(line.limitCents)}`
}

function LevelBadge({ line }: { line: BudgetLine }) {
  if (!line.progress || line.progress.level === 'ok') return null
  const over = line.progress.level === 'over'
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', over ? 'bg-expense/15 text-expense' : 'bg-warning/15 text-warning')}>
      {over ? 'Estourado' : 'Atenção'}
    </span>
  )
}

export function BudgetList({ lines, totals, month }: { lines: BudgetLine[]; totals: Totals; month: string }) {
  const [editing, setEditing] = useState<BudgetLine | null>(null)

  return (
    <>
      <Summary totals={totals} />
      {lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          Nenhuma categoria de despesa ativa. Crie uma em Configurações → Categorias.
        </div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {lines.map((line) => (
            <li key={line.categoryId}>
              <button
                type="button"
                onClick={() => setEditing(line)}
                className="w-full space-y-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center gap-3">
                  <CategoryIcon name={line.icon} color={line.color} />
                  <span className="min-w-0 flex-1 truncate font-medium">{line.name}</span>
                  <LevelBadge line={line} />
                  {line.progress ? (
                    <span className="shrink-0 text-sm tabular-nums">{Math.round(line.progress.ratio * 100)}%</span>
                  ) : (
                    <span className="shrink-0 text-sm text-primary">Definir limite</span>
                  )}
                </span>
                {line.progress ? <BudgetBar progress={line.progress} label={`Orçamento de ${line.name}`} /> : null}
                <span className="block text-xs text-muted-foreground tabular-nums">{detailText(line)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveModal
        open={editing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditing(null)
        }}
        title={editing?.limitCents === null ? 'Definir limite' : 'Editar limite'}
      >
        {editing ? <BudgetForm key={editing.categoryId} line={editing} month={month} onDone={() => setEditing(null)} /> : null}
      </ResponsiveModal>
    </>
  )
}
```

- [ ] **Step 6: Página — `app/(app)/orcamento/page.tsx`**

Substitua o conteúdo (era o placeholder):

```tsx
import type { Metadata } from 'next'
import { BudgetList } from '@/components/budgets/budget-list'
import { PageHeader } from '@/components/layout/page-header'
import { getBudgetMonth } from '@/lib/budgets'
import { resolveYearMonth, todayISO } from '@/lib/dates'

export const metadata: Metadata = { title: 'Orçamento' }

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  const { mes } = await searchParams
  const ym = resolveYearMonth(mes)
  const { month, lines, totals } = await getBudgetMonth(ym, todayISO())
  return (
    <>
      <PageHeader title="Orçamento" ym={ym} basePath="/orcamento" />
      <BudgetList lines={lines} totals={totals} month={month} />
    </>
  )
}
```

- [ ] **Step 7: Verifique**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tudo passando.

- [ ] **Step 8: Commit**

```bash
git add lib/budgets.ts lib/actions/budgets.ts components/budgets "app/(app)/orcamento/page.tsx"
git commit -m "feat(orcamento): limite por categoria com realizado e previsto, alertas e só este mês / a partir deste mês

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README, verificação final e parada para revisão

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

Troque o título `## Funcionalidades (até a Fase 3)` por `## Funcionalidades (até a Fase 4)` e acrescente, antes da linha "Contas, categorias e cartões com lançamentos não podem ser excluídos, só arquivados.":

```markdown
- **Recorrências** (botão "+", "Repetir"): semanal, mensal ou anual, com data final opcional, em conta, transferência ou compra à vista no cartão. O app gera os lançamentos como previstos até 12 meses à frente ao ser aberto; no cartão, cada um cai na fatura certa e só ocupa o limite quando a data chega. Editar ou excluir um lançamento da série pergunta "só este" ou "este e os próximos" (os já pagos nunca mudam), com "Desfazer".
- **Tela Recorrências** (`/recorrencias`): séries ativas com a próxima data, edição (valor, conta/cartão, frequência, próxima data, data final) e encerrar; encerradas ficam numa lista à parte.
- **Orçamento** (`/orcamento`): limite mensal por categoria de despesa (subcategorias somam na mãe), "a partir deste mês" ou "só este mês". A barra mostra realizado e previsto; alerta "Atenção" em 80% e "Estourado" em 100%.
```

e acrescente ao fim da linha sobre arquivar: ` Conta, cartão ou categoria usados por uma recorrência ativa só são arquivados depois de encerrar a recorrência.`

- [ ] **Step 2: Verificação completa**

Run: `npm test && npm run test:rls && npm run lint && npm run build`
Expected: tudo passando. Anote os números (testes unitários e de RLS) para o resumo da fase.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README com as funcionalidades da Fase 4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Pare para revisão**

A Fase 4 termina aqui (PRD seção 10: parar ao fim de cada fase). Entregue ao usuário o checklist manual dos critérios de aceite da spec (seção 6), para testar em 360px e 1440px:

1. "Aluguel R$ 2.000, mensal, dia 10" cria o lançamento e os previstos até 12 meses; recarregar não duplica.
2. Série mensal no dia 31 aparece em 28/02 (ou 29/02) e volta a 31/03.
3. Assinatura mensal no cartão cai em cada fatura pela regra 8.2 e só ocupa o limite quando a data chega.
4. "Este e os próximos" muda os previstos dali em diante e não toca nos pagos; "só este" muda só aquele.
5. Excluir "este e os próximos" encerra a série e o "Desfazer" devolve tudo.
6. Encerrar pela tela Recorrências apaga os previstos futuros e a move para "Encerradas".
7. Mercado R$ 1.500 com R$ 900 realizados e R$ 400 previstos mostra 87% e "Atenção"; acima de 100%, "Estourado".
8. Limite "a partir de outubro" vale em novembro e dezembro; "só dezembro" não muda janeiro.
9. Gasto numa subcategoria conta no orçamento da categoria-mãe.
10. Sem rolagem horizontal em 360px; aproveita a largura em 1440px.
