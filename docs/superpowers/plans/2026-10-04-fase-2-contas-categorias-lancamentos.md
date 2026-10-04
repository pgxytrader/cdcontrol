# Fase 2 — Contas, categorias e lançamentos: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contas com saldo e extrato, categorias com subcategorias e as 19 padrão, e lançamentos de receita, despesa e transferência com formulário rápido, lista do mês, busca e filtros.

**Architecture:** Migration nova cria `accounts`, `categories`, `transactions` (RLS por casa + triggers de integridade) e a view `v_account_balances` (security_invoker). Regras puras em `lib/finance/` e `lib/` (saldo, extrato, resumo, máscara de valor, filtros, agrupamento) cobertas por Vitest; a view é conferida contra `accountBalance` num teste de integração. Server Actions em `lib/actions/` para mutações; consultas server-only em `lib/*.ts`; o formulário de lançamento recebe contas/categorias por um Context preenchido no layout de `(app)`.

**Tech Stack:** Next.js 16.3 (App Router), React 19.2, TypeScript strict, Tailwind 4, shadcn (Radix), lucide-react, Supabase (@supabase/ssr 0.12, supabase-js 2.117), zod 4, react-hook-form 7, date-fns 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-04-fase-2-contas-categorias-lancamentos-design.md` (base: `docs/PRD.md`; Fase 1: `docs/superpowers/specs/2026-10-04-fase-1-fundacao-design.md`)

## Global Constraints

- Texto da interface em pt-BR; datas dd/mm/aaaa; fuso `America/Sao_Paulo`; moeda BRL.
- Valores sempre inteiros em centavos (`*_cents`, `amountCents`); conversão para reais só na exibição.
- Datas de calendário trafegam como string `AAAA-MM-DD`; nunca `new Date('AAAA-MM-DD')` para exibir (desloca o fuso) — use `formatISODateBR`/`formatDayHeading`.
- Toda tabela nova: `household_id not null references households on delete cascade`, RLS + policy `public.is_household_member(household_id)`, `revoke all ... from anon`.
- FKs entre `transactions`/`categories`/`accounts` usam o padrão `NO ACTION` (não `RESTRICT`): mesmo efeito para o usuário (23503 ao excluir com vínculo) e permite apagar a casa inteira em cascata.
- Mudanças de schema só via `supabase/migrations/`; depois de aplicar, `npm run db:types`.
- Receita/despesa nunca diferenciadas só pela cor: sinal `+`/`−` ou ícone.
- Mobile-first: sem rolagem horizontal em 360px; desktop até `max-w-[1280px]`; valores com `tabular-nums` à direita.
- Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; secret key só em `.env.test.local`.
- Comandos via Bash tool (Git Bash) a partir de `gusfer/`; não redirecionar com `>` no PowerShell.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Componentes shadcn são Radix (`asChild`); `cn` vem de `@/lib/utils`.

## Review Focus

1. Parâmetros de URL adulterados em `/lancamentos` (`tipo=xyz`, `tipo=constructor`, `conta=nao-uuid`, `categoria=' or 1=1`) devem ser ignorados e a página renderizar normalmente. Teste no Task 4 (`parseTransactionsQuery`).
2. Busca com `%`, `_` ou `\` deve procurar o caractere literal, não agir como curinga. Teste no Task 4 (`escapeLike`).
3. Datas de calendário `AAAA-MM-DD` exibidas sem deslocamento de fuso (`2026-10-04` → `04/10/2026`, nunca `03/10`). Teste no Task 1 (`formatISODateBR`, `formatDayHeading`).
4. Valor digitado ou colado com letras, "R$", mais de 11 dígitos ou apagando caracteres deve produzir centavos estáveis, nunca `NaN`. Teste no Task 1 (`maskCurrencyInput`).
5. Editar um lançamento trocando o tipo (despesa → transferência e vice-versa) não pode deixar categoria ou conta de destino antigas na linha. Teste no Task 3 (`inputToRow`).

---

## Mapa de arquivos

```
supabase/migrations/20261004130000_contas_categorias_lancamentos.sql   Task 5
tests/rls/helpers.ts                         Task 5   contexto de usuários de teste
tests/rls/finance.rls.test.ts                Task 5
lib/
  dates.ts (+test)                           Task 1   todayISO, monthBounds, addDaysISO, yearMonthOfISO, formatISODateBR, formatDayHeading
  finance/types.ts                           Task 1   LedgerAccount, LedgerTransaction, TransactionType, TransactionStatus
  finance/status.ts (+test)                  Task 1   defaultStatus
  finance/currency-input.ts (+test)          Task 1   maskCurrencyInput, formatCentsPlain
  finance/money.ts (+test)                   Task 1   + formatSignedBRL
  finance/balance.ts (+test)                 Task 2   transactionDelta, accountBalance, buildStatement
  finance/summary.ts (+test)                 Task 2   summarizeMonth
  categories.ts (+test)                      Task 2   tipos, paleta, ícones, padrão, árvore, ranking, chips
  validation/common.ts                       Task 3   isoDateSchema, uuidSchema
  validation/account.ts (+test)              Task 3
  validation/category.ts (+test)             Task 3
  validation/transaction.ts (+test)          Task 3   schema, toTransactionInput, transactionFormResolver, snapshot
  transaction-mappers.ts (+test)             Task 3   TransactionRow, rowToLedger, rowToInput, rowToFormValues, inputToRow, pickDefaultAccountId
  transaction-filters.ts (+test)             Task 4   parseTransactionsQuery, filterParams, buildTransactionsHref, escapeLike
  transaction-grouping.ts (+test)            Task 4   groupByDay, groupByMonth, splitPending
  supabase/errors.ts (+test)                 Task 5   novos códigos
  supabase/database.types.ts                 Task 5   regenerado
  categories-query.ts                        Task 6/8 listCategories, topCategoryIds (server-only)
  accounts.ts                                Task 7   listAccounts, getAccount, toLedgerAccount (server-only)
  transactions.ts                            Task 7/9 listAccountTransactions, listMonthTransactions, searchTransactions (server-only)
  profile.ts                                 Task 8   + last_account_id
  actions/categories.ts                      Task 6
  actions/accounts.ts                        Task 7
  actions/transactions.ts                    Task 8
components/
  form/native-select.tsx                     Task 6
  form/color-picker.tsx                      Task 6
  form/money-input.tsx                       Task 7
  form/segmented.tsx                         Task 8
  layout/responsive-modal.tsx                Task 6   Dialog (≥1024px) ou bottom Sheet
  layout/month-selector.tsx                  Task 9   + extraParams
  layout/page-header.tsx                     Task 9   + extraParams
  layout/quick-add.tsx                       Task 8   reescrito: QuickAddFab, QuickAddButton
  layout/bottom-nav.tsx, sidebar.tsx         Task 8   novos imports
  categories/category-icon.tsx               Task 6
  categories/category-form.tsx               Task 6
  categories/category-row-actions.tsx        Task 6
  accounts/account-type-icon.tsx             Task 7
  accounts/account-form.tsx                  Task 7   AccountForm + AccountFormButton
  accounts/account-actions.tsx               Task 7
  accounts/statement-list.tsx                Task 7
  transactions/form-data-context.tsx         Task 8
  transactions/transaction-form.tsx          Task 8
  transactions/transaction-modal.tsx         Task 8
  transactions/transaction-item.tsx          Task 9
  transactions/transaction-list.tsx          Task 9
  transactions/month-summary.tsx             Task 9
  transactions/transactions-toolbar.tsx      Task 9
app/(app)/
  layout.tsx                                 Task 8   provider dos dados do formulário
  configuracoes/page.tsx                     Task 6   link para categorias
  configuracoes/categorias/page.tsx          Task 6
  contas/page.tsx                            Task 7   substitui placeholder
  contas/[id]/page.tsx                       Task 7
  lancamentos/page.tsx                       Task 9   substitui placeholder
README.md                                    Task 10
```

---

### Task 1: Datas, status padrão e máscara de valor

**Files:**
- Create: `lib/finance/types.ts`, `lib/finance/status.ts`, `lib/finance/status.test.ts`, `lib/finance/currency-input.ts`, `lib/finance/currency-input.test.ts`
- Modify: `lib/dates.ts`, `lib/dates.test.ts`, `lib/finance/money.ts`, `lib/finance/money.test.ts`

**Interfaces:**
- Consumes: `TIME_ZONE`, `YearMonth`, `formatYearMonthParam`, `shiftYearMonth` (já em `lib/dates.ts`); `formatBRL` (já em `lib/finance/money.ts`)
- Produces:
  - `lib/finance/types.ts`: `type TransactionType = 'income' | 'expense' | 'transfer'`, `type TransactionStatus = 'paid' | 'pending'`, `type LedgerAccount = { id: string; initialBalanceCents: number; initialBalanceDate: string }`, `type LedgerTransaction = { id: string; type: TransactionType; amountCents: number; date: string; status: TransactionStatus; accountId: string; destinationAccountId: string | null; createdAt: string }`
  - `lib/dates.ts`: `todayISO(now?: Date): string`, `monthBounds(ym: YearMonth): { start: string; end: string }`, `addDaysISO(iso: string, days: number): string`, `yearMonthOfISO(iso: string): YearMonth`, `formatISODateBR(iso: string): string`, `formatDayHeading(iso: string): string`
  - `defaultStatus(date: string, today: string): TransactionStatus`
  - `maskCurrencyInput(raw: string): { display: string; cents: number }`, `formatCentsPlain(cents: number): string`
  - `formatSignedBRL(cents: number): string`

- [ ] **Step 1: Escrever os testes que devem falhar**

Acrescente ao fim de `lib/dates.test.ts` (e inclua os novos nomes no `import` do topo: `addDaysISO, formatDayHeading, formatISODateBR, monthBounds, todayISO, yearMonthOfISO`):
```ts
describe('datas de calendário (AAAA-MM-DD)', () => {
  it('todayISO usa o fuso de São Paulo', () => {
    // 02:30 UTC de 05/10 = 23:30 de 04/10 em São Paulo
    expect(todayISO(new Date('2026-10-05T02:30:00Z'))).toBe('2026-10-04')
    expect(todayISO(new Date('2026-10-05T03:30:00Z'))).toBe('2026-10-05')
  })

  it('monthBounds devolve [início, início do mês seguinte)', () => {
    expect(monthBounds({ year: 2026, month: 10 })).toEqual({ start: '2026-10-01', end: '2026-11-01' })
    expect(monthBounds({ year: 2026, month: 12 })).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })

  it('addDaysISO atravessa meses e anos', () => {
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-10-04', -90)).toBe('2026-07-06')
  })

  it('yearMonthOfISO extrai ano e mês', () => {
    expect(yearMonthOfISO('2026-03-15')).toEqual({ year: 2026, month: 3 })
  })

  it('formatISODateBR não desloca o fuso', () => {
    expect(formatISODateBR('2026-10-04')).toBe('04/10/2026')
    expect(formatISODateBR('2027-01-01')).toBe('01/01/2027')
  })

  it('formatDayHeading escreve o dia por extenso', () => {
    expect(formatDayHeading('2026-10-04')).toBe('Domingo, 4 de outubro')
    expect(formatDayHeading('2026-03-02')).toBe('Segunda-feira, 2 de março')
  })
})
```

`lib/finance/status.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { defaultStatus } from './status'

describe('defaultStatus', () => {
  it('hoje ou passado é pago', () => {
    expect(defaultStatus('2026-10-04', '2026-10-04')).toBe('paid')
    expect(defaultStatus('2026-09-30', '2026-10-04')).toBe('paid')
  })

  it('futuro é pendente', () => {
    expect(defaultStatus('2026-10-05', '2026-10-04')).toBe('pending')
    expect(defaultStatus('2027-01-01', '2026-12-31')).toBe('pending')
  })
})
```

`lib/finance/currency-input.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatCentsPlain, maskCurrencyInput } from './currency-input'

describe('maskCurrencyInput', () => {
  it.each([
    ['', '', 0],
    ['1', '0,01', 1],
    ['12', '0,12', 12],
    ['1234', '12,34', 1234],
    ['123456789', '1.234.567,89', 123456789],
    ['0001', '0,01', 1],
    ['000', '', 0],
  ])('digitar %j mostra %j (%i centavos)', (raw, display, cents) => {
    expect(maskCurrencyInput(raw)).toEqual({ display, cents })
  })

  it('apagar o último caractere desloca para a direita', () => {
    // o usuário tinha "12,34" e apagou o "4"
    expect(maskCurrencyInput('12,3')).toEqual({ display: '1,23', cents: 123 })
  })

  it('ignora letras e símbolos ao colar', () => {
    expect(maskCurrencyInput('R$ 1.234,56')).toEqual({ display: '1.234,56', cents: 123456 })
    expect(maskCurrencyInput('abc')).toEqual({ display: '', cents: 0 })
    expect(maskCurrencyInput('12a3')).toEqual({ display: '1,23', cents: 123 })
  })

  it('limita a 11 dígitos', () => {
    expect(maskCurrencyInput('999999999999')).toEqual({ display: '999.999.999,99', cents: 99999999999 })
  })
})

describe('formatCentsPlain', () => {
  it('formata sem o símbolo da moeda', () => {
    expect(formatCentsPlain(0)).toBe('0,00')
    expect(formatCentsPlain(123456)).toBe('1.234,56')
  })
})
```

Acrescente a `lib/finance/money.test.ts` (inclua `formatSignedBRL` no import):
```ts
describe('formatSignedBRL', () => {
  it('mostra o sinal explícito', () => {
    expect(plain(formatSignedBRL(1050))).toBe('+ R$ 10,50')
    expect(plain(formatSignedBRL(-1050))).toBe('− R$ 10,50')
    expect(plain(formatSignedBRL(0))).toBe('R$ 0,00')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run lib/dates.test.ts lib/finance`
Expected: FAIL — funções novas não exportadas e módulos `./status` e `./currency-input` inexistentes.

- [ ] **Step 3: Implementar**

`lib/finance/types.ts`:
```ts
export type TransactionType = 'income' | 'expense' | 'transfer'
export type TransactionStatus = 'paid' | 'pending'

export type LedgerAccount = {
  id: string
  initialBalanceCents: number
  initialBalanceDate: string
}

export type LedgerTransaction = {
  id: string
  type: TransactionType
  amountCents: number
  date: string
  status: TransactionStatus
  accountId: string
  destinationAccountId: string | null
  createdAt: string
}
```

`lib/finance/status.ts`:
```ts
import type { TransactionStatus } from './types'

/** Status sugerido para um lançamento novo: hoje ou passado → pago; futuro → pendente. */
export function defaultStatus(date: string, today: string): TransactionStatus {
  return date <= today ? 'paid' : 'pending'
}
```

`lib/finance/currency-input.ts`:
```ts
const MAX_DIGITS = 11

const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1.234,56" (sem "R$"). */
export function formatCentsPlain(cents: number): string {
  return plain.format(cents / 100)
}

/**
 * Máscara de valor em que os dígitos entram pela direita ("1234" → "12,34").
 * Ignora qualquer caractere que não seja dígito e limita a 11 dígitos.
 */
export function maskCurrencyInput(raw: string): { display: string; cents: number } {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS)
  if (digits === '') return { display: '', cents: 0 }
  const cents = Number(digits)
  return { display: formatCentsPlain(cents), cents }
}
```

Acrescente a `lib/finance/money.ts`:
```ts
/** Valor com sinal explícito: "+ R$ 10,50", "− R$ 10,50" (U+2212) ou "R$ 0,00". */
export function formatSignedBRL(cents: number): string {
  if (cents === 0) return formatBRL(0)
  return `${cents > 0 ? '+' : '−'} ${formatBRL(Math.abs(cents))}`
}
```

Acrescente a `lib/dates.ts`:
```ts
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
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test`
Expected: PASS em todos os arquivos.

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/dates.test.ts lib/finance
git commit -m "feat(finance): datas de calendário, status padrão e máscara de valor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Saldo, extrato, resumo do mês e regras de categorias

**Files:**
- Create: `lib/finance/balance.ts`, `lib/finance/balance.test.ts`, `lib/finance/summary.ts`, `lib/finance/summary.test.ts`, `lib/categories.ts`, `lib/categories.test.ts`

**Interfaces:**
- Consumes: `LedgerAccount`, `LedgerTransaction`, `TransactionStatus`, `TransactionType` (Task 1); `monthBounds`, `YearMonth` (Task 1 / `lib/dates.ts`)
- Produces:
  - `transactionDelta(tx: LedgerTransaction, accountId: string): number`
  - `accountBalance(account: LedgerAccount, transactions: LedgerTransaction[]): number`
  - `type StatementRow<T> = { transaction: T; deltaCents: number; runningCents: number | null }`
  - `type Statement<T> = { openingCents: number; rows: StatementRow<T>[]; closingCents: number; beforeInitialDate: boolean }`
  - `buildStatement<T extends LedgerTransaction>(account: LedgerAccount, transactions: T[], ym: YearMonth): Statement<T>`
  - `type MonthSummary = { income: { paid: number; pending: number }; expense: { paid: number; pending: number }; balancePaid: number; balanceProjected: number }`
  - `summarizeMonth(transactions: Pick<LedgerTransaction, 'type' | 'status' | 'amountCents'>[]): MonthSummary`
  - `lib/categories.ts`: `type CategoryKind`, `type Category`, `type CategoryNode`, `COLOR_PALETTE`, `type PaletteColor`, `COLOR_LABELS`, `CATEGORY_ICONS`, `type CategoryIconName`, `DEFAULT_CATEGORIES`, `rankCategories(ids: (string | null)[], limit: number): string[]`, `buildCategoryTree(categories: Category[]): CategoryNode[]`, `activeCategories(categories: Category[]): Category[]`, `expandCategoryFilter(categoryId: string, categories: Category[]): string[]`, `chipCategories(candidates: Category[], topIds: string[], limit: number): Category[]`

- [ ] **Step 1: Escrever os testes que devem falhar**

`lib/finance/balance.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { accountBalance, buildStatement, transactionDelta } from './balance'
import type { LedgerAccount, LedgerTransaction } from './types'

const account: LedgerAccount = { id: 'a1', initialBalanceCents: 100_000, initialBalanceDate: '2026-09-01' }

let seq = 0
function tx(partial: Partial<LedgerTransaction>): LedgerTransaction {
  seq += 1
  return {
    id: `t${seq}`,
    type: 'expense',
    amountCents: 1000,
    date: '2026-09-10',
    status: 'paid',
    accountId: 'a1',
    destinationAccountId: null,
    createdAt: `2026-09-01T00:00:${String(seq).padStart(2, '0')}Z`,
    ...partial,
  }
}

let scenario: LedgerTransaction[]

beforeEach(() => {
  seq = 0
  scenario = [
    tx({ type: 'income', amountCents: 50_000, date: '2026-09-05' }),
    tx({ type: 'expense', amountCents: 20_000, date: '2026-09-10' }),
    tx({ type: 'expense', amountCents: 5_000, date: '2026-09-12', status: 'pending' }),
    tx({ type: 'expense', amountCents: 7_000, date: '2026-08-20' }), // antes do saldo inicial
    tx({ type: 'transfer', amountCents: 10_000, date: '2026-09-15', destinationAccountId: 'a2' }),
    tx({ type: 'transfer', amountCents: 3_000, date: '2026-09-20', accountId: 'a2', destinationAccountId: 'a1' }),
    tx({ type: 'expense', amountCents: 999, date: '2026-09-25', accountId: 'a2' }), // outra conta
  ]
})

describe('transactionDelta', () => {
  it('dá o efeito do lançamento na conta', () => {
    expect(transactionDelta(tx({ type: 'income', amountCents: 500 }), 'a1')).toBe(500)
    expect(transactionDelta(tx({ type: 'expense', amountCents: 500 }), 'a1')).toBe(-500)
    expect(transactionDelta(tx({ type: 'transfer', amountCents: 500, destinationAccountId: 'a2' }), 'a1')).toBe(-500)
    expect(transactionDelta(tx({ type: 'transfer', amountCents: 500, destinationAccountId: 'a2' }), 'a2')).toBe(500)
    expect(transactionDelta(tx({ type: 'expense', amountCents: 500 }), 'a2')).toBe(0)
  })
})

describe('accountBalance', () => {
  it('soma só pagos a partir da data do saldo inicial, com transferências', () => {
    // 100.000 + 50.000 − 20.000 − 10.000 + 3.000
    expect(accountBalance(account, scenario)).toBe(123_000)
  })

  it('aceita saldo inicial negativo', () => {
    expect(accountBalance({ ...account, initialBalanceCents: -5_000 }, [])).toBe(-5_000)
  })

  it('calcula a outra conta pela mesma regra', () => {
    const other: LedgerAccount = { id: 'a2', initialBalanceCents: 0, initialBalanceDate: '2026-09-01' }
    // + 10.000 − 3.000 − 999
    expect(accountBalance(other, scenario)).toBe(6_001)
  })
})

describe('buildStatement', () => {
  it('monta o extrato do mês com saldo acumulado', () => {
    const statement = buildStatement(account, scenario, { year: 2026, month: 9 })
    expect(statement.beforeInitialDate).toBe(false)
    expect(statement.openingCents).toBe(100_000)
    expect(statement.rows.map((r) => [r.transaction.date, r.deltaCents, r.runningCents])).toEqual([
      ['2026-09-05', 50_000, 150_000],
      ['2026-09-10', -20_000, 130_000],
      ['2026-09-12', -5_000, null], // pendente não altera o acumulado
      ['2026-09-15', -10_000, 120_000],
      ['2026-09-20', 3_000, 123_000],
    ])
    expect(statement.closingCents).toBe(123_000)
  })

  it('abre o mês seguinte com o fechamento do anterior', () => {
    const statement = buildStatement(account, scenario, { year: 2026, month: 10 })
    expect(statement.openingCents).toBe(123_000)
    expect(statement.rows).toEqual([])
    expect(statement.closingCents).toBe(123_000)
  })

  it('marca o mês anterior ao saldo inicial e não soma seus lançamentos', () => {
    const statement = buildStatement(account, scenario, { year: 2026, month: 8 })
    expect(statement.beforeInitialDate).toBe(true)
    expect(statement.rows.map((r) => [r.deltaCents, r.runningCents])).toEqual([[-7_000, null]])
    expect(statement.closingCents).toBe(statement.openingCents)
  })

  it('ordena pela data e, no mesmo dia, pela criação', () => {
    const later = tx({ date: '2026-09-03', createdAt: '2026-09-03T10:00:00Z', amountCents: 1 })
    const earlier = tx({ date: '2026-09-03', createdAt: '2026-09-03T09:00:00Z', amountCents: 2 })
    const statement = buildStatement(account, [later, earlier], { year: 2026, month: 9 })
    expect(statement.rows.map((r) => r.transaction.amountCents)).toEqual([2, 1])
  })

  it('preserva campos extras do lançamento (genérico)', () => {
    const withExtra = [{ ...tx({ date: '2026-09-02' }), description: 'Padaria' }]
    const statement = buildStatement(account, withExtra, { year: 2026, month: 9 })
    expect(statement.rows[0].transaction.description).toBe('Padaria')
  })
})
```

`lib/finance/summary.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { summarizeMonth } from './summary'

describe('summarizeMonth', () => {
  it('separa realizado e previsto e ignora transferências', () => {
    const summary = summarizeMonth([
      { type: 'income', status: 'paid', amountCents: 50_000 },
      { type: 'income', status: 'pending', amountCents: 2_000 },
      { type: 'expense', status: 'paid', amountCents: 20_000 },
      { type: 'expense', status: 'pending', amountCents: 5_000 },
      { type: 'transfer', status: 'paid', amountCents: 10_000 },
    ])
    expect(summary).toEqual({
      income: { paid: 50_000, pending: 2_000 },
      expense: { paid: 20_000, pending: 5_000 },
      balancePaid: 30_000,
      balanceProjected: 27_000,
    })
  })

  it('mês vazio zera tudo', () => {
    expect(summarizeMonth([])).toEqual({
      income: { paid: 0, pending: 0 },
      expense: { paid: 0, pending: 0 },
      balancePaid: 0,
      balanceProjected: 0,
    })
  })
})
```

`lib/categories.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  activeCategories,
  buildCategoryTree,
  CATEGORY_ICONS,
  chipCategories,
  COLOR_LABELS,
  COLOR_PALETTE,
  DEFAULT_CATEGORIES,
  expandCategoryFilter,
  rankCategories,
  type Category,
} from './categories'

function cat(partial: Partial<Category> & { id: string; name: string }): Category {
  return { kind: 'expense', parentId: null, icon: 'house', color: '#3b82f6', isDefault: false, archived: false, ...partial }
}

describe('constantes', () => {
  it('categorias padrão: 14 de despesa e 5 de receita, com ícone e cor válidos', () => {
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense')).toHaveLength(14)
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === 'income')).toHaveLength(5)
    for (const c of DEFAULT_CATEGORIES) {
      expect(CATEGORY_ICONS).toContain(c.icon)
      expect(COLOR_PALETTE).toContain(c.color)
    }
  })

  it('toda cor da paleta tem rótulo', () => {
    for (const color of COLOR_PALETTE) expect(COLOR_LABELS[color]).toBeTruthy()
  })
})

describe('rankCategories', () => {
  it('ordena por frequência e desempata pela primeira aparição', () => {
    expect(rankCategories(['b', 'a', 'b', null, 'c', 'a', 'b'], 2)).toEqual(['b', 'a'])
    expect(rankCategories(['x', 'y'], 6)).toEqual(['x', 'y'])
    expect(rankCategories([], 6)).toEqual([])
  })
})

describe('buildCategoryTree', () => {
  it('agrupa subcategorias sob a mãe, em ordem alfabética', () => {
    const tree = buildCategoryTree([
      cat({ id: 'm', name: 'Moradia' }),
      cat({ id: 'a', name: 'Aluguel', parentId: 'm' }),
      cat({ id: 'e', name: 'Energia', parentId: 'm' }),
      cat({ id: 'l', name: 'Lazer' }),
    ])
    expect(tree.map((n) => [n.name, n.children.map((c) => c.name)])).toEqual([
      ['Lazer', []],
      ['Moradia', ['Aluguel', 'Energia']],
    ])
  })

  it('subcategoria sem mãe na lista vira raiz', () => {
    const tree = buildCategoryTree([cat({ id: 'a', name: 'Aluguel', parentId: 'sumiu' })])
    expect(tree.map((n) => n.name)).toEqual(['Aluguel'])
  })
})

describe('activeCategories', () => {
  it('remove arquivadas e filhas de mãe arquivada', () => {
    const result = activeCategories([
      cat({ id: 'm', name: 'Moradia', archived: true }),
      cat({ id: 'a', name: 'Aluguel', parentId: 'm' }),
      cat({ id: 'l', name: 'Lazer' }),
      cat({ id: 'x', name: 'Velha', archived: true }),
    ])
    expect(result.map((c) => c.id)).toEqual(['l'])
  })
})

describe('expandCategoryFilter', () => {
  it('inclui as subcategorias da mãe', () => {
    const categories = [cat({ id: 'm', name: 'Moradia' }), cat({ id: 'a', name: 'Aluguel', parentId: 'm' }), cat({ id: 'l', name: 'Lazer' })]
    expect(expandCategoryFilter('m', categories)).toEqual(['m', 'a'])
    expect(expandCategoryFilter('a', categories)).toEqual(['a'])
  })
})

describe('chipCategories', () => {
  const candidates = [cat({ id: 'c', name: 'Casa' }), cat({ id: 'b', name: 'Bar' }), cat({ id: 'a', name: 'Academia' })]

  it('usa as mais usadas e completa em ordem alfabética', () => {
    expect(chipCategories(candidates, ['c'], 3).map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('ignora ids que não estão entre as candidatas e respeita o limite', () => {
    expect(chipCategories(candidates, ['zzz', 'b'], 2).map((c) => c.id)).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run lib/finance/balance.test.ts lib/finance/summary.test.ts lib/categories.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`lib/finance/balance.ts`:
```ts
import { monthBounds, type YearMonth } from '@/lib/dates'
import type { LedgerAccount, LedgerTransaction } from './types'

/** Efeito do lançamento no saldo da conta (0 se não a envolve). */
export function transactionDelta(tx: LedgerTransaction, accountId: string): number {
  if (tx.type === 'income') return tx.accountId === accountId ? tx.amountCents : 0
  if (tx.type === 'expense') return tx.accountId === accountId ? -tx.amountCents : 0
  let delta = 0
  if (tx.accountId === accountId) delta -= tx.amountCents
  if (tx.destinationAccountId === accountId) delta += tx.amountCents
  return delta
}

/** Só pagos, com data igual ou posterior à do saldo inicial (mesma regra da view v_account_balances). */
function countsForBalance(tx: LedgerTransaction, account: LedgerAccount): boolean {
  return tx.status === 'paid' && tx.date >= account.initialBalanceDate
}

export function accountBalance(account: LedgerAccount, transactions: LedgerTransaction[]): number {
  return transactions.reduce(
    (sum, tx) => (countsForBalance(tx, account) ? sum + transactionDelta(tx, account.id) : sum),
    account.initialBalanceCents,
  )
}

export type StatementRow<T> = { transaction: T; deltaCents: number; runningCents: number | null }

export type Statement<T> = {
  openingCents: number
  rows: StatementRow<T>[]
  closingCents: number
  beforeInitialDate: boolean
}

function involves(tx: LedgerTransaction, accountId: string): boolean {
  return tx.accountId === accountId || tx.destinationAccountId === accountId
}

/** Extrato do mês: abertura, linhas com saldo acumulado (pendentes e anteriores ao saldo inicial = null) e fechamento. */
export function buildStatement<T extends LedgerTransaction>(
  account: LedgerAccount,
  transactions: T[],
  ym: YearMonth,
): Statement<T> {
  const { start, end } = monthBounds(ym)
  const mine = transactions.filter((tx) => involves(tx, account.id))

  let openingCents = account.initialBalanceCents
  for (const tx of mine) {
    if (tx.date < start && countsForBalance(tx, account)) openingCents += transactionDelta(tx, account.id)
  }

  const inMonth = mine
    .filter((tx) => tx.date >= start && tx.date < end)
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))

  let running = openingCents
  const rows = inMonth.map((tx) => {
    const deltaCents = transactionDelta(tx, account.id)
    if (!countsForBalance(tx, account)) return { transaction: tx, deltaCents, runningCents: null }
    running += deltaCents
    return { transaction: tx, deltaCents, runningCents: running }
  })

  return { openingCents, rows, closingCents: running, beforeInitialDate: end <= account.initialBalanceDate }
}
```

`lib/finance/summary.ts`:
```ts
import type { LedgerTransaction } from './types'

export type MonthSummary = {
  income: { paid: number; pending: number }
  expense: { paid: number; pending: number }
  balancePaid: number
  balanceProjected: number
}

/** Receitas e despesas do mês, realizado x previsto. Transferências não entram (PRD 8.5). */
export function summarizeMonth(transactions: Pick<LedgerTransaction, 'type' | 'status' | 'amountCents'>[]): MonthSummary {
  const income = { paid: 0, pending: 0 }
  const expense = { paid: 0, pending: 0 }
  for (const tx of transactions) {
    if (tx.type === 'transfer') continue
    const bucket = tx.type === 'income' ? income : expense
    bucket[tx.status] += tx.amountCents
  }
  return {
    income,
    expense,
    balancePaid: income.paid - expense.paid,
    balanceProjected: income.paid + income.pending - (expense.paid + expense.pending),
  }
}
```

`lib/categories.ts`:
```ts
export type CategoryKind = 'income' | 'expense'

export type Category = {
  id: string
  name: string
  kind: CategoryKind
  parentId: string | null
  icon: string
  color: string
  isDefault: boolean
  archived: boolean
}

export type CategoryNode = Category & { children: Category[] }

export const COLOR_PALETTE = [
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#64748b',
  '#eab308',
] as const

export type PaletteColor = (typeof COLOR_PALETTE)[number]

export const COLOR_LABELS: Record<PaletteColor, string> = {
  '#3b82f6': 'Azul',
  '#22c55e': 'Verde',
  '#ef4444': 'Vermelho',
  '#f59e0b': 'Âmbar',
  '#a855f7': 'Roxo',
  '#ec4899': 'Rosa',
  '#14b8a6': 'Turquesa',
  '#f97316': 'Laranja',
  '#64748b': 'Cinza',
  '#eab308': 'Amarelo',
}

export const CATEGORY_ICONS = [
  'house',
  'shopping-cart',
  'utensils-crossed',
  'car',
  'heart-pulse',
  'graduation-cap',
  'gamepad-2',
  'repeat',
  'shirt',
  'paw-print',
  'gift',
  'plane',
  'building-2',
  'circle-ellipsis',
  'briefcase',
  'laptop',
  'trending-up',
  'undo-2',
  'wallet',
  'piggy-bank',
  'fuel',
  'bus',
  'baby',
  'dumbbell',
  'coffee',
  'smartphone',
  'wifi',
  'zap',
  'droplet',
  'wrench',
  'book-open',
  'film',
  'pill',
  'receipt',
] as const

export type CategoryIconName = (typeof CATEGORY_ICONS)[number]

/** Mesma lista da função SQL seed_default_categories (PRD 5.6). */
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; icon: CategoryIconName; color: PaletteColor }[] = [
  { name: 'Moradia', kind: 'expense', icon: 'house', color: '#3b82f6' },
  { name: 'Mercado', kind: 'expense', icon: 'shopping-cart', color: '#22c55e' },
  { name: 'Alimentação fora', kind: 'expense', icon: 'utensils-crossed', color: '#f97316' },
  { name: 'Transporte', kind: 'expense', icon: 'car', color: '#eab308' },
  { name: 'Saúde', kind: 'expense', icon: 'heart-pulse', color: '#ef4444' },
  { name: 'Educação', kind: 'expense', icon: 'graduation-cap', color: '#a855f7' },
  { name: 'Lazer', kind: 'expense', icon: 'gamepad-2', color: '#ec4899' },
  { name: 'Assinaturas', kind: 'expense', icon: 'repeat', color: '#14b8a6' },
  { name: 'Vestuário', kind: 'expense', icon: 'shirt', color: '#f59e0b' },
  { name: 'Pets', kind: 'expense', icon: 'paw-print', color: '#f97316' },
  { name: 'Presentes', kind: 'expense', icon: 'gift', color: '#ec4899' },
  { name: 'Viagem', kind: 'expense', icon: 'plane', color: '#3b82f6' },
  { name: 'Imóvel', kind: 'expense', icon: 'building-2', color: '#14b8a6' },
  { name: 'Outros', kind: 'expense', icon: 'circle-ellipsis', color: '#64748b' },
  { name: 'Salário', kind: 'income', icon: 'briefcase', color: '#22c55e' },
  { name: 'Freelance', kind: 'income', icon: 'laptop', color: '#3b82f6' },
  { name: 'Rendimentos', kind: 'income', icon: 'trending-up', color: '#14b8a6' },
  { name: 'Reembolso', kind: 'income', icon: 'undo-2', color: '#a855f7' },
  { name: 'Outros', kind: 'income', icon: 'circle-ellipsis', color: '#64748b' },
]

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'pt-BR')

/** Ids mais frequentes primeiro; empate pela primeira aparição. */
export function rankCategories(ids: (string | null)[], limit: number): string[] {
  const counts = new Map<string, { count: number; first: number }>()
  ids.forEach((id, index) => {
    if (!id) return
    const entry = counts.get(id)
    if (entry) entry.count += 1
    else counts.set(id, { count: 1, first: index })
  })
  return [...counts.entries()]
    .sort(([, a], [, b]) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map(([id]) => id)
}

export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const ids = new Set(categories.map((c) => c.id))
  const roots = categories.filter((c) => !c.parentId || !ids.has(c.parentId)).sort(byName)
  return roots.map((root) => ({
    ...root,
    children: categories.filter((c) => c.parentId === root.id).sort(byName),
  }))
}

/** Não arquivadas e sem mãe arquivada (o que aparece nos seletores). */
export function activeCategories(categories: Category[]): Category[] {
  const archived = new Set(categories.filter((c) => c.archived).map((c) => c.id))
  return categories.filter((c) => !c.archived && !(c.parentId && archived.has(c.parentId)))
}

/** O filtro por uma categoria-mãe inclui as subcategorias. */
export function expandCategoryFilter(categoryId: string, categories: Category[]): string[] {
  return [categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)]
}

/** Chips do formulário: as mais usadas que ainda são candidatas, completadas em ordem alfabética. */
export function chipCategories(candidates: Category[], topIds: string[], limit: number): Category[] {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const top = topIds.map((id) => byId.get(id)).filter((c): c is Category => Boolean(c))
  const rest = [...candidates].sort(byName).filter((c) => !top.includes(c))
  return [...top, ...rest].slice(0, limit)
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/balance.ts lib/finance/balance.test.ts lib/finance/summary.ts lib/finance/summary.test.ts lib/categories.ts lib/categories.test.ts
git commit -m "feat(finance): saldo, extrato, resumo do mês e regras de categorias" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Schemas de validação e mapeadores de lançamento

**Files:**
- Create: `lib/validation/common.ts`, `lib/validation/account.ts`, `lib/validation/account.test.ts`, `lib/validation/category.ts`, `lib/validation/category.test.ts`, `lib/validation/transaction.ts`, `lib/validation/transaction.test.ts`, `lib/transaction-mappers.ts`, `lib/transaction-mappers.test.ts`

**Interfaces:**
- Consumes: `COLOR_PALETTE`, `CATEGORY_ICONS` (Task 2); `TransactionType`, `TransactionStatus`, `LedgerTransaction` (Task 1)
- Produces:
  - `isoDateSchema`, `uuidSchema`
  - `ACCOUNT_TYPES`, `type AccountType`, `ACCOUNT_TYPE_LABELS`, `accountSchema`, `type AccountFormInput = z.input<typeof accountSchema>`, `type AccountOutput = z.output<typeof accountSchema>`
  - `categorySchema`, `categoryUpdateSchema`, `type CategoryFormInput = z.input<typeof categoryUpdateSchema>`, `type CategoryUpdateOutput = z.output<typeof categoryUpdateSchema>`, `type CategoryOutput = z.output<typeof categorySchema>`
  - `transactionSchema`, `type TransactionInput`, `type TransactionFormValues`, `toTransactionInput(values: TransactionFormValues): unknown`, `transactionFormResolver: Resolver<TransactionFormValues>`, `transactionSnapshotSchema`, `type TransactionSnapshot = { id: string; input: TransactionInput }`
  - `type TransactionRow`, `TRANSACTION_COLUMNS`, `type TransactionInsertRow`, `rowToLedger`, `rowToInput`, `rowToFormValues`, `inputToRow(input: TransactionInput, householdId: string): TransactionInsertRow`, `pickDefaultAccountId(accounts: { id: string }[], lastAccountId: string | null): string | null`

- [ ] **Step 1: Escrever os testes que devem falhar**

`lib/validation/account.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { accountSchema } from './account'

const valid = {
  name: ' Itaú ',
  institution: '',
  type: 'checking',
  initialBalanceCents: -5_000,
  initialBalanceDate: '2026-10-01',
  color: '#3b82f6',
}

describe('accountSchema', () => {
  it('normaliza nome e instituição vazia', () => {
    const parsed = accountSchema.parse(valid)
    expect(parsed.name).toBe('Itaú')
    expect(parsed.institution).toBeNull()
    expect(parsed.initialBalanceCents).toBe(-5_000)
  })

  it('aceita a própria saída (reenvio ao servidor)', () => {
    expect(accountSchema.parse(accountSchema.parse(valid)).institution).toBeNull()
  })

  it('recusa nome vazio, cor fora da paleta e data inválida', () => {
    expect(accountSchema.safeParse({ ...valid, name: '  ' }).error?.issues[0].message).toBe('Informe o nome da conta.')
    expect(accountSchema.safeParse({ ...valid, color: '#000000' }).error?.issues[0].message).toBe('Escolha uma cor.')
    expect(accountSchema.safeParse({ ...valid, initialBalanceDate: '2026-02-30' }).error?.issues[0].message).toBe(
      'Informe uma data válida.',
    )
  })
})
```

`lib/validation/category.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { categorySchema, categoryUpdateSchema } from './category'

describe('categorySchema', () => {
  const valid = { name: ' Padaria ', kind: 'expense', parentId: null, icon: 'coffee', color: '#f97316' }

  it('aceita categoria principal e normaliza o nome', () => {
    expect(categorySchema.parse(valid).name).toBe('Padaria')
  })

  it('aceita subcategoria com mãe uuid', () => {
    const parentId = '11111111-1111-4111-8111-111111111111'
    expect(categorySchema.parse({ ...valid, parentId }).parentId).toBe(parentId)
  })

  it('recusa ícone fora da lista e nome longo', () => {
    expect(categorySchema.safeParse({ ...valid, icon: 'skull' }).error?.issues[0].message).toBe('Escolha um ícone.')
    expect(categorySchema.safeParse({ ...valid, name: 'a'.repeat(41) }).error?.issues[0].message).toBe(
      'Use no máximo 40 caracteres.',
    )
  })

  it('a edição não aceita trocar o tipo', () => {
    const parsed = categoryUpdateSchema.parse({ ...valid, kind: 'income' })
    expect(parsed).not.toHaveProperty('kind')
  })
})
```

`lib/validation/transaction.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  toTransactionInput,
  transactionFormResolver,
  transactionSchema,
  transactionSnapshotSchema,
  type TransactionFormValues,
} from './transaction'

const ACC_1 = '11111111-1111-4111-8111-111111111111'
const ACC_2 = '22222222-2222-4222-8222-222222222222'
const CAT = '33333333-3333-4333-8333-333333333333'

const form: TransactionFormValues = {
  type: 'expense',
  amountCents: 1250,
  description: ' Padaria ',
  categoryId: CAT,
  accountId: ACC_1,
  destinationAccountId: '',
  date: '2026-10-04',
  status: 'paid',
  notes: '',
}

describe('transactionSchema', () => {
  it('aceita despesa e normaliza descrição e observação', () => {
    const parsed = transactionSchema.parse(toTransactionInput(form))
    expect(parsed).toMatchObject({ type: 'expense', description: 'Padaria', notes: null, categoryId: CAT })
  })

  it('exige categoria em receita e despesa', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, categoryId: '' }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['categoryId'], message: 'Escolha a categoria.' })
  })

  it('exige conta', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, accountId: '' }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['accountId'], message: 'Escolha a conta.' })
  })

  it('recusa valor zero', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, amountCents: 0 }))
    expect(result.error?.issues[0].message).toBe('Informe um valor maior que zero.')
  })

  it('transferência ignora categoria e exige destino diferente da origem', () => {
    const transfer = toTransactionInput({ ...form, type: 'transfer', destinationAccountId: ACC_2 })
    const parsed = transactionSchema.parse(transfer)
    expect(parsed).not.toHaveProperty('categoryId')
    expect(parsed).toMatchObject({ type: 'transfer', destinationAccountId: ACC_2 })

    const same = transactionSchema.safeParse(toTransactionInput({ ...form, type: 'transfer', destinationAccountId: ACC_1 }))
    expect(same.error?.issues[0]).toMatchObject({
      path: ['destinationAccountId'],
      message: 'Escolha uma conta diferente da origem.',
    })
  })

  it('recusa data inexistente', () => {
    const result = transactionSchema.safeParse(toTransactionInput({ ...form, date: '2026-02-30' }))
    expect(result.error?.issues[0].message).toBe('Informe uma data válida.')
  })

  it('o snapshot aceita a saída do schema (desfazer exclusão)', () => {
    const input = transactionSchema.parse(toTransactionInput(form))
    expect(transactionSnapshotSchema.parse({ id: ACC_2, input }).input).toEqual(input)
  })
})

describe('transactionFormResolver', () => {
  it('devolve o erro no campo do formulário', async () => {
    const result = await transactionFormResolver({ ...form, categoryId: '' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    })
    expect(result.errors.categoryId?.message).toBe('Escolha a categoria.')
  })

  it('sem erros devolve os valores', async () => {
    const result = await transactionFormResolver(form, undefined, { fields: {}, shouldUseNativeValidation: false })
    expect(result.errors).toEqual({})
    expect(result.values).toEqual(form)
  })
})
```

`lib/transaction-mappers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { inputToRow, pickDefaultAccountId, rowToFormValues, rowToInput, rowToLedger, type TransactionRow } from './transaction-mappers'
import type { TransactionInput } from './validation/transaction'

const row: TransactionRow = {
  id: 'tx-1',
  type: 'expense',
  description: 'Padaria',
  amount_cents: 1250,
  date: '2026-10-04',
  status: 'paid',
  category_id: 'cat-1',
  account_id: 'acc-1',
  destination_account_id: null,
  notes: null,
  created_at: '2026-10-04T12:00:00Z',
}

describe('mapeadores de lançamento', () => {
  it('rowToLedger', () => {
    expect(rowToLedger(row)).toEqual({
      id: 'tx-1',
      type: 'expense',
      amountCents: 1250,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      destinationAccountId: null,
      createdAt: '2026-10-04T12:00:00Z',
    })
  })

  it('rowToInput e rowToFormValues', () => {
    expect(rowToInput(row)).toEqual({
      type: 'expense',
      description: 'Padaria',
      amountCents: 1250,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      notes: null,
      categoryId: 'cat-1',
    })
    expect(rowToFormValues({ ...row, type: 'transfer', category_id: null, destination_account_id: 'acc-2' })).toEqual({
      type: 'transfer',
      amountCents: 1250,
      description: 'Padaria',
      categoryId: '',
      accountId: 'acc-1',
      destinationAccountId: 'acc-2',
      date: '2026-10-04',
      status: 'paid',
      notes: '',
    })
  })

  it('inputToRow zera os campos do outro tipo (despesa ↔ transferência)', () => {
    const transfer: TransactionInput = {
      type: 'transfer',
      description: 'Reserva',
      amountCents: 500,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      notes: null,
      destinationAccountId: 'acc-2',
    }
    expect(inputToRow(transfer, 'house-1')).toMatchObject({ category_id: null, destination_account_id: 'acc-2' })

    const expense: TransactionInput = { ...rowToInput(row) }
    expect(inputToRow(expense, 'house-1')).toMatchObject({
      household_id: 'house-1',
      category_id: 'cat-1',
      destination_account_id: null,
    })
  })

  it('pickDefaultAccountId usa a última conta se ainda estiver disponível', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }]
    expect(pickDefaultAccountId(accounts, 'b')).toBe('b')
    expect(pickDefaultAccountId(accounts, 'arquivada')).toBe('a')
    expect(pickDefaultAccountId(accounts, null)).toBe('a')
    expect(pickDefaultAccountId([], 'b')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run lib/validation lib/transaction-mappers.test.ts`
Expected: FAIL — módulos novos inexistentes (os testes da Fase 1 em `lib/validation` continuam passando).

- [ ] **Step 3: Implementar**

`lib/validation/common.ts`:
```ts
import { z } from 'zod'

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Data de calendário AAAA-MM-DD que existe de verdade. */
export const isoDateSchema = z
  .string({ error: 'Informe uma data válida.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Informe uma data válida.' })
  .refine(isRealDate, { error: 'Informe uma data válida.' })

export const uuidSchema = z.uuid({ error: 'Identificador inválido.' })
```

`lib/validation/account.ts`:
```ts
import { z } from 'zod'
import { COLOR_PALETTE } from '@/lib/categories'
import { isoDateSchema } from './common'

export const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'investment'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Carteira',
  investment: 'Investimento',
}

const MAX_CENTS = 99_999_999_999

export const accountSchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome da conta.' }).max(60, { error: 'Use no máximo 60 caracteres.' }),
  institution: z
    .string()
    .trim()
    .max(60, { error: 'Use no máximo 60 caracteres.' })
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  type: z.enum(ACCOUNT_TYPES, { error: 'Escolha o tipo.' }),
  initialBalanceCents: z
    .number({ error: 'Informe o saldo inicial.' })
    .int({ error: 'Informe o saldo inicial.' })
    .min(-MAX_CENTS, { error: 'Valor muito alto.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  initialBalanceDate: isoDateSchema,
  color: z.enum(COLOR_PALETTE, { error: 'Escolha uma cor.' }),
})

export type AccountFormInput = z.input<typeof accountSchema>
export type AccountOutput = z.output<typeof accountSchema>
```

`lib/validation/category.ts`:
```ts
import { z } from 'zod'
import { CATEGORY_ICONS, COLOR_PALETTE } from '@/lib/categories'

export const categorySchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome da categoria.' }).max(40, { error: 'Use no máximo 40 caracteres.' }),
  kind: z.enum(['income', 'expense'], { error: 'Escolha o tipo.' }),
  parentId: z.uuid({ error: 'Categoria-mãe inválida.' }).nullable(),
  icon: z.enum(CATEGORY_ICONS, { error: 'Escolha um ícone.' }),
  color: z.enum(COLOR_PALETTE, { error: 'Escolha uma cor.' }),
})

/** Na edição o tipo não muda (o banco também impede). */
export const categoryUpdateSchema = categorySchema.omit({ kind: true })

export type CategoryOutput = z.output<typeof categorySchema>
export type CategoryFormInput = z.input<typeof categoryUpdateSchema>
export type CategoryUpdateOutput = z.output<typeof categoryUpdateSchema>
```

`lib/validation/transaction.ts`:
```ts
import type { FieldErrors, Resolver } from 'react-hook-form'
import { z } from 'zod'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { isoDateSchema } from './common'

const MAX_CENTS = 99_999_999_999

const baseFields = {
  description: z
    .string()
    .trim()
    .min(1, { error: 'Informe a descrição.' })
    .max(120, { error: 'Use no máximo 120 caracteres.' }),
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int({ error: 'Informe o valor.' })
    .positive({ error: 'Informe um valor maior que zero.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  date: isoDateSchema,
  status: z.enum(['paid', 'pending'], { error: 'Escolha o status.' }),
  accountId: z.uuid({ error: 'Escolha a conta.' }),
  notes: z
    .string()
    .trim()
    .max(500, { error: 'Use no máximo 500 caracteres.' })
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
}

const categoryId = z.uuid({ error: 'Escolha a categoria.' })

export const transactionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('income'), ...baseFields, categoryId }),
  z.object({ type: z.literal('expense'), ...baseFields, categoryId }),
  z
    .object({ type: z.literal('transfer'), ...baseFields, destinationAccountId: z.uuid({ error: 'Escolha a conta de destino.' }) })
    .refine((value) => value.destinationAccountId !== value.accountId, {
      error: 'Escolha uma conta diferente da origem.',
      path: ['destinationAccountId'],
    }),
])

export type TransactionInput = z.output<typeof transactionSchema>

/** Estado plano do formulário (campos vazios = ''). */
export type TransactionFormValues = {
  type: TransactionType
  amountCents: number
  description: string
  categoryId: string
  accountId: string
  destinationAccountId: string
  date: string
  status: TransactionStatus
  notes: string
}

/** Converte o formulário na entrada do schema, mantendo só os campos do tipo escolhido. */
export function toTransactionInput(values: TransactionFormValues): unknown {
  const base = {
    description: values.description,
    amountCents: values.amountCents,
    date: values.date,
    status: values.status,
    accountId: values.accountId || undefined,
    notes: values.notes,
  }
  if (values.type === 'transfer') {
    return { type: 'transfer', ...base, destinationAccountId: values.destinationAccountId || undefined }
  }
  return { type: values.type, ...base, categoryId: values.categoryId || undefined }
}

/** Resolver do react-hook-form que valida com o mesmo schema do servidor. */
export const transactionFormResolver: Resolver<TransactionFormValues> = async (values) => {
  const parsed = transactionSchema.safeParse(toTransactionInput(values))
  if (parsed.success) return { values, errors: {} }
  const errors: Record<string, { type: string; message: string }> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'root')
    if (!errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors: errors as FieldErrors<TransactionFormValues> }
}

export const transactionSnapshotSchema = z.object({ id: z.uuid(), input: transactionSchema })
export type TransactionSnapshot = { id: string; input: TransactionInput }
```

`lib/transaction-mappers.ts`:
```ts
import type { LedgerTransaction, TransactionStatus, TransactionType } from '@/lib/finance/types'
import type { TransactionFormValues, TransactionInput } from '@/lib/validation/transaction'

export const TRANSACTION_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, notes, created_at'

export type TransactionRow = {
  id: string
  type: TransactionType
  description: string
  amount_cents: number
  date: string
  status: TransactionStatus
  category_id: string | null
  account_id: string
  destination_account_id: string | null
  notes: string | null
  created_at: string
}

export type TransactionInsertRow = {
  household_id: string
  type: TransactionType
  description: string
  amount_cents: number
  date: string
  status: TransactionStatus
  account_id: string
  category_id: string | null
  destination_account_id: string | null
  notes: string | null
}

export function rowToLedger(row: TransactionRow): LedgerTransaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    date: row.date,
    status: row.status,
    accountId: row.account_id,
    destinationAccountId: row.destination_account_id,
    createdAt: row.created_at,
  }
}

export function rowToInput(row: TransactionRow): TransactionInput {
  const base = {
    description: row.description,
    amountCents: row.amount_cents,
    date: row.date,
    status: row.status,
    accountId: row.account_id,
    notes: row.notes,
  }
  if (row.type === 'transfer') return { type: 'transfer', ...base, destinationAccountId: row.destination_account_id ?? '' }
  if (row.type === 'income') return { type: 'income', ...base, categoryId: row.category_id ?? '' }
  return { type: 'expense', ...base, categoryId: row.category_id ?? '' }
}

export function rowToFormValues(row: TransactionRow): TransactionFormValues {
  return {
    type: row.type,
    amountCents: row.amount_cents,
    description: row.description,
    categoryId: row.category_id ?? '',
    accountId: row.account_id,
    destinationAccountId: row.destination_account_id ?? '',
    date: row.date,
    status: row.status,
    notes: row.notes ?? '',
  }
}

/** Linha para insert/update; zera os campos que não pertencem ao tipo. */
export function inputToRow(input: TransactionInput, householdId: string): TransactionInsertRow {
  return {
    household_id: householdId,
    type: input.type,
    description: input.description,
    amount_cents: input.amountCents,
    date: input.date,
    status: input.status,
    account_id: input.accountId,
    notes: input.notes,
    category_id: input.type === 'transfer' ? null : input.categoryId,
    destination_account_id: input.type === 'transfer' ? input.destinationAccountId : null,
  }
}

/** Última conta usada, se ainda estiver na lista; senão a primeira. */
export function pickDefaultAccountId(accounts: { id: string }[], lastAccountId: string | null): string | null {
  if (lastAccountId && accounts.some((account) => account.id === lastAccountId)) return lastAccountId
  return accounts[0]?.id ?? null
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test && npx tsc --noEmit`
Expected: PASS e sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add lib/validation lib/transaction-mappers.ts lib/transaction-mappers.test.ts
git commit -m "feat: schemas de conta, categoria e lançamento e mapeadores" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Filtros de URL, busca e agrupamento da lista

**Files:**
- Create: `lib/transaction-filters.ts`, `lib/transaction-filters.test.ts`, `lib/transaction-grouping.ts`, `lib/transaction-grouping.test.ts`

**Interfaces:**
- Consumes: `resolveYearMonth`, `formatYearMonthParam`, `formatYearMonthLabel`, `formatDayHeading`, `yearMonthOfISO`, `YearMonth` (`lib/dates.ts`); `uuidSchema` (Task 3); `TransactionType`, `TransactionStatus` (Task 1)
- Produces:
  - `type TransactionFilters = { type?: TransactionType; categoryId?: string; accountId?: string; status?: TransactionStatus }`
  - `type TransactionsQuery = { ym: YearMonth; q: string; filters: TransactionFilters }`
  - `parseTransactionsQuery(params: Record<string, string | string[] | undefined>, now?: Date): TransactionsQuery`
  - `filterParams(query: TransactionsQuery): Record<string, string>` (sem `mes`)
  - `buildTransactionsHref(query: TransactionsQuery, patch: { ym?: YearMonth; q?: string; filters?: TransactionFilters }): string`
  - `hasActiveFilters(filters: TransactionFilters): boolean`
  - `escapeLike(term: string): string`
  - `type TransactionGroup<T> = { key: string; label: string; items: T[] }`, `groupByDay`, `groupByMonth`, `splitPending`

- [ ] **Step 1: Escrever os testes que devem falhar**

`lib/transaction-filters.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildTransactionsHref, escapeLike, filterParams, hasActiveFilters, parseTransactionsQuery } from './transaction-filters'

const now = new Date('2026-10-15T12:00:00Z')
const ACC = '11111111-1111-4111-8111-111111111111'
const CAT = '33333333-3333-4333-8333-333333333333'

describe('parseTransactionsQuery', () => {
  it('sem parâmetros usa o mês atual e nenhum filtro', () => {
    expect(parseTransactionsQuery({}, now)).toEqual({ ym: { year: 2026, month: 10 }, q: '', filters: {} })
  })

  it('lê todos os filtros em português', () => {
    const query = parseTransactionsQuery(
      { mes: '2026-03', q: ' padaria ', tipo: 'despesa', categoria: CAT, conta: ACC, status: 'pendente' },
      now,
    )
    expect(query).toEqual({
      ym: { year: 2026, month: 3 },
      q: 'padaria',
      filters: { type: 'expense', categoryId: CAT, accountId: ACC, status: 'pending' },
    })
  })

  it('ignora valores adulterados', () => {
    const query = parseTransactionsQuery(
      { tipo: 'constructor', status: 'xyz', conta: 'nao-uuid', categoria: "' or 1=1 --" },
      now,
    )
    expect(query.filters).toEqual({})
  })

  it('usa o primeiro valor repetido e limita a busca a 100 caracteres', () => {
    const query = parseTransactionsQuery({ tipo: ['receita', 'despesa'], q: 'a'.repeat(150) }, now)
    expect(query.filters.type).toBe('income')
    expect(query.q).toHaveLength(100)
  })
})

describe('filterParams e buildTransactionsHref', () => {
  const query = parseTransactionsQuery({ mes: '2026-03', tipo: 'transferencia', conta: ACC }, now)

  it('filterParams devolve só os filtros, sem o mês', () => {
    expect(filterParams(query)).toEqual({ tipo: 'transferencia', conta: ACC })
  })

  it('monta a URL aplicando o patch', () => {
    expect(buildTransactionsHref(query, { q: 'luz' })).toBe(`/lancamentos?mes=2026-03&q=luz&tipo=transferencia&conta=${ACC}`)
    expect(buildTransactionsHref(query, { filters: {} })).toBe('/lancamentos?mes=2026-03')
    expect(buildTransactionsHref(query, { ym: { year: 2026, month: 4 }, filters: { status: 'paid' } })).toBe(
      '/lancamentos?mes=2026-04&status=pago',
    )
  })

  it('hasActiveFilters', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ status: 'paid' })).toBe(true)
  })
})

describe('escapeLike', () => {
  it('escapa curingas e a barra', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
    expect(escapeLike('padaria')).toBe('padaria')
  })
})
```

`lib/transaction-grouping.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { groupByDay, groupByMonth, splitPending } from './transaction-grouping'

const items = [
  { id: '1', date: '2026-10-04', status: 'pending' as const },
  { id: '2', date: '2026-10-04', status: 'paid' as const },
  { id: '3', date: '2026-10-02', status: 'paid' as const },
  { id: '4', date: '2026-09-30', status: 'paid' as const },
]

describe('agrupamento', () => {
  it('groupByDay mantém a ordem e rotula o dia', () => {
    const groups = groupByDay(items)
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-04', 'Domingo, 4 de outubro', ['1', '2']],
      ['2026-10-02', 'Sexta-feira, 2 de outubro', ['3']],
      ['2026-09-30', 'Quarta-feira, 30 de setembro', ['4']],
    ])
  })

  it('groupByMonth agrupa por mês', () => {
    expect(groupByMonth(items).map((g) => [g.key, g.label, g.items.length])).toEqual([
      ['2026-10', 'Outubro 2026', 3],
      ['2026-09', 'Setembro 2026', 1],
    ])
  })

  it('splitPending separa previsto de realizado', () => {
    const { pending, paid } = splitPending(items)
    expect(pending.map((i) => i.id)).toEqual(['1'])
    expect(paid.map((i) => i.id)).toEqual(['2', '3', '4'])
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run lib/transaction-filters.test.ts lib/transaction-grouping.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`lib/transaction-filters.ts`:
```ts
import { formatYearMonthParam, resolveYearMonth, type YearMonth } from '@/lib/dates'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { uuidSchema } from '@/lib/validation/common'

export type TransactionFilters = {
  type?: TransactionType
  categoryId?: string
  accountId?: string
  status?: TransactionStatus
}

export type TransactionsQuery = { ym: YearMonth; q: string; filters: TransactionFilters }

type Params = Record<string, string | string[] | undefined>

const TYPE_FROM_PARAM: Record<string, TransactionType> = { receita: 'income', despesa: 'expense', transferencia: 'transfer' }
const TYPE_TO_PARAM: Record<TransactionType, string> = { income: 'receita', expense: 'despesa', transfer: 'transferencia' }
const STATUS_FROM_PARAM: Record<string, TransactionStatus> = { pago: 'paid', pendente: 'pending' }
const STATUS_TO_PARAM: Record<TransactionStatus, string> = { paid: 'pago', pending: 'pendente' }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

function lookup<T>(map: Record<string, T>, key: string | undefined): T | undefined {
  return key !== undefined && Object.hasOwn(map, key) ? map[key] : undefined
}

function validUuid(value: string | undefined): string | undefined {
  return value && uuidSchema.safeParse(value).success ? value : undefined
}

/** Lê os parâmetros da URL de /lancamentos; valores inválidos são ignorados. */
export function parseTransactionsQuery(params: Params, now: Date = new Date()): TransactionsQuery {
  const filters: TransactionFilters = {}
  const type = lookup(TYPE_FROM_PARAM, first(params.tipo))
  const status = lookup(STATUS_FROM_PARAM, first(params.status))
  const categoryId = validUuid(first(params.categoria))
  const accountId = validUuid(first(params.conta))
  if (type) filters.type = type
  if (categoryId) filters.categoryId = categoryId
  if (accountId) filters.accountId = accountId
  if (status) filters.status = status
  return {
    ym: resolveYearMonth(params.mes, now),
    q: (first(params.q) ?? '').trim().slice(0, 100),
    filters,
  }
}

/** Parâmetros de busca e filtros (sem o mês), para preservar ao trocar de mês. */
export function filterParams(query: TransactionsQuery): Record<string, string> {
  const params: Record<string, string> = {}
  if (query.q) params.q = query.q
  if (query.filters.type) params.tipo = TYPE_TO_PARAM[query.filters.type]
  if (query.filters.categoryId) params.categoria = query.filters.categoryId
  if (query.filters.accountId) params.conta = query.filters.accountId
  if (query.filters.status) params.status = STATUS_TO_PARAM[query.filters.status]
  return params
}

export function buildTransactionsHref(
  query: TransactionsQuery,
  patch: { ym?: YearMonth; q?: string; filters?: TransactionFilters },
): string {
  const next: TransactionsQuery = {
    ym: patch.ym ?? query.ym,
    q: patch.q ?? query.q,
    filters: patch.filters ?? query.filters,
  }
  const search = new URLSearchParams({ mes: formatYearMonthParam(next.ym), ...filterParams(next) })
  return `/lancamentos?${search.toString()}`
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return Object.values(filters).some(Boolean)
}

/** Escapa curingas do LIKE/ILIKE para buscar o texto literal. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}
```

`lib/transaction-grouping.ts`:
```ts
import { formatDayHeading, formatYearMonthLabel, yearMonthOfISO } from '@/lib/dates'
import type { TransactionStatus } from '@/lib/finance/types'

export type TransactionGroup<T> = { key: string; label: string; items: T[] }

function groupBy<T>(items: T[], keyOf: (item: T) => string, labelOf: (key: string) => string): TransactionGroup<T>[] {
  const groups: TransactionGroup<T>[] = []
  for (const item of items) {
    const key = keyOf(item)
    const last = groups.at(-1)
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, label: labelOf(key), items: [item] })
  }
  return groups
}

/** Agrupa itens já ordenados por data. */
export function groupByDay<T extends { date: string }>(items: T[]): TransactionGroup<T>[] {
  return groupBy(items, (item) => item.date, formatDayHeading)
}

export function groupByMonth<T extends { date: string }>(items: T[]): TransactionGroup<T>[] {
  return groupBy(
    items,
    (item) => item.date.slice(0, 7),
    (key) => formatYearMonthLabel(yearMonthOfISO(`${key}-01`)),
  )
}

export function splitPending<T extends { status: TransactionStatus }>(items: T[]): { pending: T[]; paid: T[] } {
  return {
    pending: items.filter((item) => item.status === 'pending'),
    paid: items.filter((item) => item.status === 'paid'),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/transaction-filters.ts lib/transaction-filters.test.ts lib/transaction-grouping.ts lib/transaction-grouping.test.ts
git commit -m "feat: filtros de URL, busca literal e agrupamento de lançamentos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Migration de contas, categorias e lançamentos com testes de RLS

**Files:**
- Create: `tests/rls/helpers.ts`, `tests/rls/finance.rls.test.ts`, `supabase/migrations/20261004130000_contas_categorias_lancamentos.sql`
- Modify: `lib/supabase/errors.ts`, `lib/supabase/errors.test.ts`, `lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: `DEFAULT_CATEGORIES` (Task 2), `accountBalance` (Task 2), `rowToLedger`, `TRANSACTION_COLUMNS` (Task 3)
- Produces (Postgres):
  - Tabelas `accounts`, `categories`, `transactions`; coluna `profiles.last_account_id`
  - View `v_account_balances(account_id, household_id, balance_cents)`
  - Função interna `seed_default_categories(uuid)`; `create_household` passa a semear categorias
  - Erros: `INVALID_PARENT`, `INVALID_ACCOUNT`, `INVALID_CATEGORY`, `CATEGORY_KIND_MISMATCH`; FK `23503`; unique `23505`
  - TS: `translateError` cobre os novos códigos

- [ ] **Step 1: Teste que deve falhar para os novos erros**

Acrescente a `lib/supabase/errors.test.ts`:
```ts
describe('erros das finanças', () => {
  it('traduz os códigos novos', () => {
    expect(translateError({ code: 'P0001', message: 'INVALID_PARENT' })).toBe(
      'A categoria-mãe precisa ser do mesmo tipo e não pode ser uma subcategoria.',
    )
    expect(translateError({ code: 'P0001', message: 'INVALID_ACCOUNT' })).toBe('Conta inválida.')
    expect(translateError({ code: 'P0001', message: 'INVALID_CATEGORY' })).toBe('Categoria inválida.')
    expect(translateError({ code: 'P0001', message: 'CATEGORY_KIND_MISMATCH' })).toBe(
      'A categoria não combina com o tipo do lançamento.',
    )
    expect(translateError({ code: '23503', message: 'update or delete violates foreign key' })).toBe(
      'Não é possível excluir: há lançamentos ou subcategorias vinculados. Arquive em vez de excluir.',
    )
    expect(translateError({ code: '23505', message: 'duplicate key value' })).toBe('Este registro já existe.')
  })
})
```

Run: `npx vitest run lib/supabase/errors.test.ts`
Expected: FAIL (mensagem genérica no lugar das novas).

- [ ] **Step 2: Implementar as traduções**

Em `lib/supabase/errors.ts`, acrescente ao objeto `MESSAGES` (depois de `HOUSEHOLD_FULL`):
```ts
  INVALID_PARENT: 'A categoria-mãe precisa ser do mesmo tipo e não pode ser uma subcategoria.',
  INVALID_ACCOUNT: 'Conta inválida.',
  INVALID_CATEGORY: 'Categoria inválida.',
  CATEGORY_KIND_MISMATCH: 'A categoria não combina com o tipo do lançamento.',
  // Postgres
  '23503': 'Não é possível excluir: há lançamentos ou subcategorias vinculados. Arquive em vez de excluir.',
  '23505': 'Este registro já existe.',
```

Run: `npx vitest run lib/supabase/errors.test.ts`
Expected: PASS.

- [ ] **Step 3: Criar o helper dos testes de integração**

`tests/rls/helpers.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type TestUser = { id: string; client: SupabaseClient }

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Defina ${name} em .env.test.local`)
  return value
}

/** Usuários e casas de teste, com limpeza no fim. O cliente admin nunca é usado pelo app. */
export function createTestContext() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const publishableKey = requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(url, serviceKey, noSession)
  const userIds: string[] = []
  const householdIds: string[] = []

  async function newUser(label: string): Promise<TestUser> {
    const email = `rls-${label}-${crypto.randomUUID()}@example.com`
    const password = `Senha-${crypto.randomUUID()}`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    userIds.push(data.user.id)
    const client = createClient(url, publishableKey, noSession)
    const { error: signInError } = await client.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
    return { id: data.user.id, client }
  }

  async function createHousehold(user: TestUser, name: string): Promise<string> {
    const { data, error } = await user.client.rpc('create_household', { p_name: name })
    if (error) throw error
    householdIds.push(data as string)
    return data as string
  }

  async function cleanup() {
    if (householdIds.length > 0) await admin.from('households').delete().in('id', householdIds)
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  }

  return { url, publishableKey, noSession, admin, newUser, createHousehold, cleanup }
}
```

- [ ] **Step 4: Escrever os testes de integração**

`tests/rls/finance.rls.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '@/lib/categories'
import { accountBalance } from '@/lib/finance/balance'
import { rowToLedger, TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'
import { createTestContext, type TestUser } from './helpers'

const ctx = createTestContext()

describe('finanças: contas, categorias e lançamentos', () => {
  let a: TestUser
  let b: TestUser
  let houseA: string
  let houseB: string
  let accA: string
  let accA2: string
  let accB: string
  let mercadoA: string
  let salarioA: string
  let mercadoB: string

  async function insertAccount(user: TestUser, householdId: string, name: string, initial: number): Promise<string> {
    const { data, error } = await user.client
      .from('accounts')
      .insert({
        household_id: householdId,
        name,
        type: 'checking',
        initial_balance_cents: initial,
        initial_balance_date: '2026-09-01',
        color: '#3b82f6',
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  }

  async function categoryId(user: TestUser, householdId: string, name: string): Promise<string> {
    const { data, error } = await user.client
      .from('categories')
      .select('id')
      .eq('household_id', householdId)
      .eq('name', name)
      .is('parent_id', null)
      .limit(1)
      .single()
    if (error) throw error
    return data.id as string
  }

  function tx(householdId: string, fields: Record<string, unknown>) {
    return { household_id: householdId, description: 'Teste', status: 'paid', date: '2026-09-10', ...fields }
  }

  beforeAll(async () => {
    ;[a, b] = await Promise.all([ctx.newUser('fin-a'), ctx.newUser('fin-b')])
    houseA = await ctx.createHousehold(a, 'Casa Fin A')
    houseB = await ctx.createHousehold(b, 'Casa Fin B')
    mercadoA = await categoryId(a, houseA, 'Mercado')
    salarioA = await categoryId(a, houseA, 'Salário')
    mercadoB = await categoryId(b, houseB, 'Mercado')
    accA = await insertAccount(a, houseA, 'Conta A', 100_000)
    accA2 = await insertAccount(a, houseA, 'Conta A2', 0)
    accB = await insertAccount(b, houseB, 'Conta B', 0)
  })

  afterAll(() => ctx.cleanup())

  it('casa nova nasce com as 19 categorias padrão', async () => {
    const { data, error } = await a.client.from('categories').select('name, kind, icon, color, is_default').eq('household_id', houseA)
    expect(error).toBeNull()
    const label = (c: { kind: string; name: string; icon: string; color: string }) => `${c.kind}:${c.name}:${c.icon}:${c.color}`
    expect(data!.map(label).sort()).toEqual(DEFAULT_CATEGORIES.map(label).sort())
    expect(data!.every((c) => c.is_default)).toBe(true)
  })

  it('a view calcula o mesmo saldo que accountBalance', async () => {
    const scenario = [
      { type: 'income', amount_cents: 50_000, date: '2026-09-05', account_id: accA, category_id: salarioA },
      { type: 'expense', amount_cents: 20_000, date: '2026-09-10', account_id: accA, category_id: mercadoA },
      { type: 'expense', amount_cents: 5_000, date: '2026-09-12', status: 'pending', account_id: accA, category_id: mercadoA },
      { type: 'expense', amount_cents: 7_000, date: '2026-08-20', account_id: accA, category_id: mercadoA },
      { type: 'transfer', amount_cents: 10_000, date: '2026-09-15', account_id: accA, destination_account_id: accA2 },
      { type: 'transfer', amount_cents: 3_000, date: '2026-09-20', account_id: accA2, destination_account_id: accA },
    ]
    const insert = await a.client.from('transactions').insert(scenario.map((fields) => tx(houseA, fields)))
    expect(insert.error).toBeNull()

    const { data: balances } = await a.client.from('v_account_balances').select('account_id, balance_cents').in('account_id', [accA, accA2])
    const byId = new Map(balances!.map((row) => [row.account_id, Number(row.balance_cents)]))

    const { data: rows } = await a.client.from('transactions').select(TRANSACTION_COLUMNS).eq('household_id', houseA)
    const ledger = (rows as TransactionRow[]).map(rowToLedger)

    expect(byId.get(accA)).toBe(123_000)
    expect(byId.get(accA)).toBe(accountBalance({ id: accA, initialBalanceCents: 100_000, initialBalanceDate: '2026-09-01' }, ledger))
    expect(byId.get(accA2)).toBe(7_000)
    expect(byId.get(accA2)).toBe(accountBalance({ id: accA2, initialBalanceCents: 0, initialBalanceDate: '2026-09-01' }, ledger))
  })

  it('outra casa não lê contas, categorias, lançamentos nem saldos', async () => {
    const results = await Promise.all([
      b.client.from('accounts').select('id').eq('household_id', houseA),
      b.client.from('categories').select('id').eq('household_id', houseA),
      b.client.from('transactions').select('id').eq('household_id', houseA),
      b.client.from('v_account_balances').select('account_id').eq('household_id', houseA),
    ])
    for (const result of results) {
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    }
  })

  it('outra casa não escreve na casa de A', async () => {
    const insert = await b.client.from('accounts').insert({
      household_id: houseA,
      name: 'Intrusa',
      type: 'cash',
      initial_balance_date: '2026-09-01',
      color: '#3b82f6',
    })
    expect(insert.error).not.toBeNull()

    await b.client.from('accounts').update({ name: 'Renomeada' }).eq('id', accA)
    const { data } = await ctx.admin.from('accounts').select('name').eq('id', accA).single()
    expect(data?.name).toBe('Conta A')
  })

  it('lançamento não aceita conta ou categoria de outra casa', async () => {
    const otherAccount = await b.client
      .from('transactions')
      .insert(tx(houseB, { type: 'expense', amount_cents: 100, account_id: accA, category_id: mercadoB }))
    expect(otherAccount.error?.message).toBe('INVALID_ACCOUNT')

    const otherCategory = await b.client
      .from('transactions')
      .insert(tx(houseB, { type: 'expense', amount_cents: 100, account_id: accB, category_id: mercadoA }))
    expect(otherCategory.error?.message).toBe('INVALID_CATEGORY')

    const otherDestination = await b.client
      .from('transactions')
      .insert(tx(houseB, { type: 'transfer', amount_cents: 100, account_id: accB, destination_account_id: accA }))
    expect(otherDestination.error?.message).toBe('INVALID_ACCOUNT')
  })

  it('respeita as restrições do lançamento', async () => {
    const zero = await a.client.from('transactions').insert(tx(houseA, { type: 'expense', amount_cents: 0, account_id: accA, category_id: mercadoA }))
    expect(zero.error).not.toBeNull()

    const sameAccount = await a.client
      .from('transactions')
      .insert(tx(houseA, { type: 'transfer', amount_cents: 100, account_id: accA, destination_account_id: accA }))
    expect(sameAccount.error).not.toBeNull()

    const wrongKind = await a.client
      .from('transactions')
      .insert(tx(houseA, { type: 'income', amount_cents: 100, account_id: accA, category_id: mercadoA }))
    expect(wrongKind.error?.message).toBe('CATEGORY_KIND_MISMATCH')
  })

  it('subcategoria: só um nível e mesmo tipo da mãe; nome único no mesmo nível', async () => {
    const { data: sub, error } = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'Feira', kind: 'expense', parent_id: mercadoA, icon: 'shopping-cart', color: '#22c55e' })
      .select('id')
      .single()
    expect(error).toBeNull()

    const grandchild = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'Orgânicos', kind: 'expense', parent_id: sub!.id, icon: 'shopping-cart', color: '#22c55e' })
    expect(grandchild.error?.message).toBe('INVALID_PARENT')

    const otherKind = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'Bônus', kind: 'income', parent_id: mercadoA, icon: 'gift', color: '#22c55e' })
    expect(otherKind.error?.message).toBe('INVALID_PARENT')

    const duplicate = await a.client
      .from('categories')
      .insert({ household_id: houseA, name: 'mercado', kind: 'expense', parent_id: null, icon: 'house', color: '#3b82f6' })
    expect(duplicate.error?.code).toBe('23505')
  })

  it('conta com lançamentos não pode ser excluída, só arquivada', async () => {
    const remove = await a.client.from('accounts').delete().eq('id', accA)
    expect(remove.error?.code).toBe('23503')

    const archive = await a.client.from('accounts').update({ archived: true }).eq('id', accA).select('archived').single()
    expect(archive.data?.archived).toBe(true)

    const empty = await insertAccount(a, houseA, 'Vazia', 0)
    const removeEmpty = await a.client.from('accounts').delete().eq('id', empty).select('id')
    expect(removeEmpty.data).toHaveLength(1)
  })
})
```

Run: `npm run test:rls`
Expected: FAIL nos testes novos (tabela `accounts`/`categories` inexistente; `PGRST205` ou similar). Os 17 testes da Fase 1 continuam passando.

- [ ] **Step 5: Escrever a migration**

`supabase/migrations/20261004130000_contas_categorias_lancamentos.sql`:
```sql
-- Fase 2 — Contas, categorias e lançamentos.

-- =====================================================================
-- Contas
-- =====================================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  institution text check (institution is null or char_length(institution) <= 60),
  type text not null check (type in ('checking', 'savings', 'cash', 'investment')),
  initial_balance_cents bigint not null default 0,
  initial_balance_date date not null,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_household_id_idx on public.accounts (household_id);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Categorias
-- =====================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  -- NO ACTION (padrão): impede excluir mãe com filhas, mas permite apagar a casa em cascata
  parent_id uuid references public.categories (id),
  icon text not null check (char_length(icon) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  is_default boolean not null default false,
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_household_id_idx on public.categories (household_id);
create index categories_parent_id_idx on public.categories (parent_id);
create unique index categories_unique_name_idx on public.categories (
  household_id,
  kind,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create or replace function public.categories_check_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.categories%rowtype;
begin
  if tg_op = 'UPDATE' and new.kind <> old.kind then
    raise exception 'CATEGORY_KIND_MISMATCH';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'INVALID_PARENT';
  end if;

  select * into v_parent from public.categories c where c.id = new.parent_id;
  if not found
     or v_parent.household_id <> new.household_id
     or v_parent.kind <> new.kind
     or v_parent.parent_id is not null then
    raise exception 'INVALID_PARENT';
  end if;

  -- Uma categoria que já tem filhas não pode virar subcategoria
  if exists (select 1 from public.categories c where c.parent_id = new.id) then
    raise exception 'INVALID_PARENT';
  end if;

  return new;
end;
$$;

create trigger categories_check_parent
  before insert or update on public.categories
  for each row execute function public.categories_check_parent();

-- =====================================================================
-- Lançamentos
-- =====================================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  date date not null,
  status text not null check (status in ('paid', 'pending')),
  -- NO ACTION (padrão): 23503 ao excluir conta/categoria com lançamentos
  category_id uuid references public.categories (id),
  account_id uuid not null references public.accounts (id),
  destination_account_id uuid references public.accounts (id),
  source text not null default 'manual' check (source in ('manual', 'recurrence', 'property', 'import')),
  external_id text,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_shape check (
    (type in ('income', 'expense') and category_id is not null and destination_account_id is null)
    or (type = 'transfer' and category_id is null and destination_account_id is not null
        and destination_account_id <> account_id)
  )
);

create index transactions_household_date_idx on public.transactions (household_id, date);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_destination_account_id_idx on public.transactions (destination_account_id);
create index transactions_category_id_idx on public.transactions (category_id);
create unique index transactions_external_id_idx on public.transactions (household_id, external_id)
  where external_id is not null;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create or replace function public.transactions_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_household_id uuid;
begin
  if not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;

  if new.destination_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.destination_account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
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

create trigger transactions_check_refs
  before insert or update on public.transactions
  for each row execute function public.transactions_check_refs();

-- =====================================================================
-- Última conta usada por pessoa
-- =====================================================================

alter table public.profiles
  add column last_account_id uuid references public.accounts (id) on delete set null;

grant update (last_account_id) on public.profiles to authenticated;

-- =====================================================================
-- Saldo por conta
-- =====================================================================

create view public.v_account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.household_id,
  (a.initial_balance_cents + coalesce(sum(
    case
      when t.type = 'income' and t.account_id = a.id then t.amount_cents
      when t.type = 'expense' and t.account_id = a.id then -t.amount_cents
      when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_cents
      when t.type = 'transfer' and t.account_id = a.id then -t.amount_cents
      else 0
    end
  ), 0))::bigint as balance_cents
from public.accounts a
left join public.transactions t
  on (t.account_id = a.id or t.destination_account_id = a.id)
  and t.status = 'paid'
  and t.date >= a.initial_balance_date
group by a.id;

-- =====================================================================
-- Categorias padrão (PRD 5.6) — mesma lista de lib/categories.ts
-- =====================================================================

create or replace function public.seed_default_categories(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.categories c where c.household_id = p_household_id and c.is_default) then
    return;
  end if;

  insert into public.categories (household_id, name, kind, icon, color, is_default)
  values
    (p_household_id, 'Moradia', 'expense', 'house', '#3b82f6', true),
    (p_household_id, 'Mercado', 'expense', 'shopping-cart', '#22c55e', true),
    (p_household_id, 'Alimentação fora', 'expense', 'utensils-crossed', '#f97316', true),
    (p_household_id, 'Transporte', 'expense', 'car', '#eab308', true),
    (p_household_id, 'Saúde', 'expense', 'heart-pulse', '#ef4444', true),
    (p_household_id, 'Educação', 'expense', 'graduation-cap', '#a855f7', true),
    (p_household_id, 'Lazer', 'expense', 'gamepad-2', '#ec4899', true),
    (p_household_id, 'Assinaturas', 'expense', 'repeat', '#14b8a6', true),
    (p_household_id, 'Vestuário', 'expense', 'shirt', '#f59e0b', true),
    (p_household_id, 'Pets', 'expense', 'paw-print', '#f97316', true),
    (p_household_id, 'Presentes', 'expense', 'gift', '#ec4899', true),
    (p_household_id, 'Viagem', 'expense', 'plane', '#3b82f6', true),
    (p_household_id, 'Imóvel', 'expense', 'building-2', '#14b8a6', true),
    (p_household_id, 'Outros', 'expense', 'circle-ellipsis', '#64748b', true),
    (p_household_id, 'Salário', 'income', 'briefcase', '#22c55e', true),
    (p_household_id, 'Freelance', 'income', 'laptop', '#3b82f6', true),
    (p_household_id, 'Rendimentos', 'income', 'trending-up', '#14b8a6', true),
    (p_household_id, 'Reembolso', 'income', 'undo-2', '#a855f7', true),
    (p_household_id, 'Outros', 'income', 'circle-ellipsis', '#64748b', true);
end;
$$;

-- create_household (Fase 1) agora também semeia as categorias
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'INVALID_NAME';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if exists (select 1 from public.household_members m where m.user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.households (name, created_by)
  values (v_name, v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_uid, 'owner');

  perform public.seed_default_categories(v_household_id);

  return v_household_id;
end;
$$;

-- Casas que já existem (ex.: a de vocês)
select public.seed_default_categories(h.id) from public.households h;

-- =====================================================================
-- Permissões e RLS
-- =====================================================================

revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke all on function public.categories_check_parent() from public, anon, authenticated;
revoke all on function public.transactions_check_refs() from public, anon, authenticated;

revoke all on public.accounts, public.categories, public.transactions, public.v_account_balances from anon;
revoke truncate, references, trigger on public.accounts, public.categories, public.transactions from authenticated;
grant select on public.v_account_balances to authenticated;

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy accounts_all on public.accounts
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy categories_all on public.categories
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy transactions_all on public.transactions
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
```

- [ ] **Step 6: Aplicar no projeto remoto**

Run: `npx supabase db push --yes`
Expected: "Applying migration 20261004130000_contas_categorias_lancamentos.sql..." e "Finished supabase db push." Se der erro de SQL, confira com `npx supabase migration list` se a migration ficou registrada; se não, corrija e rode de novo; se ficou parcial, PARE e avise o usuário.

- [ ] **Step 7: Rodar os testes de integração e confirmar que passam**

Run: `npm run test:rls`
Expected: PASS em todos (17 da Fase 1 + 8 novos).

- [ ] **Step 8: Regenerar os tipos e checar**

Run: `npm run db:types && grep -c "v_account_balances\|last_account_id" lib/supabase/database.types.ts && npx tsc --noEmit`
Expected: contagem ≥ 2 e sem erros de tipo.

- [ ] **Step 9: Commit**

```bash
git add lib/supabase tests/rls/helpers.ts tests/rls/finance.rls.test.ts supabase/migrations
git commit -m "feat(db): contas, categorias, lançamentos e saldo por conta com RLS" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Categorias — consultas, ações e tela

**Files:**
- Create: `lib/categories-query.ts`, `lib/actions/categories.ts`, `components/layout/responsive-modal.tsx`, `components/form/native-select.tsx`, `components/form/color-picker.tsx`, `components/categories/category-icon.tsx`, `components/categories/category-form.tsx`, `components/categories/category-row-actions.tsx`, `app/(app)/configuracoes/categorias/page.tsx`
- Modify: `app/(app)/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `Category`, `CategoryKind`, `buildCategoryTree`, `COLOR_PALETTE`, `COLOR_LABELS`, `CATEGORY_ICONS`, `CategoryIconName`, `PaletteColor` (Task 2); `categorySchema`, `categoryUpdateSchema`, `CategoryFormInput`, `CategoryUpdateOutput` (Task 3); `uuidSchema` (Task 3); `translateError`, `GENERIC_ERROR` (Task 5); `getCurrentHousehold` (Fase 1); `Field`, `applyActionErrors`, `PageHeader` (Fase 1)
- Produces:
  - `listCategories(): Promise<Category[]>` (todas, inclusive arquivadas, ordem por nome)
  - `createCategory(input: unknown): Promise<ActionResult<{ id: string }>>`, `updateCategory(id: unknown, input: unknown): Promise<ActionResult>`, `setCategoryArchived(id: unknown, archived: boolean): Promise<ActionResult>`, `deleteCategory(id: unknown): Promise<ActionResult>`
  - `ResponsiveModal({ open, onOpenChange, title, description?, children })`, `useIsDesktop(): boolean`
  - `NativeSelect` (props de `<select>`), `ColorPicker({ value, onChange, label })`
  - `CategoryIcon({ name, color, className? })`
  - `CategoryFormButton(props)`

- [ ] **Step 1: `lib/categories-query.ts`**

```ts
import 'server-only'
import type { Category, CategoryKind } from '@/lib/categories'
import { createClient } from '@/lib/supabase/server'

type CategoryRow = {
  id: string
  name: string
  kind: string
  parent_id: string | null
  icon: string
  color: string
  is_default: boolean
  archived: boolean
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CategoryKind,
    parentId: row.parent_id,
    icon: row.icon,
    color: row.color,
    isDefault: row.is_default,
    archived: row.archived,
  }
}

/** Todas as categorias da casa (inclusive arquivadas), em ordem alfabética. */
export async function listCategories(): Promise<Category[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, kind, parent_id, icon, color, is_default, archived')
    .order('name')
  if (error) throw error
  return data.map(toCategory)
}
```

- [ ] **Step 2: `lib/actions/categories.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentHousehold } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { categorySchema, categoryUpdateSchema } from '@/lib/validation/category'
import { uuidSchema } from '@/lib/validation/common'

function categoryError(error: { code?: string; message?: string }): string {
  return error.code === '23505' ? 'Já existe uma categoria com esse nome neste nível.' : translateError(error)
}

function done() {
  revalidatePath('/', 'layout')
}

export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .insert({
      household_id: household.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      parent_id: parsed.data.parentId,
      icon: parsed.data.icon,
      color: parsed.data.color,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: categoryError(error) }

  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateCategory(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = categoryUpdateSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .update({ name: parsed.data.name, parent_id: parsed.data.parentId, icon: parsed.data.icon, color: parsed.data.color })
    .eq('id', parsedId.data)
    .select('id')
  if (error) return { ok: false, error: categoryError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function setCategoryArchived(id: unknown, archived: boolean): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('categories').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function deleteCategory(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('categories').delete().eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
```

- [ ] **Step 3: Componentes de formulário e modal responsivo**

`components/layout/responsive-modal.tsx`:
```tsx
'use client'

import { useSyncExternalStore } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(callback: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}

type ResponsiveModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
}

/** Modal no desktop (≥ 1024px) e bottom sheet no celular (PRD 9.2). */
export function ResponsiveModal({ open, onOpenChange, title, description, children }: ResponsiveModalProps) {
  const isDesktop = useIsDesktop()

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={description ? undefined : 'sr-only'}>{description ?? title}</SheetDescription>
        </SheetHeader>
        <div className="px-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
```

`components/form/native-select.tsx`:
```tsx
import { cn } from '@/lib/utils'

/** <select> nativo com o visual dos inputs (melhor no celular que um popover). */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-input bg-surface-2 px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  )
}
```

`components/form/color-picker.tsx`:
```tsx
'use client'

import { COLOR_LABELS, COLOR_PALETTE, type PaletteColor } from '@/lib/categories'
import { cn } from '@/lib/utils'

type ColorPickerProps = { value: string; onChange: (color: PaletteColor) => void; label: string }

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={COLOR_LABELS[color]}
          onClick={() => onChange(color)}
          className={cn(
            'size-8 rounded-full border-2 transition-transform',
            value === color ? 'scale-110 border-foreground' : 'border-transparent',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}
```

`components/categories/category-icon.tsx`:
```tsx
import {
  Baby,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  CircleEllipsis,
  Coffee,
  Droplet,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Laptop,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Undo2,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { createElement } from 'react'
import type { CategoryIconName } from '@/lib/categories'
import { cn } from '@/lib/utils'

export const CATEGORY_ICON_COMPONENTS: Record<CategoryIconName, LucideIcon> = {
  house: House,
  'shopping-cart': ShoppingCart,
  'utensils-crossed': UtensilsCrossed,
  car: Car,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  'gamepad-2': Gamepad2,
  repeat: Repeat,
  shirt: Shirt,
  'paw-print': PawPrint,
  gift: Gift,
  plane: Plane,
  'building-2': Building2,
  'circle-ellipsis': CircleEllipsis,
  briefcase: Briefcase,
  laptop: Laptop,
  'trending-up': TrendingUp,
  'undo-2': Undo2,
  wallet: Wallet,
  'piggy-bank': PiggyBank,
  fuel: Fuel,
  bus: Bus,
  baby: Baby,
  dumbbell: Dumbbell,
  coffee: Coffee,
  smartphone: Smartphone,
  wifi: Wifi,
  zap: Zap,
  droplet: Droplet,
  wrench: Wrench,
  'book-open': BookOpen,
  film: Film,
  pill: Pill,
  receipt: Receipt,
}

type CategoryIconProps = { name: string; color: string; className?: string }

/** Círculo com o ícone da categoria na cor dela (fundo a 15%). */
export function CategoryIcon({ name, color, className }: CategoryIconProps) {
  const icon = CATEGORY_ICON_COMPONENTS[name as CategoryIconName] ?? CircleEllipsis
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', className)}
      style={{ backgroundColor: `${color}26`, color }}
    >
      {createElement(icon, { className: 'size-4' })}
    </span>
  )
}
```

- [ ] **Step 4: Formulário e ações de categoria**

`components/categories/category-form.tsx`:
```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ColorPicker } from '@/components/form/color-picker'
import { Field } from '@/components/form/field'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createCategory, updateCategory } from '@/lib/actions/categories'
import { CATEGORY_ICONS, COLOR_PALETTE, type Category, type CategoryKind } from '@/lib/categories'
import { applyActionErrors } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { categoryUpdateSchema, type CategoryFormInput, type CategoryUpdateOutput } from '@/lib/validation/category'
import { CategoryIcon } from './category-icon'

type CategoryFormProps = {
  kind: CategoryKind
  parents: Category[]
  categoryId?: string
  initial?: CategoryFormInput
  hasChildren?: boolean
  onDone: () => void
}

function CategoryForm({ kind, parents, categoryId, initial, hasChildren = false, onDone }: CategoryFormProps) {
  const router = useRouter()
  const form = useForm<CategoryFormInput, unknown, CategoryUpdateOutput>({
    resolver: zodResolver(categoryUpdateSchema),
    defaultValues: initial ?? { name: '', parentId: null, icon: 'circle-ellipsis', color: COLOR_PALETTE[0] },
  })
  const { errors, isSubmitting } = form.formState
  const color = form.watch('color')

  const onSubmit = form.handleSubmit(async (values) => {
    const result = categoryId ? await updateCategory(categoryId, values) : await createCategory({ ...values, kind })
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(categoryId ? 'Categoria atualizada.' : 'Categoria criada.')
    router.refresh()
    onDone()
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2" noValidate>
      <Field id="category-name" label="Nome" error={errors.name?.message}>
        <Input
          id="category-name"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>

      <Field id="category-parent" label="Categoria-mãe" error={errors.parentId?.message}>
        <Controller
          control={form.control}
          name="parentId"
          render={({ field }) => (
            <NativeSelect
              id="category-parent"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={hasChildren}
            >
              <option value="">Nenhuma (categoria principal)</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </NativeSelect>
          )}
        />
      </Field>
      {hasChildren ? <p className="-mt-2 text-xs text-muted-foreground">Esta categoria tem subcategorias e não pode virar uma.</p> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Ícone</legend>
        <Controller
          control={form.control}
          name="icon"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Ícone" className="grid grid-cols-6 gap-2 sm:grid-cols-9">
              {CATEGORY_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={field.value === icon}
                  aria-label={icon}
                  onClick={() => field.onChange(icon)}
                  className={cn('rounded-full p-0.5', field.value === icon ? 'ring-2 ring-foreground' : '')}
                >
                  <CategoryIcon name={icon} color={color} />
                </button>
              ))}
            </div>
          )}
        />
        {errors.icon ? <p role="alert" className="text-sm text-expense">{errors.icon.message}</p> : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cor</legend>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => <ColorPicker label="Cor" value={field.value} onChange={field.onChange} />}
        />
      </fieldset>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

type CategoryFormButtonProps = Omit<CategoryFormProps, 'onDone'> & { label: string; iconOnly?: boolean }

export function CategoryFormButton({ label, iconOnly = false, ...formProps }: CategoryFormButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {iconOnly ? (
        <Button variant="ghost" size="icon" aria-label={label} onClick={() => setOpen(true)}>
          <Pencil aria-hidden />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          {label}
        </Button>
      )}
      <ResponsiveModal open={open} onOpenChange={setOpen} title={formProps.categoryId ? 'Editar categoria' : 'Nova categoria'}>
        {open ? <CategoryForm {...formProps} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
```

`components/categories/category-row-actions.tsx`:
```tsx
'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteCategory, setCategoryArchived } from '@/lib/actions/categories'

export function CategoryRowActions({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggleArchive() {
    startTransition(async () => {
      const result = await setCategoryArchived(id, !archived)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(archived ? 'Categoria reativada.' : 'Categoria arquivada.')
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm(`Excluir a categoria "${name}"? Só é possível se ela não tiver lançamentos nem subcategorias.`)) return
    startTransition(async () => {
      const result = await deleteCategory(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Categoria excluída.')
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={toggleArchive} disabled={pending} aria-label={archived ? `Reativar ${name}` : `Arquivar ${name}`}>
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      </Button>
      <Button variant="ghost" size="icon" onClick={remove} disabled={pending} aria-label={`Excluir ${name}`} className="text-expense">
        <Trash2 aria-hidden />
      </Button>
    </>
  )
}
```

- [ ] **Step 5: Tela `/configuracoes/categorias` e link em Configurações**

`app/(app)/configuracoes/categorias/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { CategoryFormButton } from '@/components/categories/category-form'
import { CategoryIcon } from '@/components/categories/category-icon'
import { CategoryRowActions } from '@/components/categories/category-row-actions'
import { PageHeader } from '@/components/layout/page-header'
import { buildCategoryTree, type Category, type CategoryIconName, type CategoryKind, type PaletteColor } from '@/lib/categories'
import { listCategories } from '@/lib/categories-query'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Categorias' }

function CategoryRow({ category, parents, hasChildren, child = false }: { category: Category; parents: Category[]; hasChildren: boolean; child?: boolean }) {
  return (
    <li className={cn('flex items-center gap-3 py-2', child && 'pl-8')}>
      <CategoryIcon name={category.icon} color={category.color} />
      <span className="min-w-0 flex-1 truncate">{category.name}</span>
      <CategoryFormButton
        label={`Editar ${category.name}`}
        iconOnly
        kind={category.kind}
        parents={parents.filter((p) => p.id !== category.id)}
        categoryId={category.id}
        hasChildren={hasChildren}
        initial={{
          name: category.name,
          parentId: category.parentId,
          icon: category.icon as CategoryIconName,
          color: category.color as PaletteColor,
        }}
      />
      <CategoryRowActions id={category.id} name={category.name} archived={category.archived} />
    </li>
  )
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams
  const kind: CategoryKind = tipo === 'receita' ? 'income' : 'expense'
  const categories = (await listCategories()).filter((c) => c.kind === kind)
  const active = categories.filter((c) => !c.archived)
  const archived = categories.filter((c) => c.archived)
  const tree = buildCategoryTree(active)
  const parents = active.filter((c) => !c.parentId)

  return (
    <>
      <div className="mb-2">
        <Link href="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ Configurações
        </Link>
      </div>
      <PageHeader title="Categorias" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tipo de categoria" className="inline-flex rounded-lg bg-surface-2 p-1">
          {(['expense', 'income'] as const).map((value) => (
            <Link
              key={value}
              href={`/configuracoes/categorias?tipo=${value === 'income' ? 'receita' : 'despesa'}`}
              aria-current={kind === value ? 'page' : undefined}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium',
                kind === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'income' ? 'Receita' : 'Despesa'}
            </Link>
          ))}
        </nav>
        <CategoryFormButton label="Nova categoria" kind={kind} parents={parents} />
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
        {tree.map((node) => (
          <li key={node.id}>
            <ul>
              <CategoryRow category={node} parents={parents} hasChildren={node.children.length > 0} />
              {node.children.map((child) => (
                <CategoryRow key={child.id} category={child} parents={parents} hasChildren={false} child />
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {archived.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground">Arquivadas ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface px-4 opacity-75">
            {archived.map((category) => (
              <CategoryRow key={category.id} category={category} parents={parents} hasChildren={false} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}
```

Em `app/(app)/configuracoes/page.tsx`:
- acrescente `import Link from 'next/link'` e `import { Tags } from 'lucide-react'` (junto do import de `LogOut`: `import { LogOut, Tags } from 'lucide-react'`);
- logo antes do Card "Sessão", acrescente:
```tsx
        <Card>
          <CardHeader>
            <CardTitle>Categorias</CardTitle>
            <CardDescription>Receitas e despesas, com subcategorias, ícones e cores.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/configuracoes/categorias">
                <Tags className="size-4" aria-hidden />
                Gerenciar categorias
              </Link>
            </Button>
          </CardContent>
        </Card>
```

- [ ] **Step 6: Verificar**

Run: `npm test && npm run lint && npm run build`
Expected: tudo passa; o build lista `/configuracoes/categorias`.

Smoke (servidor `npx next dev -p 3123` em background + script de smoke do scratchpad com usuário temporário, acrescentando o caminho `/configuracoes/categorias` e os textos `Mercado`, `Nova categoria`): Expected `200` com os textos. Pare o servidor ao terminar.

- [ ] **Step 7: Commit**

```bash
git add lib/categories-query.ts lib/actions/categories.ts components/layout/responsive-modal.tsx components/form components/categories "app/(app)/configuracoes"
git commit -m "feat(categorias): tela de categorias com subcategorias, ícones e cores" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Contas — saldo, extrato e cadastro

**Files:**
- Create: `lib/accounts.ts`, `lib/transactions.ts`, `lib/actions/accounts.ts`, `components/form/money-input.tsx`, `components/accounts/account-type-icon.tsx`, `components/accounts/account-form.tsx`, `components/accounts/account-actions.tsx`, `components/accounts/statement-list.tsx`, `app/(app)/contas/[id]/page.tsx`
- Modify: `app/(app)/contas/page.tsx` (substitui o placeholder)

**Interfaces:**
- Consumes: `buildStatement`, `Statement` (Task 2); `formatBRL`, `formatSignedBRL` (Task 1/Fase 1); `maskCurrencyInput`, `formatCentsPlain` (Task 1); `accountSchema`, `ACCOUNT_TYPES`, `ACCOUNT_TYPE_LABELS`, `AccountType`, `AccountFormInput`, `AccountOutput`, `uuidSchema` (Task 3); `rowToLedger`, `TRANSACTION_COLUMNS`, `TransactionRow` (Task 3); `listCategories`, `ResponsiveModal`, `NativeSelect`, `ColorPicker`, `CategoryIcon` (Task 6); `resolveYearMonth`, `todayISO`, `formatISODateBR` (`lib/dates.ts`)
- Produces:
  - `type AccountWithBalance = { id: string; name: string; institution: string | null; type: AccountType; initialBalanceCents: number; initialBalanceDate: string; color: string; archived: boolean; balanceCents: number }`
  - `listAccounts(options?: { includeArchived?: boolean }): Promise<AccountWithBalance[]>`, `getAccount(id: string): Promise<AccountWithBalance | null>`, `toLedgerAccount(account: AccountWithBalance): LedgerAccount`
  - `listAccountTransactions(accountId: string): Promise<TransactionRow[]>`
  - `createAccount`, `updateAccount`, `setAccountArchived`, `deleteAccount`
  - `MoneyInput({ valueCents, onChangeCents, size?, ...inputProps })`
  - `AccountFormButton({ accountId?, initial?, label, variant? })`

- [ ] **Step 1: Consultas server-only**

`lib/accounts.ts`:
```ts
import 'server-only'
import type { LedgerAccount } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/validation/account'

export type AccountWithBalance = {
  id: string
  name: string
  institution: string | null
  type: AccountType
  initialBalanceCents: number
  initialBalanceDate: string
  color: string
  archived: boolean
  balanceCents: number
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

type AccountRow = {
  id: string
  name: string
  institution: string | null
  type: string
  initial_balance_cents: number
  initial_balance_date: string
  color: string
  archived: boolean
}

const COLUMNS = 'id, name, institution, type, initial_balance_cents, initial_balance_date, color, archived'

async function loadBalances(supabase: SupabaseServer): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('v_account_balances').select('account_id, balance_cents')
  if (error) throw error
  const balances = new Map<string, number>()
  for (const row of data) if (row.account_id) balances.set(row.account_id, Number(row.balance_cents ?? 0))
  return balances
}

function toAccount(row: AccountRow, balances: Map<string, number>): AccountWithBalance {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    type: row.type as AccountType,
    initialBalanceCents: row.initial_balance_cents,
    initialBalanceDate: row.initial_balance_date,
    color: row.color,
    archived: row.archived,
    balanceCents: balances.get(row.id) ?? row.initial_balance_cents,
  }
}

export async function listAccounts({ includeArchived = false }: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const supabase = await createClient()
  let query = supabase.from('accounts').select(COLUMNS).order('name')
  if (!includeArchived) query = query.eq('archived', false)
  const [{ data, error }, balances] = await Promise.all([query, loadBalances(supabase)])
  if (error) throw error
  return data.map((row) => toAccount(row, balances))
}

export async function getAccount(id: string): Promise<AccountWithBalance | null> {
  const supabase = await createClient()
  const [{ data, error }, balances] = await Promise.all([
    supabase.from('accounts').select(COLUMNS).eq('id', id).maybeSingle(),
    loadBalances(supabase),
  ])
  if (error) throw error
  return data ? toAccount(data, balances) : null
}

export function toLedgerAccount(account: AccountWithBalance): LedgerAccount {
  return { id: account.id, initialBalanceCents: account.initialBalanceCents, initialBalanceDate: account.initialBalanceDate }
}
```

`lib/transactions.ts`:
```ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'

/** Todos os lançamentos que envolvem a conta (origem ou destino), em ordem cronológica. `accountId` já validado como uuid. */
export async function listAccountTransactions(accountId: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .or(`account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
    .order('date')
    .order('created_at')
  if (error) throw error
  return data as TransactionRow[]
}
```

- [ ] **Step 2: `lib/actions/accounts.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentHousehold } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { accountSchema, type AccountOutput } from '@/lib/validation/account'
import { uuidSchema } from '@/lib/validation/common'

function toRow(input: AccountOutput) {
  return {
    name: input.name,
    institution: input.institution,
    type: input.type,
    initial_balance_cents: input.initialBalanceCents,
    initial_balance_date: input.initialBalanceDate,
    color: input.color,
  }
}

function done() {
  revalidatePath('/', 'layout')
}

export async function createAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = accountSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accounts')
    .insert({ household_id: household.id, ...toRow(parsed.data) })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateAccount(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = accountSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase.from('accounts').update(toRow(parsed.data)).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function setAccountArchived(id: unknown, archived: boolean): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('accounts').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function deleteAccount(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('accounts').delete().eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
```

- [ ] **Step 3: `components/form/money-input.tsx` e ícone do tipo de conta**

`components/form/money-input.tsx`:
```tsx
'use client'

import { formatCentsPlain, maskCurrencyInput } from '@/lib/finance/currency-input'
import { cn } from '@/lib/utils'

type MoneyInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'size' | 'type'> & {
  valueCents: number
  onChangeCents: (cents: number) => void
  size?: 'md' | 'lg'
}

/** Campo de valor com máscara de moeda (dígitos entram pela direita) e teclado numérico. */
export function MoneyInput({ valueCents, onChangeCents, size = 'md', className, ...props }: MoneyInputProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
      value={valueCents > 0 ? formatCentsPlain(valueCents) : ''}
      onChange={(event) => onChangeCents(maskCurrencyInput(event.target.value).cents)}
      className={cn(
        'w-full min-w-0 text-right tabular-nums outline-none placeholder:text-muted-foreground',
        size === 'lg'
          ? 'bg-transparent text-4xl font-semibold'
          : 'h-9 rounded-lg border border-input bg-surface-2 px-2.5 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  )
}
```

`components/accounts/account-type-icon.tsx`:
```tsx
import { Landmark, PiggyBank, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { createElement } from 'react'
import type { AccountType } from '@/lib/validation/account'

const ICONS: Record<AccountType, LucideIcon> = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Wallet,
  investment: TrendingUp,
}

export function AccountTypeIcon({ type, className }: { type: AccountType; className?: string }) {
  return createElement(ICONS[type], { className, 'aria-hidden': true })
}
```

- [ ] **Step 4: Formulário e ações de conta**

`components/accounts/account-form.tsx`:
```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ColorPicker } from '@/components/form/color-picker'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createAccount, updateAccount } from '@/lib/actions/accounts'
import { COLOR_PALETTE } from '@/lib/categories'
import { todayISO } from '@/lib/dates'
import { applyActionErrors } from '@/lib/forms'
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  accountSchema,
  type AccountFormInput,
  type AccountOutput,
} from '@/lib/validation/account'

type AccountFormProps = { accountId?: string; initial?: AccountFormInput; onDone: () => void }

function AccountForm({ accountId, initial, onDone }: AccountFormProps) {
  const router = useRouter()
  const form = useForm<AccountFormInput, unknown, AccountOutput>({
    resolver: zodResolver(accountSchema),
    defaultValues: initial ?? {
      name: '',
      institution: '',
      type: 'checking',
      initialBalanceCents: 0,
      initialBalanceDate: todayISO(),
      color: COLOR_PALETTE[0],
    },
  })
  const [negative, setNegative] = useState((initial?.initialBalanceCents ?? 0) < 0)
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = accountId ? await updateAccount(accountId, values) : await createAccount(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(accountId ? 'Conta atualizada.' : 'Conta criada.')
    router.refresh()
    onDone()
  })

  function toggleNegative(checked: boolean) {
    setNegative(checked)
    const current = Math.abs(form.getValues('initialBalanceCents'))
    form.setValue('initialBalanceCents', checked ? -current : current)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2" noValidate>
      <Field id="account-name" label="Nome" error={errors.name?.message}>
        <Input
          id="account-name"
          placeholder="Ex.: Itaú conjunta"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'account-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>
      <Field id="account-institution" label="Banco/instituição (opcional)" error={errors.institution?.message}>
        <Input id="account-institution" autoComplete="off" {...form.register('institution')} />
      </Field>
      <Field id="account-type" label="Tipo" error={errors.type?.message}>
        <NativeSelect id="account-type" {...form.register('type')}>
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="account-initial" label="Saldo inicial (R$)" error={errors.initialBalanceCents?.message}>
          <Controller
            control={form.control}
            name="initialBalanceCents"
            render={({ field }) => (
              <MoneyInput
                id="account-initial"
                valueCents={Math.abs(field.value)}
                onChangeCents={(cents) => field.onChange(negative ? -cents : cents)}
              />
            )}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={negative} onChange={(event) => toggleNegative(event.target.checked)} />
            Saldo negativo
          </label>
        </Field>
        <Field id="account-initial-date" label="Data do saldo inicial" error={errors.initialBalanceDate?.message}>
          <Input id="account-initial-date" type="date" {...form.register('initialBalanceDate')} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cor</legend>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => <ColorPicker label="Cor da conta" value={field.value} onChange={field.onChange} />}
        />
      </fieldset>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

type AccountFormButtonProps = {
  accountId?: string
  initial?: AccountFormInput
  label: string
  variant?: 'default' | 'outline'
}

export function AccountFormButton({ accountId, initial, label, variant = 'default' }: AccountFormButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {accountId ? <Pencil aria-hidden /> : <Plus aria-hidden />}
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={accountId ? 'Editar conta' : 'Nova conta'}>
        {open ? <AccountForm accountId={accountId} initial={initial} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
```

`components/accounts/account-actions.tsx`:
```tsx
'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteAccount, setAccountArchived } from '@/lib/actions/accounts'
import type { AccountFormInput } from '@/lib/validation/account'
import { AccountFormButton } from './account-form'

type AccountActionsProps = { id: string; archived: boolean; initial: AccountFormInput }

export function AccountActions({ id, archived, initial }: AccountActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggleArchive() {
    startTransition(async () => {
      const result = await setAccountArchived(id, !archived)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(archived ? 'Conta reativada.' : 'Conta arquivada.')
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm('Excluir esta conta? Só é possível se ela não tiver lançamentos.')) return
    startTransition(async () => {
      const result = await deleteAccount(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Conta excluída.')
      router.push('/contas')
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <AccountFormButton accountId={id} initial={initial} label="Editar" variant="outline" />
      <Button variant="outline" onClick={toggleArchive} disabled={pending}>
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {archived ? 'Desarquivar' : 'Arquivar'}
      </Button>
      <Button variant="outline" onClick={remove} disabled={pending} className="text-expense">
        <Trash2 aria-hidden />
        Excluir
      </Button>
    </div>
  )
}
```

`components/accounts/statement-list.tsx`:
```tsx
import { ArrowLeftRight } from 'lucide-react'
import { CategoryIcon } from '@/components/categories/category-icon'
import type { Category } from '@/lib/categories'
import { formatISODateBR } from '@/lib/dates'
import type { Statement } from '@/lib/finance/balance'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import type { LedgerTransaction } from '@/lib/finance/types'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'

type StatementTransaction = LedgerTransaction & { row: TransactionRow }

type StatementListProps = {
  statement: Statement<StatementTransaction>
  categories: Category[]
  accountNames: Map<string, string>
  initialBalanceDate: string
}

export function StatementList({ statement, categories, accountNames, initialBalanceDate }: StatementListProps) {
  if (statement.beforeInitialDate) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
        Esta conta começou em {formatISODateBR(initialBalanceDate)}.
      </p>
    )
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]))

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex justify-between px-4 py-3 text-sm">
        <span className="text-muted-foreground">Saldo de abertura</span>
        <span className="tabular-nums">{formatBRL(statement.openingCents)}</span>
      </div>
      {statement.rows.length === 0 ? (
        <p className="border-y border-border px-4 py-6 text-center text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {statement.rows.map(({ transaction, deltaCents, runningCents }) => {
            const row = transaction.row
            const category = row.category_id ? categoryById.get(row.category_id) : undefined
            const isTransfer = row.type === 'transfer'
            const note =
              runningCents === null ? (row.status === 'pending' ? 'previsto' : 'antes do saldo inicial') : null
            const subtitle = [
              formatISODateBR(row.date),
              isTransfer
                ? `${accountNames.get(row.account_id) ?? '?'} → ${accountNames.get(row.destination_account_id ?? '') ?? '?'}`
                : category?.name,
              note,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                {isTransfer ? (
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
                    <ArrowLeftRight className="size-4" />
                  </span>
                ) : (
                  <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.description}</p>
                  <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className={cn('font-medium', deltaCents >= 0 ? 'text-income' : 'text-expense', runningCents === null && 'opacity-60')}>
                    {formatSignedBRL(deltaCents)}
                  </p>
                  {runningCents !== null ? <p className="text-xs text-muted-foreground">{formatBRL(runningCents)}</p> : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex justify-between px-4 py-3 text-sm font-medium">
        <span>Saldo final do mês</span>
        <span className="tabular-nums">{formatBRL(statement.closingCents)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Telas `/contas` e `/contas/[id]`**

`app/(app)/contas/page.tsx` (substitui o conteúdo atual):
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccountFormButton } from '@/components/accounts/account-form'
import { AccountTypeIcon } from '@/components/accounts/account-type-icon'
import { PageHeader } from '@/components/layout/page-header'
import { listAccounts } from '@/lib/accounts'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { ACCOUNT_TYPE_LABELS } from '@/lib/validation/account'

export const metadata: Metadata = { title: 'Contas' }

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ arquivadas?: string }> }) {
  const { arquivadas } = await searchParams
  const showArchived = arquivadas === '1'
  const accounts = await listAccounts({ includeArchived: showArchived })
  const totalCents = accounts.filter((a) => !a.archived).reduce((sum, a) => sum + a.balanceCents, 0)

  return (
    <>
      <PageHeader title="Contas" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Saldo total</p>
          <p className={cn('text-3xl font-semibold tabular-nums', totalCents < 0 && 'text-expense')}>{formatBRL(totalCents)}</p>
        </div>
        <AccountFormButton label="Nova conta" />
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          Cadastre a primeira conta para começar a lançar.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <li key={account.id}>
              <Link
                href={`/contas/${account.id}`}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2',
                  account.archived && 'opacity-60',
                )}
              >
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: account.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{account.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <AccountTypeIcon type={account.type} className="size-3.5" />
                    {[account.institution, ACCOUNT_TYPE_LABELS[account.type], account.archived ? 'arquivada' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <p className={cn('shrink-0 font-medium tabular-nums', account.balanceCents < 0 && 'text-expense')}>
                  {formatBRL(account.balanceCents)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm">
        <Link href={showArchived ? '/contas' : '/contas?arquivadas=1'} className="text-muted-foreground underline underline-offset-4">
          {showArchived ? 'Ocultar arquivadas' : 'Mostrar arquivadas'}
        </Link>
      </p>
    </>
  )
}
```

`app/(app)/contas/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AccountActions } from '@/components/accounts/account-actions'
import { StatementList } from '@/components/accounts/statement-list'
import { PageHeader } from '@/components/layout/page-header'
import { getAccount, listAccounts, toLedgerAccount } from '@/lib/accounts'
import type { PaletteColor } from '@/lib/categories'
import { listCategories } from '@/lib/categories-query'
import { formatISODateBR, resolveYearMonth } from '@/lib/dates'
import { buildStatement } from '@/lib/finance/balance'
import { formatBRL } from '@/lib/finance/money'
import { rowToLedger } from '@/lib/transaction-mappers'
import { listAccountTransactions } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import { ACCOUNT_TYPE_LABELS } from '@/lib/validation/account'
import { uuidSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Conta' }

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mes?: string | string[] }>
}

export default async function AccountPage({ params, searchParams }: Props) {
  const [{ id }, { mes }] = await Promise.all([params, searchParams])
  if (!uuidSchema.safeParse(id).success) notFound()

  const account = await getAccount(id)
  if (!account) notFound()

  const ym = resolveYearMonth(mes)
  const [rows, categories, accounts] = await Promise.all([
    listAccountTransactions(id),
    listCategories(),
    listAccounts({ includeArchived: true }),
  ])
  const statement = buildStatement(
    toLedgerAccount(account),
    rows.map((row) => ({ ...rowToLedger(row), row })),
    ym,
  )

  return (
    <>
      <div className="mb-2">
        <Link href="/contas" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ Contas
        </Link>
      </div>
      <PageHeader title={account.name} ym={ym} basePath={`/contas/${id}`} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {[account.institution, ACCOUNT_TYPE_LABELS[account.type], account.archived ? 'arquivada' : null].filter(Boolean).join(' · ')}
          </p>
          <p className={cn('text-3xl font-semibold tabular-nums', account.balanceCents < 0 && 'text-expense')}>
            {formatBRL(account.balanceCents)}
          </p>
          <p className="text-xs text-muted-foreground">
            Saldo inicial de {formatBRL(account.initialBalanceCents)} em {formatISODateBR(account.initialBalanceDate)}
          </p>
        </div>
        <AccountActions
          id={account.id}
          archived={account.archived}
          initial={{
            name: account.name,
            institution: account.institution ?? '',
            type: account.type,
            initialBalanceCents: account.initialBalanceCents,
            initialBalanceDate: account.initialBalanceDate,
            color: account.color as PaletteColor,
          }}
        />
      </div>
      <StatementList
        statement={statement}
        categories={categories}
        accountNames={new Map(accounts.map((a) => [a.id, a.name]))}
        initialBalanceDate={account.initialBalanceDate}
      />
    </>
  )
}
```

- [ ] **Step 6: Verificar**

Run: `npm test && npm run lint && npm run build`
Expected: tudo passa; o build lista `/contas` e `/contas/[id]`.

Smoke (servidor em background + script do scratchpad estendido): criar uma conta para o usuário temporário com o cliente SSR (`accounts.insert`), acessar `/contas` (Expected `200` com o nome da conta e "Saldo total") e `/contas/<id>` (Expected `200` com "Saldo de abertura"); `/contas/nao-uuid` → `404`. Pare o servidor ao terminar.

- [ ] **Step 7: Commit**

```bash
git add lib/accounts.ts lib/transactions.ts lib/actions/accounts.ts components/form/money-input.tsx components/accounts "app/(app)/contas"
git commit -m "feat(contas): lista com saldos, extrato mensal e cadastro de contas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Formulário de lançamento e botão "+"

**Files:**
- Create: `lib/actions/transactions.ts`, `components/form/segmented.tsx`, `components/transactions/form-data-context.tsx`, `components/transactions/transaction-form.tsx`, `components/transactions/transaction-modal.tsx`
- Modify: `lib/categories-query.ts` (acrescenta `topCategoryIds`), `lib/profile.ts` (seleciona `last_account_id`), `components/layout/quick-add.tsx` (reescrito), `components/layout/bottom-nav.tsx`, `components/layout/sidebar.tsx`, `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `transactionSchema`, `transactionSnapshotSchema`, `TransactionSnapshot`, `TransactionFormValues`, `transactionFormResolver`, `uuidSchema` (Task 3); `inputToRow`, `rowToInput`, `TRANSACTION_COLUMNS`, `TransactionRow`, `pickDefaultAccountId` (Task 3); `rankCategories`, `activeCategories`, `buildCategoryTree`, `chipCategories`, `Category`, `CategoryKind` (Task 2); `defaultStatus` (Task 1); `todayISO`, `addDaysISO` (Task 1); `listAccounts` (Task 7); `listCategories`, `ResponsiveModal`, `NativeSelect`, `CategoryIcon` (Task 6); `MoneyInput` (Task 7); `getCurrentUser`, `getCurrentHousehold`, `getMyProfile` (Fase 1)
- Produces:
  - `topCategoryIds(kind: CategoryKind, limit?: number): Promise<string[]>`
  - `createTransaction(input: unknown): Promise<ActionResult<{ id: string }>>`, `updateTransaction(id: unknown, input: unknown): Promise<ActionResult>`, `deleteTransaction(id: unknown): Promise<ActionResult<TransactionSnapshot>>`, `restoreTransaction(snapshot: unknown): Promise<ActionResult>`
  - `type AccountOption = { id: string; name: string; color: string; archived: boolean; initialBalanceDate: string }`
  - `type TransactionFormData = { accounts: AccountOption[]; categories: Category[]; topCategoryIds: Record<CategoryKind, string[]>; lastAccountId: string | null }`
  - `TransactionFormDataProvider({ value, children })`, `useTransactionFormData()`
  - `Segmented<T>({ value, onChange, options, label })`
  - `TransactionModal({ open, onOpenChange, transactionId?, initial? })`
  - `QuickAddFab()`, `QuickAddButton()`

- [ ] **Step 1: `topCategoryIds` e `last_account_id`**

Acrescente a `lib/categories-query.ts` (e no topo: `import { rankCategories } from '@/lib/categories'` junto do import existente, e `import { addDaysISO, todayISO } from '@/lib/dates'`):
```ts
/** Categorias mais usadas do tipo nos últimos 90 dias (chips do formulário). */
export async function topCategoryIds(kind: CategoryKind, limit = 6): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('category_id')
    .eq('type', kind)
    .gte('date', addDaysISO(todayISO(), -90))
    .order('date', { ascending: false })
    .limit(500)
  if (error) throw error
  return rankCategories(
    data.map((row) => row.category_id),
    limit,
  )
}
```

Em `lib/profile.ts`, troque `.select('user_id, display_name')` por `.select('user_id, display_name, last_account_id')`.

- [ ] **Step 2: `lib/actions/transactions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { getCurrentHousehold } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { inputToRow, rowToInput, TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'
import { uuidSchema } from '@/lib/validation/common'
import { transactionSchema, transactionSnapshotSchema, type TransactionSnapshot } from '@/lib/validation/transaction'

function done() {
  revalidatePath('/', 'layout')
}

export async function createTransaction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const [user, household] = await Promise.all([getCurrentUser(), getCurrentHousehold()])
  if (!user || !household) return { ok: false, error: translateError({ message: 'NOT_AUTHENTICATED' }) }

  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').insert(inputToRow(parsed.data, household.id)).select('id').single()
  if (error) return { ok: false, error: translateError(error) }

  // Lembra a conta usada por quem lançou (falha aqui não desfaz o lançamento)
  await supabase.from('profiles').update({ last_account_id: parsed.data.accountId }).eq('user_id', user.id)

  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateTransaction(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .update(inputToRow(parsed.data, household.id))
    .eq('id', parsedId.data)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function deleteTransaction(id: unknown): Promise<ActionResult<TransactionSnapshot>> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').delete().eq('id', parsedId.data).select(TRANSACTION_COLUMNS)
  if (error) return { ok: false, error: translateError(error) }
  const row = (data as TransactionRow[])[0]
  if (!row) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: { id: row.id, input: rowToInput(row) } }
}

export async function restoreTransaction(snapshot: unknown): Promise<ActionResult> {
  const parsed = transactionSnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { error } = await supabase
    .from('transactions')
    .insert({ id: parsed.data.id, ...inputToRow(parsed.data.input, household.id) })
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: null }
}
```

- [ ] **Step 3: Contexto dos dados do formulário e controle segmentado**

`components/transactions/form-data-context.tsx`:
```tsx
'use client'

import { createContext, useContext } from 'react'
import type { Category, CategoryKind } from '@/lib/categories'

export type AccountOption = { id: string; name: string; color: string; archived: boolean; initialBalanceDate: string }

export type TransactionFormData = {
  accounts: AccountOption[]
  categories: Category[]
  topCategoryIds: Record<CategoryKind, string[]>
  lastAccountId: string | null
}

const TransactionFormDataContext = createContext<TransactionFormData | null>(null)

export function TransactionFormDataProvider({ value, children }: { value: TransactionFormData; children: React.ReactNode }) {
  return <TransactionFormDataContext.Provider value={value}>{children}</TransactionFormDataContext.Provider>
}

export function useTransactionFormData(): TransactionFormData {
  const value = useContext(TransactionFormDataContext)
  if (!value) throw new Error('useTransactionFormData precisa estar dentro de TransactionFormDataProvider')
  return value
}
```

`components/form/segmented.tsx`:
```tsx
'use client'

import { cn } from '@/lib/utils'

type SegmentedProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  label: string
}

export function Segmented<T extends string>({ value, onChange, options, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-surface-2 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: `components/transactions/transaction-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/categories/category-icon'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { Segmented } from '@/components/form/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTransaction, deleteTransaction, restoreTransaction, updateTransaction } from '@/lib/actions/transactions'
import { activeCategories, buildCategoryTree, chipCategories, type Category } from '@/lib/categories'
import { addDaysISO, todayISO } from '@/lib/dates'
import { defaultStatus } from '@/lib/finance/status'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { applyActionErrors } from '@/lib/forms'
import { pickDefaultAccountId } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'
import { toTransactionInput, transactionFormResolver, type TransactionFormValues } from '@/lib/validation/transaction'
import { useTransactionFormData } from './form-data-context'

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'transfer', label: 'Transferência' },
] as const

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Pago' },
  { value: 'pending', label: 'Pendente' },
] as const

function CategoryOption({ category, selected, onSelect }: { category: Category; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(category.id)}
      aria-pressed={selected}
      className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', selected ? 'bg-primary/15' : 'hover:bg-surface-2')}
    >
      <CategoryIcon name={category.icon} color={category.color} className="size-7" />
      {category.name}
    </button>
  )
}

type TransactionFormProps = { transactionId?: string; initial?: TransactionFormValues; onDone: () => void }

export function TransactionForm({ transactionId, initial, onDone }: TransactionFormProps) {
  const data = useTransactionFormData()
  const [today] = useState(() => todayISO())
  const activeAccounts = data.accounts.filter((account) => !account.archived)
  const form = useForm<TransactionFormValues>({
    resolver: transactionFormResolver,
    defaultValues: initial ?? {
      type: 'expense',
      amountCents: 0,
      description: '',
      categoryId: '',
      accountId: pickDefaultAccountId(activeAccounts, data.lastAccountId) ?? '',
      destinationAccountId: '',
      date: today,
      status: 'paid',
      notes: '',
    },
  })
  const [statusTouched, setStatusTouched] = useState(Boolean(initial))
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showNotes, setShowNotes] = useState(Boolean(initial?.notes))
  const { errors, isSubmitting } = form.formState

  const type = form.watch('type')
  const date = form.watch('date')
  const status = form.watch('status')
  const accountId = form.watch('accountId')
  const destinationAccountId = form.watch('destinationAccountId')
  const categoryId = form.watch('categoryId')

  const kind = type === 'income' ? 'income' : 'expense'
  const candidates = activeCategories(data.categories).filter((category) => category.kind === kind)
  const chips = chipCategories(candidates, data.topCategoryIds[kind], 6)
  const selectedCategory = data.categories.find((category) => category.id === categoryId)
  const visibleChips =
    selectedCategory && !chips.some((chip) => chip.id === selectedCategory.id) ? [selectedCategory, ...chips] : chips
  const tree = buildCategoryTree(candidates)

  const accountOptions = (selectedId: string) => data.accounts.filter((account) => !account.archived || account.id === selectedId)
  const touchedAccounts = type === 'transfer' ? [accountId, destinationAccountId] : [accountId]
  const beforeInitialBalance = touchedAccounts.some((id) => {
    const account = data.accounts.find((a) => a.id === id)
    return account ? date < account.initialBalanceDate : false
  })

  const revalidate = { shouldValidate: form.formState.isSubmitted }

  function changeType(value: TransactionType) {
    form.setValue('type', value)
    form.setValue('categoryId', '', revalidate)
    setShowAllCategories(false)
  }

  function changeDate(value: string) {
    form.setValue('date', value, revalidate)
    if (!statusTouched && value) form.setValue('status', defaultStatus(value, today))
  }

  function changeStatus(value: TransactionStatus) {
    setStatusTouched(true)
    form.setValue('status', value)
  }

  function selectCategory(id: string) {
    form.setValue('categoryId', id, revalidate)
    setShowAllCategories(false)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const input = toTransactionInput(values)
    const result = transactionId ? await updateTransaction(transactionId, input) : await createTransaction(input)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(transactionId ? 'Lançamento atualizado.' : 'Lançamento salvo.')
    onDone()
  })

  async function onDelete() {
    if (!transactionId) return
    const result = await deleteTransaction(transactionId)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const snapshot = result.data
    toast('Lançamento excluído.', {
      action: {
        label: 'Desfazer',
        onClick: async () => {
          const restored = await restoreTransaction(snapshot)
          if (restored.ok) toast.success('Lançamento restaurado.')
          else toast.error(restored.error)
        },
      },
    })
    onDone()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-2" noValidate>
      <Segmented label="Tipo de lançamento" value={type} options={TYPE_OPTIONS} onChange={changeType} />

      <div>
        <label htmlFor="tx-amount" className="text-sm text-muted-foreground">
          Valor
        </label>
        <div className="flex items-baseline gap-2 border-b border-border pb-2">
          <span className="text-2xl text-muted-foreground">R$</span>
          <Controller
            control={form.control}
            name="amountCents"
            render={({ field }) => (
              <MoneyInput
                id="tx-amount"
                size="lg"
                autoFocus={!transactionId}
                valueCents={field.value}
                onChangeCents={field.onChange}
                aria-invalid={Boolean(errors.amountCents)}
                aria-describedby={errors.amountCents ? 'tx-amount-error' : undefined}
              />
            )}
          />
        </div>
        {errors.amountCents ? (
          <p id="tx-amount-error" role="alert" className="mt-1 text-sm text-expense">
            {errors.amountCents.message}
          </p>
        ) : null}
      </div>

      <Field id="tx-description" label="Descrição" error={errors.description?.message}>
        <Input
          id="tx-description"
          autoComplete="off"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? 'tx-description-error' : undefined}
          {...form.register('description')}
        />
      </Field>

      {type !== 'transfer' ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Categoria</legend>
          <div className="flex flex-wrap gap-2">
            {visibleChips.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category.id)}
                aria-pressed={categoryId === category.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  categoryId === category.id
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                {category.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowAllCategories((value) => !value)}
              aria-expanded={showAllCategories}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground"
            >
              {showAllCategories ? 'Menos' : 'Todas'}
            </button>
          </div>
          {showAllCategories ? (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {tree.map((node) => (
                <li key={node.id}>
                  <CategoryOption category={node} selected={categoryId === node.id} onSelect={selectCategory} />
                  {node.children.length > 0 ? (
                    <ul className="ml-6">
                      {node.children.map((child) => (
                        <li key={child.id}>
                          <CategoryOption category={child} selected={categoryId === child.id} onSelect={selectCategory} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {errors.categoryId ? (
            <p role="alert" className="text-sm text-expense">
              {errors.categoryId.message}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className={cn('grid gap-4', type === 'transfer' && 'sm:grid-cols-2')}>
        <Field id="tx-account" label={type === 'transfer' ? 'De' : 'Conta'} error={errors.accountId?.message}>
          <NativeSelect
            id="tx-account"
            aria-invalid={Boolean(errors.accountId)}
            aria-describedby={errors.accountId ? 'tx-account-error' : undefined}
            {...form.register('accountId')}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {accountOptions(accountId).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {type === 'transfer' ? (
          <Field id="tx-destination" label="Para" error={errors.destinationAccountId?.message}>
            <NativeSelect
              id="tx-destination"
              aria-invalid={Boolean(errors.destinationAccountId)}
              aria-describedby={errors.destinationAccountId ? 'tx-destination-error' : undefined}
              {...form.register('destinationAccountId')}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {accountOptions(destinationAccountId).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>

      <Field id="tx-date" label="Data" error={errors.date?.message}>
        <div className="flex gap-2">
          <Input
            id="tx-date"
            type="date"
            value={date}
            onChange={(event) => changeDate(event.target.value)}
            aria-invalid={Boolean(errors.date)}
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={() => changeDate(today)}>
            Hoje
          </Button>
          <Button type="button" variant="outline" onClick={() => changeDate(addDaysISO(today, -1))}>
            Ontem
          </Button>
        </div>
      </Field>
      {beforeInitialBalance ? (
        <p className="-mt-3 text-sm text-warning">Este lançamento não afeta o saldo atual desta conta (data anterior ao saldo inicial).</p>
      ) : null}

      <Segmented label="Status" value={status} options={STATUS_OPTIONS} onChange={changeStatus} />

      {showNotes ? (
        <Field id="tx-notes" label="Observação" error={errors.notes?.message}>
          <textarea
            id="tx-notes"
            rows={3}
            className="w-full rounded-lg border border-input bg-surface-2 px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            {...form.register('notes')}
          />
        </Field>
      ) : (
        <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setShowNotes(true)}>
          + Observação
        </button>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : 'Salvar'}
        </Button>
        {transactionId ? (
          <Button type="button" variant="outline" className="text-expense" onClick={onDelete} disabled={isSubmitting}>
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  )
}
```

- [ ] **Step 5: Modal do lançamento e botões "+"**

`components/transactions/transaction-modal.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import type { TransactionFormValues } from '@/lib/validation/transaction'
import { useTransactionFormData } from './form-data-context'
import { TransactionForm } from './transaction-form'

type TransactionModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionId?: string
  initial?: TransactionFormValues
}

export function TransactionModal({ open, onOpenChange, transactionId, initial }: TransactionModalProps) {
  const data = useTransactionFormData()
  const hasAccounts = data.accounts.some((account) => !account.archived)

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={transactionId ? 'Editar lançamento' : 'Novo lançamento'}>
      {!open ? null : hasAccounts || transactionId ? (
        <TransactionForm key={transactionId ?? 'new'} transactionId={transactionId} initial={initial} onDone={() => onOpenChange(false)} />
      ) : (
        <div className="space-y-4 pb-2 text-center">
          <p className="text-muted-foreground">Cadastre sua primeira conta para começar a lançar.</p>
          <Button asChild className="w-full">
            <Link href="/contas" onClick={() => onOpenChange(false)}>
              Ir para Contas
            </Link>
          </Button>
        </div>
      )}
    </ResponsiveModal>
  )
}
```

`components/layout/quick-add.tsx` (substitui o arquivo inteiro):
```tsx
'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { TransactionModal } from '@/components/transactions/transaction-modal'
import { Button } from '@/components/ui/button'

const TITLE = 'Novo lançamento'

/** Botão "+" central da barra inferior (celular). */
export function QuickAddFab() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="icon" className="size-12 rounded-full shadow-lg" aria-label={TITLE} onClick={() => setOpen(true)}>
        <Plus className="size-6" aria-hidden />
      </Button>
      <TransactionModal open={open} onOpenChange={setOpen} />
    </>
  )
}

/** Botão "Novo lançamento" do menu lateral (desktop). */
export function QuickAddButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {TITLE}
      </Button>
      <TransactionModal open={open} onOpenChange={setOpen} />
    </>
  )
}
```

Em `components/layout/bottom-nav.tsx`: troque `import { QuickAddSheetButton } from './quick-add'` por `import { QuickAddFab } from './quick-add'` e `<QuickAddSheetButton />` por `<QuickAddFab />`.

Em `components/layout/sidebar.tsx`: troque `import { QuickAddDialogButton } from './quick-add'` por `import { QuickAddButton } from './quick-add'` e `<QuickAddDialogButton />` por `<QuickAddButton />`.

- [ ] **Step 6: Provider no layout do app**

`app/(app)/layout.tsx` (substitui o conteúdo):
```tsx
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Sidebar } from '@/components/layout/sidebar'
import { TransactionFormDataProvider, type TransactionFormData } from '@/components/transactions/form-data-context'
import { listAccounts } from '@/lib/accounts'
import { listCategories, topCategoryIds } from '@/lib/categories-query'
import { getCurrentHousehold } from '@/lib/household'
import { getMyProfile } from '@/lib/profile'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const household = await getCurrentHousehold()
  if (!household) redirect('/bem-vindo')

  const [accounts, categories, topExpense, topIncome, profile] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listCategories(),
    topCategoryIds('expense'),
    topCategoryIds('income'),
    getMyProfile(),
  ])

  const formData: TransactionFormData = {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      color: account.color,
      archived: account.archived,
      initialBalanceDate: account.initialBalanceDate,
    })),
    categories,
    topCategoryIds: { expense: topExpense, income: topIncome },
    lastAccountId: profile?.last_account_id ?? null,
  }

  return (
    <TransactionFormDataProvider value={formData}>
      <div className="min-h-dvh lg:flex">
        <Sidebar householdName={household.name} />
        <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-10">
          <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 lg:px-8 lg:pt-8">{children}</div>
        </main>
        <BottomNav />
      </div>
    </TransactionFormDataProvider>
  )
}
```

- [ ] **Step 7: Verificar**

Run: `npm test && npm run lint && npm run build`
Expected: tudo passa.

Smoke: com o servidor em background e o script do scratchpad (usuário temporário com casa e uma conta), `/inicio` → `200` (o layout carrega contas, categorias e chips sem erro). No navegador, com o usuário real: o "+" abre o formulário com a conta pré-selecionada e os chips; salvar uma despesa mostra "Lançamento salvo." e o saldo em `/contas` cai pelo valor. Pare o servidor ao terminar.

- [ ] **Step 8: Commit**

```bash
git add lib/actions/transactions.ts lib/categories-query.ts lib/profile.ts components/form/segmented.tsx components/transactions components/layout "app/(app)/layout.tsx"
git commit -m "feat(lancamentos): formulário rápido no botão + com conta lembrada e chips de categoria" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tela de lançamentos — lista do mês, busca, filtros, edição e desfazer

**Files:**
- Create: `components/transactions/transaction-item.tsx`, `components/transactions/transaction-list.tsx`, `components/transactions/month-summary.tsx`, `components/transactions/transactions-toolbar.tsx`
- Modify: `lib/transactions.ts` (acrescenta `listMonthTransactions`, `searchTransactions`), `components/layout/month-selector.tsx`, `components/layout/page-header.tsx`, `app/(app)/lancamentos/page.tsx` (substitui o placeholder)

**Interfaces:**
- Consumes: `parseTransactionsQuery`, `filterParams`, `buildTransactionsHref`, `hasActiveFilters`, `escapeLike`, `TransactionsQuery`, `TransactionFilters` (Task 4); `groupByDay`, `groupByMonth`, `splitPending` (Task 4); `summarizeMonth`, `MonthSummary` (Task 2); `expandCategoryFilter`, `buildCategoryTree`, `Category` (Task 2); `rowToLedger`, `rowToFormValues`, `TRANSACTION_COLUMNS`, `TransactionRow` (Task 3); `monthBounds` (Task 1); `formatBRL`, `formatSignedBRL`; `TransactionModal` (Task 8); `CategoryIcon`, `NativeSelect` (Task 6); `listCategories` (Task 6); `listAccounts` (Task 7)
- Produces:
  - `type TransactionQueryFilters = { type?: TransactionType; categoryIds?: string[]; accountId?: string; status?: TransactionStatus }`
  - `listMonthTransactions(ym: YearMonth, filters: TransactionQueryFilters): Promise<TransactionRow[]>`
  - `searchTransactions(q: string, filters: TransactionQueryFilters): Promise<TransactionRow[]>` (limite `SEARCH_LIMIT = 200`)
  - `MonthSelector` e `PageHeader` aceitam `extraParams?: Record<string, string>`

- [ ] **Step 1: Consultas da lista**

Acrescente a `lib/transactions.ts` (e ajuste os imports do topo para):
```ts
import 'server-only'
import { monthBounds, type YearMonth } from '@/lib/dates'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'
import { escapeLike } from '@/lib/transaction-filters'
import { TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'
```
```ts
export const SEARCH_LIMIT = 200

export type TransactionQueryFilters = {
  type?: TransactionType
  categoryIds?: string[]
  accountId?: string
  status?: TransactionStatus
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/** Filtros já validados (uuid/enum) por parseTransactionsQuery. */
function filteredQuery(supabase: SupabaseServer, filters: TransactionQueryFilters) {
  let query = supabase.from('transactions').select(TRANSACTION_COLUMNS)
  if (filters.type) query = query.eq('type', filters.type)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.accountId) query = query.or(`account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`)
  if (filters.categoryIds) query = query.in('category_id', filters.categoryIds)
  return query
}

export async function listMonthTransactions(ym: YearMonth, filters: TransactionQueryFilters): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { start, end } = monthBounds(ym)
  const { data, error } = await filteredQuery(supabase, filters)
    .gte('date', start)
    .lt('date', end)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as TransactionRow[]
}

/** Busca por descrição em todo o histórico (texto literal, sem curingas). */
export async function searchTransactions(q: string, filters: TransactionQueryFilters): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { data, error } = await filteredQuery(supabase, filters)
    .ilike('description', `%${escapeLike(q)}%`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(SEARCH_LIMIT)
  if (error) throw error
  return data as TransactionRow[]
}
```

- [ ] **Step 2: Seletor de mês preserva os filtros**

`components/layout/month-selector.tsx` (substitui):
```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatYearMonthLabel, formatYearMonthParam, shiftYearMonth, type YearMonth } from '@/lib/dates'

type MonthSelectorProps = { ym: YearMonth; basePath: string; extraParams?: Record<string, string> }

/** "‹ Outubro 2026 ›": o mês fica na URL (?mes=AAAA-MM); extraParams preserva filtros. */
export function MonthSelector({ ym, basePath, extraParams = {} }: MonthSelectorProps) {
  const previous = shiftYearMonth(ym, -1)
  const next = shiftYearMonth(ym, 1)
  const hrefFor = (target: YearMonth) =>
    `${basePath}?${new URLSearchParams({ mes: formatYearMonthParam(target), ...extraParams }).toString()}`

  return (
    <nav
      aria-label="Selecionar mês"
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-1 sm:justify-start"
    >
      <Button asChild variant="ghost" size="icon">
        <Link href={hrefFor(previous)} aria-label={`Mês anterior: ${formatYearMonthLabel(previous)}`}>
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <span className="min-w-36 text-center font-medium">{formatYearMonthLabel(ym)}</span>
      <Button asChild variant="ghost" size="icon">
        <Link href={hrefFor(next)} aria-label={`Próximo mês: ${formatYearMonthLabel(next)}`}>
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </nav>
  )
}
```

`components/layout/page-header.tsx` (substitui):
```tsx
import type { YearMonth } from '@/lib/dates'
import { MonthSelector } from './month-selector'

type PageHeaderProps = { title: string; ym?: YearMonth; basePath?: string; extraParams?: Record<string, string> }

export function PageHeader({ title, ym, basePath, extraParams }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {ym && basePath ? <MonthSelector ym={ym} basePath={basePath} extraParams={extraParams} /> : null}
    </header>
  )
}
```

- [ ] **Step 3: Item, lista e resumo**

`components/transactions/transaction-item.tsx`:
```tsx
import { ArrowLeftRight } from 'lucide-react'
import { CategoryIcon } from '@/components/categories/category-icon'
import type { Category } from '@/lib/categories'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'

type TransactionItemProps = {
  row: TransactionRow
  category?: Category
  accountLabel: string
  onClick: () => void
}

export function TransactionItem({ row, category, accountLabel, onClick }: TransactionItemProps) {
  const isTransfer = row.type === 'transfer'
  const amount = isTransfer ? formatBRL(row.amount_cents) : formatSignedBRL(row.type === 'income' ? row.amount_cents : -row.amount_cents)
  const subtitle = [isTransfer ? null : category?.name, accountLabel, row.status === 'pending' ? 'previsto' : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2">
      {isTransfer ? (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
          <ArrowLeftRight className="size-4" />
        </span>
      ) : (
        <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{row.description}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span
        className={cn(
          'shrink-0 text-right font-medium tabular-nums',
          isTransfer ? 'text-foreground' : row.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {isTransfer ? <span className="sr-only">Transferência de </span> : null}
        {amount}
      </span>
    </button>
  )
}
```

`components/transactions/transaction-list.tsx`:
```tsx
'use client'

import { useState } from 'react'
import type { Category } from '@/lib/categories'
import { groupByDay, groupByMonth, splitPending, type TransactionGroup } from '@/lib/transaction-grouping'
import { rowToFormValues, type TransactionRow } from '@/lib/transaction-mappers'
import { TransactionItem } from './transaction-item'
import { TransactionModal } from './transaction-modal'

type TransactionListProps = {
  rows: TransactionRow[]
  categories: Category[]
  accounts: { id: string; name: string }[]
  mode: 'month' | 'search'
}

type Section = { title: string | null; groups: TransactionGroup<TransactionRow>[] }

function buildSections(rows: TransactionRow[], mode: 'month' | 'search'): Section[] {
  if (mode === 'search') return [{ title: null, groups: groupByMonth(rows) }]
  const { pending, paid } = splitPending(rows)
  if (pending.length === 0) return [{ title: null, groups: groupByDay(paid) }]
  return [
    { title: 'Previsto', groups: groupByDay(pending) },
    { title: 'Realizado', groups: groupByDay(paid) },
  ]
}

export function TransactionList({ rows, categories, accounts, mode }: TransactionListProps) {
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
        {mode === 'search' ? 'Nenhum lançamento encontrado.' : 'Nenhum lançamento neste mês. Toque no + para lançar o primeiro.'}
      </div>
    )
  }

  const labelFor = (row: TransactionRow) =>
    row.type === 'transfer'
      ? `${accountName.get(row.account_id) ?? '?'} → ${accountName.get(row.destination_account_id ?? '') ?? '?'}`
      : (accountName.get(row.account_id) ?? '?')

  return (
    <>
      <div className="space-y-6">
        {buildSections(rows, mode).map((section) => (
          <section key={section.title ?? 'all'} className="space-y-4">
            {section.title ? <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h2> : null}
            {section.groups.map((group) => (
              <div key={`${section.title}-${group.key}`} className="rounded-xl border border-border bg-surface p-2">
                <h3 className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">{group.label}</h3>
                <ul>
                  {group.items.map((row) => (
                    <li key={row.id}>
                      <TransactionItem
                        row={row}
                        category={row.category_id ? categoryById.get(row.category_id) : undefined}
                        accountLabel={labelFor(row)}
                        onClick={() => setEditing(row)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
      <TransactionModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        transactionId={editing?.id}
        initial={editing ? rowToFormValues(editing) : undefined}
      />
    </>
  )
}
```

`components/transactions/month-summary.tsx`:
```tsx
import type { MonthSummary as Summary } from '@/lib/finance/summary'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, pending, tone, className }: { label: string; value: string; pending?: string; tone: string; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-3', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone)}>{value}</p>
      {pending ? <p className="text-xs text-muted-foreground tabular-nums">{pending}</p> : null}
    </div>
  )
}

export function MonthSummary({ summary }: { summary: Summary }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
        className="col-span-2 sm:col-span-1"
      />
    </div>
  )
}
```

- [ ] **Step 4: Barra de busca e filtros**

`components/transactions/transactions-toolbar.tsx`:
```tsx
'use client'

import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NativeSelect } from '@/components/form/native-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { buildCategoryTree, type Category } from '@/lib/categories'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { buildTransactionsHref, hasActiveFilters, type TransactionFilters, type TransactionsQuery } from '@/lib/transaction-filters'

type ToolbarProps = {
  query: TransactionsQuery
  categories: Category[]
  accounts: { id: string; name: string; archived: boolean }[]
}

function FilterControls({ query, categories, accounts, onChange }: ToolbarProps & { onChange: (filters: TransactionFilters) => void }) {
  const { filters } = query
  const set = (patch: TransactionFilters) => onChange({ ...filters, ...patch })
  const expenseTree = buildCategoryTree(categories.filter((c) => c.kind === 'expense'))
  const incomeTree = buildCategoryTree(categories.filter((c) => c.kind === 'income'))

  return (
    <>
      <NativeSelect aria-label="Tipo" value={filters.type ?? ''} onChange={(e) => set({ type: (e.target.value || undefined) as TransactionType | undefined })}>
        <option value="">Todos os tipos</option>
        <option value="expense">Despesas</option>
        <option value="income">Receitas</option>
        <option value="transfer">Transferências</option>
      </NativeSelect>
      <NativeSelect aria-label="Categoria" value={filters.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || undefined })}>
        <option value="">Todas as categorias</option>
        {[
          { label: 'Despesas', tree: expenseTree },
          { label: 'Receitas', tree: incomeTree },
        ].map(({ label, tree }) => (
          <optgroup key={label} label={label}>
            {tree.flatMap((node) => [
              <option key={node.id} value={node.id}>
                {node.name}
              </option>,
              ...node.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {`— ${child.name}`}
                </option>
              )),
            ])}
          </optgroup>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Conta" value={filters.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })}>
        <option value="">Todas as contas</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.archived ? `${account.name} (arquivada)` : account.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Status" value={filters.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as TransactionStatus | undefined })}>
        <option value="">Pagos e pendentes</option>
        <option value="paid">Pagos</option>
        <option value="pending">Pendentes</option>
      </NativeSelect>
    </>
  )
}

export function TransactionsToolbar({ query, categories, accounts }: ToolbarProps) {
  const router = useRouter()
  const [text, setText] = useState(query.q)
  const active = hasActiveFilters(query.filters)
  const activeCount = Object.values(query.filters).filter(Boolean).length

  useEffect(() => {
    if (text.trim() === query.q) return
    const timer = setTimeout(() => router.replace(buildTransactionsHref(query, { q: text.trim() })), 300)
    return () => clearTimeout(timer)
  }, [text, query, router])

  const applyFilters = (filters: TransactionFilters) => router.replace(buildTransactionsHref(query, { filters }))

  return (
    <div className="mb-6 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Buscar em todos os meses"
            aria-label="Buscar por descrição"
            className="pl-8"
          />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="lg:hidden">
              <SlidersHorizontal aria-hidden />
              Filtros{activeCount ? ` (${activeCount})` : ''}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription className="sr-only">Filtrar lançamentos</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 px-4">
              <FilterControls query={query} categories={categories} accounts={accounts} onChange={applyFilters} />
              {active ? (
                <Button variant="ghost" onClick={() => applyFilters({})}>
                  Limpar filtros
                </Button>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="hidden gap-2 lg:grid lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <FilterControls query={query} categories={categories} accounts={accounts} onChange={applyFilters} />
        <Button variant="ghost" onClick={() => applyFilters({})} disabled={!active}>
          <X aria-hidden />
          Limpar
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Página `/lancamentos`**

`app/(app)/lancamentos/page.tsx` (substitui o conteúdo):
```tsx
import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { MonthSummary } from '@/components/transactions/month-summary'
import { TransactionList } from '@/components/transactions/transaction-list'
import { TransactionsToolbar } from '@/components/transactions/transactions-toolbar'
import { listAccounts } from '@/lib/accounts'
import { expandCategoryFilter } from '@/lib/categories'
import { listCategories } from '@/lib/categories-query'
import { summarizeMonth } from '@/lib/finance/summary'
import { filterParams, parseTransactionsQuery } from '@/lib/transaction-filters'
import { rowToLedger } from '@/lib/transaction-mappers'
import { listMonthTransactions, SEARCH_LIMIT, searchTransactions } from '@/lib/transactions'

export const metadata: Metadata = { title: 'Lançamentos' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function TransactionsPage({ searchParams }: Props) {
  const query = parseTransactionsQuery(await searchParams)
  const [categories, accounts] = await Promise.all([listCategories(), listAccounts({ includeArchived: true })])

  const filters = {
    type: query.filters.type,
    status: query.filters.status,
    accountId: query.filters.accountId,
    categoryIds: query.filters.categoryId ? expandCategoryFilter(query.filters.categoryId, categories) : undefined,
  }
  const rows = query.q ? await searchTransactions(query.q, filters) : await listMonthTransactions(query.ym, filters)
  // Trocar de mês sai do modo busca: o seletor preserva só os filtros
  const monthParams = filterParams({ ...query, q: '' })

  return (
    <>
      <PageHeader title="Lançamentos" ym={query.q ? undefined : query.ym} basePath="/lancamentos" extraParams={monthParams} />
      <TransactionsToolbar
        query={query}
        categories={categories}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name, archived: account.archived }))}
      />
      {query.q ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {rows.length >= SEARCH_LIMIT
            ? `Mostrando os ${SEARCH_LIMIT} resultados mais recentes para "${query.q}".`
            : `${rows.length} ${rows.length === 1 ? 'resultado' : 'resultados'} para "${query.q}".`}
        </p>
      ) : (
        <MonthSummary summary={summarizeMonth(rows.map(rowToLedger))} />
      )}
      <TransactionList
        rows={rows}
        categories={categories}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
        mode={query.q ? 'search' : 'month'}
      />
    </>
  )
}
```


- [ ] **Step 6: Verificar**

Run: `npm test && npm run lint && npm run build`
Expected: tudo passa.

Smoke (servidor em background + script do scratchpad com usuário temporário, uma conta e três lançamentos — despesa paga, despesa pendente e transferência — inseridos pelo cliente SSR):
- `/lancamentos` → `200` com "Previsto", "Realizado", "Receitas" e a descrição dos lançamentos;
- `/lancamentos?q=<parte da descrição de um lançamento>` → `200` com "resultado";
- `/lancamentos?tipo=constructor&conta=x&categoria=%27%20or%201%3D1` → `200` (filtros ignorados).
Pare o servidor ao terminar.

- [ ] **Step 7: Commit**

```bash
git add lib/transactions.ts components/transactions components/layout/month-selector.tsx components/layout/page-header.tsx "app/(app)/lancamentos"
git commit -m "feat(lancamentos): lista do mês com resumo, busca em todo o histórico, filtros e desfazer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README, verificação final e parada para revisão

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tudo acima
- Produces: documentação atualizada

- [ ] **Step 1: Atualizar o README**

Em `README.md`, logo depois da seção "Usuários", acrescente:
```markdown
## Funcionalidades (até a Fase 2)

- **Contas** (`/contas`): corrente, poupança, carteira e investimento, com saldo inicial e data. O saldo considera só lançamentos pagos a partir dessa data. Cada conta tem extrato mensal com saldo acumulado.
- **Categorias** (`Configurações → Categorias`): receita e despesa, um nível de subcategoria, ícone e cor. As 19 categorias padrão são criadas com a casa.
- **Lançamentos** (`/lancamentos` e botão "+"): receita, despesa e transferência; status automático pela data; conta pré-selecionada com a última usada por cada pessoa; busca em todo o histórico, filtros na URL e "Desfazer" ao excluir.
- Contas e categorias com lançamentos não podem ser excluídas, só arquivadas.
```

- [ ] **Step 2: Rodar toda a verificação automatizada**

Run: `npm test && npm run test:rls && npm run lint && npm run build`
Expected: os quatro passam. Copie o resumo de cada um para o relatório.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README com as funcionalidades da Fase 2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: PARAR para revisão da Fase 2**

Apresente ao usuário, em pt-BR:
- os critérios de aceite da spec (seção 6), cada um com a evidência (saída de teste, smoke ou passo manual);
- o roteiro de teste manual: cadastrar duas contas (uma com saldo inicial em data passada), lançar uma despesa pelo celular cronometrando (< 10 s), conferir saldo e extrato, fazer uma transferência e ver que não entra no resumo do mês, buscar um lançamento de outro mês, excluir e desfazer, tentar excluir uma conta com lançamentos (deve sugerir arquivar), conferir 360px e 1440px;
- uma pergunta: pode integrar e seguir para o brainstorming da Fase 3 (cartões, faturas e parcelas)?

Não comece a Fase 3 sem aprovação.
