# Fase 3 — Cartões, faturas e parcelas: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cartões de crédito com faturas automáticas, compras à vista, parceladas e em andamento no formulário rápido, estornos, pagamento de fatura a partir de uma conta e a tela consolidada de parcelas.

**Architecture:** Regras puras em `lib/finance/` (ciclo da fatura, parcelas, uso do limite, redistribuição ao mudar os dias do cartão) são a fonte da verdade e têm testes Vitest. Server Actions calculam as linhas e gravam por RPCs Postgres atômicos (`create_card_purchase`, `apply_card_schedule`, `restore_transactions`, `ensure_invoice`, todos `security invoker`, então o RLS vale). O banco só garante integridade (mesma casa, fatura do mesmo cartão, formato de cada tipo). Status da fatura e status de compras no cartão são calculados na leitura.

**Tech Stack:** Next.js 16.3 (App Router), React 19.2, TypeScript strict, Tailwind 4, shadcn (Radix), lucide-react, Supabase (@supabase/ssr 0.12, supabase-js 2.117), zod 4, react-hook-form 7, date-fns 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-04-fase-3-cartoes-faturas-parcelas-design.md` (base: `docs/PRD.md`; Fase 2: `docs/superpowers/specs/2026-10-04-fase-2-contas-categorias-lancamentos-design.md`)

## Global Constraints

- Texto da interface em pt-BR; datas dd/mm/aaaa; fuso `America/Sao_Paulo`; moeda BRL.
- Valores sempre inteiros em centavos (`*_cents`, `amountCents`); conversão para reais só na exibição.
- Datas de calendário trafegam como string `AAAA-MM-DD`; meses de fatura como `AAAA-MM-01`. Nunca `new Date('AAAA-MM-DD')` para exibir (desloca o fuso) — use `formatISODateBR`/`formatYearMonthLabel`.
- Toda tabela nova: `household_id not null references households on delete cascade`, RLS + policy `public.is_household_member(household_id)`, `revoke all ... from anon`.
- Funções de trigger: `security definer`, `set search_path = ''`, `revoke all ... from public, anon, authenticated`. RPCs chamados pelo app: `security invoker`, `set search_path = ''`, `grant execute ... to authenticated`.
- Mudanças de schema só via `supabase/migrations/`; depois de aplicar (`npm run db:push`), `npm run db:types`.
- Fatura identificada por `(credit_card_id, closing_month)`; `reference_month` é o mês do vencimento e serve só para exibição.
- A parcela k fica na fatura de `first_closing_month + (k−1)` meses — nunca calcular a fatura de uma parcela pela data dela.
- Receitas e despesas no cartão (`account_id` nulo) têm status derivado da data na leitura (`effectiveStatus`); pagamentos de fatura usam o status salvo.
- Receita/despesa e status nunca diferenciados só pela cor: sinal `+`/`−`, ícone ou texto.
- Mobile-first: sem rolagem horizontal em 360px; desktop até `max-w-[1280px]`; valores com `tabular-nums` à direita.
- Comandos via Bash tool (Git Bash) a partir de `gusfer/`; não redirecionar com `>` no PowerShell.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Componentes shadcn são Radix (`asChild`); `cn` vem de `@/lib/utils`; mutações revalidam com `revalidatePath('/', 'layout')` (padrão das fases anteriores).

## Review Focus

1. Cartão com fechamento 29, 30 ou 31 e compras perto do fim do mês (inclusive fevereiro): as parcelas precisam cair em faturas consecutivas, sem pular nem repetir fatura. Teste no Task 2 (`buildCardPurchase`, caso 29/01 com fechamento 30) e no Task 1 (`cycleForDate` com fechamento 31 em fevereiro).
2. Mudar o dia de fechamento quando o novo fechamento da fatura aberta já passou: nenhuma compra pode ir para uma fatura fechada antes da mudança, nenhuma parcela pode ficar com duas na mesma fatura. Teste no Task 3 (`rescheduleCard`, destino fechado e plano com âncora antes da fatura aberta mais antiga).
3. Falha no meio de uma gravação de várias linhas (24 parcelas com uma inválida): nada pode ficar gravado. Teste no Task 5 (RPC atômico).
4. "Desfazer" depois de excluir "esta e as futuras" — inclusive quando o plano inteiro foi apagado — recria as mesmas linhas e o plano com os mesmos ids. Teste no Task 5 (`restore_transactions`) e no Task 6 (`deletionSnapshotSchema`).
5. Parâmetros de URL adulterados (`fatura=xyz`, `cartao=nao-uuid`, `tipo=constructor`) devem ser ignorados e a página renderizar normalmente. Teste no Task 4 (`parseTransactionsQuery` com `cartao`) e no Task 9 (`parseInvoiceParam`).

---

## Mapa de arquivos

```
supabase/migrations/20261004140000_cartoes_faturas_parcelas.sql   Task 5
tests/rls/cards.rls.test.ts                    Task 5
lib/
  finance/types.ts                             Task 1/4  CardSchedule, InvoiceCycle; invoice_payment; accountId nullable
  finance/invoice.ts (+test)                   Task 1/4  addMonthsClamped, shiftClosingMonth, cycleForClosingMonth, cycleForDate, invoiceStatus, summarizeInvoice
  finance/installments.ts (+test)              Task 2    splitInstallments, buildCardPurchase, installmentLabel
  finance/card.ts (+test)                      Task 3    cardUsage, usageLevel, rescheduleCard
  finance/installments-view.ts (+test)         Task 3    groupInstallmentsByMonth, totalCommitted
  finance/balance.ts, summary.ts (+tests)      Task 4    invoice_payment
  finance/status.ts (+test)                    Task 4    effectiveStatus
  transaction-filters.ts (+test)               Task 4    cartao, pagamento-fatura
  card-rpc.ts (+test)                          Task 5    argumentos dos RPCs
  supabase/errors.ts (+test)                   Task 5    INVALID_CARD, INVALID_INVOICE, INVALID_PLAN, INVALID_INPUT
  supabase/database.types.ts                   Task 5    regenerado
  transaction-mappers.ts (+test)               Task 5/6/8  colunas novas, applyEffectiveStatus, fontes de pagamento, installmentInfo
  validation/card.ts (+test)                   Task 6    cardSchema, marcas, CardOption
  validation/invoice-payment.ts (+test)        Task 6
  validation/transaction.ts (+test)            Task 6/8  cardTransactionSchema, installmentEditSchema, form values
  validation/transaction-record.ts (+test)     Task 6    snapshot de exclusão
  invoice-labels.ts (+test)                    Task 9    descrição do pagamento, títulos, links, parseInvoiceParam
  cards.ts                                     Task 7    listCards, getCard, listCardOptions (server-only)
  transactions.ts                              Task 9/10 listInvoiceTransactions; filtros cartao e status efetivo
  installments.ts                              Task 11   listUpcomingInstallments (server-only)
  profile.ts                                   Task 8    + last_credit_card_id
  actions/cards.ts                             Task 7
  actions/card-transactions.ts                 Task 8
  actions/transactions.ts                      Task 8    deleteTransaction com snapshot, restoreTransactions
  actions/invoices.ts                          Task 9
components/
  cards/usage-bar.tsx                          Task 7
  cards/card-form.tsx                          Task 7
  cards/card-actions.tsx                       Task 7
  cards/invoice-selector.tsx                   Task 9
  cards/invoice-status-badge.tsx               Task 9
  cards/invoice-transactions.tsx               Task 9
  cards/payment-form.tsx                       Task 9
  installments/installments-view.tsx           Task 11
  transactions/form-data-context.tsx           Task 8    cards, lastCreditCardId
  transactions/transaction-form.tsx            Task 6/8  Pagar com, parcelas, em andamento, escopo
  transactions/transaction-modal.tsx           Task 8
  transactions/transaction-item.tsx            Task 9
  transactions/transaction-list.tsx            Task 9/10
  transactions/transactions-toolbar.tsx        Task 10
  accounts/statement-list.tsx                  Task 5/10
app/(app)/
  layout.tsx                                   Task 8
  cartoes/page.tsx                             Task 7
  cartoes/[id]/page.tsx                        Task 9
  lancamentos/page.tsx                         Task 10
  parcelas/page.tsx                            Task 11
README.md                                      Task 12
```

Comandos de verificação usados em todas as tarefas:

- `npm test` — Vitest das regras puras (`lib/**/*.test.ts`).
- `npm run test:rls` — integração contra o Supabase (precisa de `.env.test.local`).
- `npx tsc --noEmit` — checagem de tipos de todo o projeto (inclui os testes).
- `npm run lint` e `npm run build`.

---

### Task 1: Ciclo da fatura

**Files:**
- Modify: `lib/finance/types.ts`
- Create: `lib/finance/invoice.ts`
- Test: `lib/finance/invoice.test.ts`

**Interfaces:**
- Consumes: `shiftYearMonth`, `yearMonthOfISO`, `formatYearMonthParam` de `lib/dates.ts`.
- Produces:
  - `type CardSchedule = { closingDay: number; dueDay: number }`
  - `type InvoiceCycle = { closingMonth: string; closingDate: string; dueDate: string; referenceMonth: string }`
  - `daysInMonth(year: number, month: number): number`
  - `addMonthsClamped(date: string, n: number): string`
  - `shiftClosingMonth(closingMonth: string, k: number): string`
  - `cycleForClosingMonth(card: CardSchedule, closingMonth: string): InvoiceCycle`
  - `cycleForDate(card: CardSchedule, date: string): InvoiceCycle`
  - `type InvoiceStatus = 'open' | 'closed' | 'paid' | 'overdue'`, `INVOICE_STATUS_LABELS`
  - `invoiceStatus(dates: { closingDate: string; dueDate: string }, amounts: { totalCents: number; paidCents: number }, today: string): InvoiceStatus`

- [ ] **Step 1: Adicionar os tipos em `lib/finance/types.ts`**

Acrescente ao final do arquivo:

```ts
/** Dias de fechamento e vencimento configurados no cartão (1–31). */
export type CardSchedule = { closingDay: number; dueDay: number }

/** Um ciclo de fatura. Datas em AAAA-MM-DD; meses sempre no dia 1 (AAAA-MM-01). */
export type InvoiceCycle = {
  /** Mês em que a fatura fecha — identidade do ciclo. */
  closingMonth: string
  closingDate: string
  dueDate: string
  /** Mês do vencimento ("fatura de novembro"), só para exibição. */
  referenceMonth: string
}
```

- [ ] **Step 2: Escrever os testes que falham**

Crie `lib/finance/invoice.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  addMonthsClamped,
  cycleForClosingMonth,
  cycleForDate,
  daysInMonth,
  invoiceStatus,
  shiftClosingMonth,
} from './invoice'

const card = { closingDay: 3, dueDay: 10 }

describe('daysInMonth e addMonthsClamped', () => {
  it('sabe quantos dias tem o mês', () => {
    expect(daysInMonth(2027, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it('soma meses ajustando para o último dia', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-11-15', 2)).toBe('2027-01-15')
    expect(addMonthsClamped('2026-01-29', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-10-04', 0)).toBe('2026-10-04')
  })

  it('desloca o mês de fechamento', () => {
    expect(shiftClosingMonth('2026-12-01', 1)).toBe('2027-01-01')
    expect(shiftClosingMonth('2026-01-01', -2)).toBe('2025-11-01')
  })
})

describe('cycleForDate (PRD 8.2)', () => {
  it('compra antes do fechamento cai na fatura que fecha no mesmo mês', () => {
    expect(cycleForDate(card, '2026-10-02')).toEqual({
      closingMonth: '2026-10-01',
      closingDate: '2026-10-03',
      dueDate: '2026-10-10',
      referenceMonth: '2026-10-01',
    })
  })

  it('compra no dia do fechamento vai para a fatura seguinte', () => {
    expect(cycleForDate(card, '2026-10-03')).toEqual({
      closingMonth: '2026-11-01',
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
      referenceMonth: '2026-11-01',
    })
  })

  it('vencimento menor ou igual ao fechamento vence no mês seguinte', () => {
    expect(cycleForDate({ closingDay: 25, dueDay: 5 }, '2026-10-10')).toEqual({
      closingMonth: '2026-10-01',
      closingDate: '2026-10-25',
      dueDate: '2026-11-05',
      referenceMonth: '2026-11-01',
    })
    expect(cycleForClosingMonth({ closingDay: 10, dueDay: 10 }, '2026-10-01').dueDate).toBe('2026-11-10')
  })

  it('vira o ano', () => {
    expect(cycleForDate(card, '2026-12-15')).toEqual({
      closingMonth: '2027-01-01',
      closingDate: '2027-01-03',
      dueDate: '2027-01-10',
      referenceMonth: '2027-01-01',
    })
    expect(cycleForDate({ closingDay: 25, dueDay: 5 }, '2026-12-26')).toMatchObject({
      closingDate: '2027-01-25',
      dueDate: '2027-02-05',
      referenceMonth: '2027-02-01',
    })
  })

  it('fechamento 31 em fevereiro usa o último dia (ano normal e bissexto)', () => {
    const late = { closingDay: 31, dueDay: 8 }
    expect(cycleForClosingMonth(late, '2027-02-01')).toEqual({
      closingMonth: '2027-02-01',
      closingDate: '2027-02-28',
      dueDate: '2027-03-08',
      referenceMonth: '2027-03-01',
    })
    expect(cycleForClosingMonth(late, '2028-02-01').closingDate).toBe('2028-02-29')
    expect(cycleForDate(late, '2027-02-27').closingDate).toBe('2027-02-28')
    expect(cycleForDate(late, '2027-02-28').closingDate).toBe('2027-03-31')
  })

  it('vencimento 31 em mês curto também usa o último dia', () => {
    expect(cycleForClosingMonth({ closingDay: 20, dueDay: 31 }, '2026-11-01').dueDate).toBe('2026-11-30')
  })
})

describe('invoiceStatus (PRD 8.4)', () => {
  const dates = { closingDate: '2026-11-03', dueDate: '2026-11-10' }

  it('aberta antes do fechamento, mesmo já paga', () => {
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 0 }, '2026-11-02')).toBe('open')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 10_000 }, '2026-11-02')).toBe('open')
  })

  it('fechada, paga e vencida', () => {
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 0 }, '2026-11-03')).toBe('closed')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 10_000 }, '2026-11-03')).toBe('paid')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 15_000 }, '2026-11-20')).toBe('paid')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 5_000 }, '2026-11-10')).toBe('closed')
    expect(invoiceStatus(dates, { totalCents: 10_000, paidCents: 5_000 }, '2026-11-11')).toBe('overdue')
  })

  it('estorno maior que as compras: fatura fechada já está paga', () => {
    expect(invoiceStatus(dates, { totalCents: -500, paidCents: 0 }, '2026-11-05')).toBe('paid')
  })
})
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `npm test -- lib/finance/invoice.test.ts`
Expected: FAIL — `Failed to resolve import "./invoice"`.

- [ ] **Step 4: Implementar `lib/finance/invoice.ts`**

```ts
import { formatYearMonthParam, shiftYearMonth, yearMonthOfISO, type YearMonth } from '@/lib/dates'
import type { CardSchedule, InvoiceCycle } from './types'

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
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- lib/finance/invoice.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 6: Commit**

```bash
git add lib/finance/types.ts lib/finance/invoice.ts lib/finance/invoice.test.ts
git commit -m "$(cat <<'EOF'
feat(finance): ciclo da fatura e status calculado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Divisão e geração de parcelas

**Files:**
- Create: `lib/finance/installments.ts`
- Test: `lib/finance/installments.test.ts`

**Interfaces:**
- Consumes: `addMonthsClamped`, `cycleForClosingMonth`, `cycleForDate`, `shiftClosingMonth` (Task 1); `CardSchedule`, `InvoiceCycle`.
- Produces:
  - `MAX_INSTALLMENTS = 24`
  - `splitInstallments(totalCents: number, n: number): number[]`
  - `type CardPurchaseInput = { mode: 'single'; amountCents; date } | { mode: 'installments'; totalCents; count; date } | { mode: 'in_progress'; installmentCents; current; count; date }`
  - `type PlanDraft = { totalAmountCents: number; installmentsCount: number; firstInstallmentNumber: number; purchaseDate: string; firstClosingMonth: string }`
  - `type RowDraft = { amountCents: number; date: string; installmentNumber: number | null; cycle: InvoiceCycle }`
  - `type CardPurchase = { plan: PlanDraft | null; rows: RowDraft[] }`
  - `buildCardPurchase(card: CardSchedule, input: CardPurchaseInput): CardPurchase`
  - `installmentLabel(description: string, number: number | null, count: number | null): string`

- [ ] **Step 1: Escrever os testes que falham**

Crie `lib/finance/installments.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCardPurchase, installmentLabel, splitInstallments } from './installments'
import { cycleForDate } from './invoice'

const card = { closingDay: 3, dueDay: 10 }

describe('splitInstallments (PRD 8.3)', () => {
  it('o resto dos centavos vai para a primeira parcela', () => {
    expect(splitInstallments(10_000, 3)).toEqual([3334, 3333, 3333])
  })

  it('divisão exata', () => {
    expect(splitInstallments(12_000, 3)).toEqual([4000, 4000, 4000])
  })

  it('24 parcelas somam o total', () => {
    const parts = splitInstallments(100_000, 24)
    expect(parts).toHaveLength(24)
    expect(parts[0]).toBe(4182)
    expect(parts.slice(1).every((value) => value === 4166)).toBe(true)
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(100_000)
  })

  it('valor menor que o número de parcelas gera parcela zero (o schema recusa antes)', () => {
    expect(splitInstallments(1, 2)).toEqual([1, 0])
  })
})

describe('buildCardPurchase', () => {
  it('à vista: uma linha na fatura da data, sem plano', () => {
    expect(buildCardPurchase(card, { mode: 'single', amountCents: 5000, date: '2026-10-02' })).toEqual({
      plan: null,
      rows: [{ amountCents: 5000, date: '2026-10-02', installmentNumber: null, cycle: cycleForDate(card, '2026-10-02') }],
    })
  })

  it('R$ 100,00 em 3x: 33,34 + 33,33 + 33,33 em três faturas consecutivas', () => {
    const { plan, rows } = buildCardPurchase(card, { mode: 'installments', totalCents: 10_000, count: 3, date: '2026-10-02' })
    expect(plan).toEqual({
      totalAmountCents: 10_000,
      installmentsCount: 3,
      firstInstallmentNumber: 1,
      purchaseDate: '2026-10-02',
      firstClosingMonth: '2026-10-01',
    })
    expect(rows.map((row) => [row.installmentNumber, row.amountCents, row.date, row.cycle.closingDate])).toEqual([
      [1, 3334, '2026-10-02', '2026-10-03'],
      [2, 3333, '2026-11-02', '2026-11-03'],
      [3, 3333, '2026-12-02', '2026-12-03'],
    ])
  })

  it('compra em 29/01 com fechamento 30: a parcela 2 não pula a fatura de fevereiro', () => {
    const late = { closingDay: 30, dueDay: 7 }
    const { rows } = buildCardPurchase(late, { mode: 'installments', totalCents: 20_000, count: 2, date: '2027-01-29' })
    expect(rows[0].cycle.closingDate).toBe('2027-01-30')
    expect(rows[1].date).toBe('2027-02-28')
    expect(rows[1].cycle.closingMonth).toBe('2027-02-01')
    // Pela data da parcela, ela cairia em março — por isso a fatura vem da contagem
    expect(cycleForDate(late, rows[1].date).closingMonth).toBe('2027-03-01')
  })

  it('compra em andamento: cria da parcela atual em diante, a atual na fatura da data', () => {
    const { plan, rows } = buildCardPurchase(card, {
      mode: 'in_progress',
      installmentCents: 15_000,
      current: 3,
      count: 10,
      date: '2026-10-04',
    })
    expect(plan).toEqual({
      totalAmountCents: 150_000,
      installmentsCount: 10,
      firstInstallmentNumber: 3,
      purchaseDate: '2026-08-04',
      firstClosingMonth: '2026-09-01',
    })
    expect(rows).toHaveLength(8)
    expect(rows[0]).toMatchObject({ installmentNumber: 3, amountCents: 15_000, date: '2026-10-04' })
    expect(rows[0].cycle).toEqual(cycleForDate(card, '2026-10-04'))
    expect(rows[7]).toMatchObject({ installmentNumber: 10, date: '2027-05-04' })
    expect(rows[7].cycle.closingMonth).toBe('2027-06-01')
  })
})

describe('installmentLabel', () => {
  it('acrescenta (k/N) às parcelas', () => {
    expect(installmentLabel('Geladeira', 3, 10)).toBe('Geladeira (3/10)')
    expect(installmentLabel('Padaria', null, null)).toBe('Padaria')
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- lib/finance/installments.test.ts`
Expected: FAIL — `Failed to resolve import "./installments"`.

- [ ] **Step 3: Implementar `lib/finance/installments.ts`**

```ts
import { addMonthsClamped, cycleForClosingMonth, cycleForDate, shiftClosingMonth } from './invoice'
import type { CardSchedule, InvoiceCycle } from './types'

export const MAX_INSTALLMENTS = 24

/** Divide o total em n parcelas; o resto dos centavos vai para a primeira (PRD 8.3). */
export function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n)
  const remainder = totalCents - base * n
  return Array.from({ length: n }, (_, index) => (index === 0 ? base + remainder : base))
}

export type CardPurchaseInput =
  | { mode: 'single'; amountCents: number; date: string }
  | { mode: 'installments'; totalCents: number; count: number; date: string }
  /** Compra já em andamento: valor de cada parcela, parcela atual e data da parcela atual. */
  | { mode: 'in_progress'; installmentCents: number; current: number; count: number; date: string }

export type PlanDraft = {
  totalAmountCents: number
  installmentsCount: number
  firstInstallmentNumber: number
  purchaseDate: string
  /** Mês de fechamento da fatura da parcela 1 (mesmo que ela não seja criada). */
  firstClosingMonth: string
}

export type RowDraft = { amountCents: number; date: string; installmentNumber: number | null; cycle: InvoiceCycle }

export type CardPurchase = { plan: PlanDraft | null; rows: RowDraft[] }

/** Parcela k sempre na fatura de firstClosingMonth + (k−1), nunca pela data da parcela. */
function installmentCycle(card: CardSchedule, firstClosingMonth: string, k: number): InvoiceCycle {
  return cycleForClosingMonth(card, shiftClosingMonth(firstClosingMonth, k - 1))
}

export function buildCardPurchase(card: CardSchedule, input: CardPurchaseInput): CardPurchase {
  if (input.mode === 'single') {
    return {
      plan: null,
      rows: [{ amountCents: input.amountCents, date: input.date, installmentNumber: null, cycle: cycleForDate(card, input.date) }],
    }
  }

  if (input.mode === 'installments') {
    const firstClosingMonth = cycleForDate(card, input.date).closingMonth
    return {
      plan: {
        totalAmountCents: input.totalCents,
        installmentsCount: input.count,
        firstInstallmentNumber: 1,
        purchaseDate: input.date,
        firstClosingMonth,
      },
      rows: splitInstallments(input.totalCents, input.count).map((amountCents, index) => ({
        amountCents,
        date: addMonthsClamped(input.date, index),
        installmentNumber: index + 1,
        cycle: installmentCycle(card, firstClosingMonth, index + 1),
      })),
    }
  }

  const offset = input.current - 1
  const firstClosingMonth = shiftClosingMonth(cycleForDate(card, input.date).closingMonth, -offset)
  const rows: RowDraft[] = []
  for (let k = input.current; k <= input.count; k += 1) {
    rows.push({
      amountCents: input.installmentCents,
      date: addMonthsClamped(input.date, k - input.current),
      installmentNumber: k,
      cycle: installmentCycle(card, firstClosingMonth, k),
    })
  }
  return {
    plan: {
      totalAmountCents: input.installmentCents * input.count,
      installmentsCount: input.count,
      firstInstallmentNumber: input.current,
      // Estimada: só para exibição
      purchaseDate: addMonthsClamped(input.date, -offset),
      firstClosingMonth,
    },
    rows,
  }
}

/** Descrição exibida: "Geladeira (3/10)". */
export function installmentLabel(description: string, number: number | null, count: number | null): string {
  return number !== null && count !== null ? `${description} (${number}/${count})` : description
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- lib/finance/installments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/installments.ts lib/finance/installments.test.ts
git commit -m "$(cat <<'EOF'
feat(finance): divisão de parcelas e compras parceladas e em andamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Uso do limite, redistribuição e visão de parcelas

**Files:**
- Create: `lib/finance/card.ts`, `lib/finance/installments-view.ts`
- Test: `lib/finance/card.test.ts`, `lib/finance/installments-view.test.ts`

**Interfaces:**
- Consumes: `cycleForClosingMonth`, `cycleForDate`, `shiftClosingMonth` (Task 1).
- Produces:
  - `type CardUsage = { usedCents: number; availableCents: number; ratio: number }`
  - `cardUsage(limitCents: number, invoices: { totalCents: number; paidCents: number }[]): CardUsage`
  - `type UsageLevel = 'ok' | 'warning' | 'over'`, `usageLevel(ratio: number): UsageLevel`
  - `type ScheduleInvoice = { id: string; closingMonth: string; closingDate: string }`
  - `type ScheduleTransaction = { id: string; invoiceId: string; date: string; installmentPlanId: string | null; installmentNumber: number | null }` (só compras e estornos — nunca pagamentos)
  - `type SchedulePlan = { id: string; purchaseDate: string; firstInstallmentNumber: number; firstClosingMonth: string }`
  - `type ScheduleChange = { invoices: { id: string; cycle: InvoiceCycle }[]; plans: { id: string; firstClosingMonth: string }[]; moves: { transactionId: string; cycle: InvoiceCycle }[] }`
  - `rescheduleCard(newSchedule: CardSchedule, invoices: ScheduleInvoice[], transactions: ScheduleTransaction[], plans: SchedulePlan[], today: string): ScheduleChange`
  - `type InstallmentEntry = { id: string; planId: string; cardId: string; description: string; amountCents: number; installmentNumber: number; installmentsCount: number; referenceMonth: string }`
  - `type InstallmentMonth<T extends InstallmentEntry> = { referenceMonth: string; totalCents: number; byCard: { cardId: string; totalCents: number }[]; items: (T & { remainingCents: number })[] }`
  - `groupInstallmentsByMonth<T extends InstallmentEntry>(entries: T[]): InstallmentMonth<T>[]`
  - `totalCommitted(entries: { amountCents: number }[]): number`

Regras de `rescheduleCard` (spec 2.3, com um refinamento):
1. Conjunto recalculado = faturas com `today < closingDate` (datas antigas). Cada uma mantém o `closingMonth` e ganha as datas de `cycleForClosingMonth(newSchedule, closingMonth)`.
2. Compra à vista: destino `cycleForDate(newSchedule, date).closingMonth`.
3. Parcela: destino `âncora + (k−1)`. A âncora de um plano **normal** (`firstInstallmentNumber === 1`) cuja `firstClosingMonth` ainda está no conjunto recalculado é recalculada por `cycleForDate(newSchedule, purchaseDate)` e limitada à fatura recalculada mais antiga; os demais planos (em andamento ou já cobrados em fatura fechada) mantêm a âncora. **Refinamento:** recalcular só planos que ainda não começaram a ser cobrados evita deixar um buraco entre a parcela fechada e as seguintes.
4. Destino anterior à fatura recalculada mais antiga (fatura fechada antes da mudança) vira a fatura recalculada mais antiga.
5. Só entram em `moves` lançamentos cujo destino difere do mês atual da fatura deles.

- [ ] **Step 1: Escrever os testes que falham**

Crie `lib/finance/card.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cardUsage, rescheduleCard, usageLevel, type ScheduleInvoice, type SchedulePlan, type ScheduleTransaction } from './card'
import { cycleForClosingMonth } from './invoice'

describe('cardUsage', () => {
  it('usado = totais − pagamentos em todas as faturas', () => {
    expect(
      cardUsage(500_000, [
        { totalCents: 100_000, paidCents: 100_000 },
        { totalCents: 80_000, paidCents: 30_000 },
        { totalCents: 20_000, paidCents: 0 },
      ]),
    ).toEqual({ usedCents: 70_000, availableCents: 430_000, ratio: 0.14 })
  })

  it('limite zero não divide por zero', () => {
    expect(cardUsage(0, [{ totalCents: 1000, paidCents: 0 }])).toEqual({ usedCents: 1000, availableCents: -1000, ratio: 0 })
  })

  it('nível de alerta em 80% e 100%', () => {
    expect(usageLevel(0.79)).toBe('ok')
    expect(usageLevel(0.8)).toBe('warning')
    expect(usageLevel(1)).toBe('over')
  })
})

describe('rescheduleCard', () => {
  // Cartão antigo: fecha dia 25, vence dia 5. Hoje: 20/10/2026.
  const today = '2026-10-20'
  const invoices: ScheduleInvoice[] = [
    { id: 'inv-sep', closingMonth: '2026-09-01', closingDate: '2026-09-25' }, // fechada
    { id: 'inv-oct', closingMonth: '2026-10-01', closingDate: '2026-10-25' },
    { id: 'inv-nov', closingMonth: '2026-11-01', closingDate: '2026-11-25' },
    { id: 'inv-dec', closingMonth: '2026-12-01', closingDate: '2026-12-25' },
  ]

  const single = (id: string, invoiceId: string, date: string): ScheduleTransaction => ({
    id,
    invoiceId,
    date,
    installmentPlanId: null,
    installmentNumber: null,
  })

  it('recalcula as datas das faturas abertas e move a compra que mudou de lado', () => {
    const newSchedule = { closingDay: 15, dueDay: 25 }
    const change = rescheduleCard(
      newSchedule,
      invoices,
      [single('a', 'inv-oct', '2026-10-10'), single('b', 'inv-oct', '2026-10-18')],
      [],
      today,
    )
    expect(change.invoices).toEqual([
      { id: 'inv-oct', cycle: cycleForClosingMonth(newSchedule, '2026-10-01') },
      { id: 'inv-nov', cycle: cycleForClosingMonth(newSchedule, '2026-11-01') },
      { id: 'inv-dec', cycle: cycleForClosingMonth(newSchedule, '2026-12-01') },
    ])
    expect(change.invoices[0].cycle).toMatchObject({ closingDate: '2026-10-15', dueDate: '2026-10-25' })
    expect(change.moves).toEqual([{ transactionId: 'b', cycle: cycleForClosingMonth(newSchedule, '2026-11-01') }])
    expect(change.plans).toEqual([])
  })

  it('destino numa fatura fechada vai para a fatura recalculada mais antiga', () => {
    // Novo fechamento 28: a compra de 26/09 cairia na fatura de setembro, que já fechou
    const change = rescheduleCard({ closingDay: 28, dueDay: 5 }, invoices, [single('c', 'inv-oct', '2026-09-26')], [], today)
    expect(change.moves).toEqual([])
  })

  it('plano normal ainda não cobrado recalcula a âncora; os demais mantêm', () => {
    const newSchedule = { closingDay: 15, dueDay: 25 }
    const plans: SchedulePlan[] = [
      { id: 'p-normal', purchaseDate: '2026-10-18', firstInstallmentNumber: 1, firstClosingMonth: '2026-10-01' },
      { id: 'p-andamento', purchaseDate: '2026-06-01', firstInstallmentNumber: 3, firstClosingMonth: '2026-08-01' },
      { id: 'p-cobrado', purchaseDate: '2026-09-10', firstInstallmentNumber: 1, firstClosingMonth: '2026-09-01' },
    ]
    const installment = (id: string, planId: string, invoiceId: string, k: number): ScheduleTransaction => ({
      id,
      invoiceId,
      date: '2026-10-18',
      installmentPlanId: planId,
      installmentNumber: k,
    })
    const change = rescheduleCard(
      newSchedule,
      invoices,
      [
        installment('n1', 'p-normal', 'inv-oct', 1),
        installment('n2', 'p-normal', 'inv-nov', 2),
        installment('n3', 'p-normal', 'inv-dec', 3),
        installment('a5', 'p-andamento', 'inv-dec', 5),
        installment('c2', 'p-cobrado', 'inv-oct', 2),
      ],
      plans,
      today,
    )
    expect(change.plans).toEqual([{ id: 'p-normal', firstClosingMonth: '2026-11-01' }])
    expect(change.moves).toEqual([
      { transactionId: 'n1', cycle: cycleForClosingMonth(newSchedule, '2026-11-01') },
      { transactionId: 'n2', cycle: cycleForClosingMonth(newSchedule, '2026-12-01') },
      { transactionId: 'n3', cycle: cycleForClosingMonth(newSchedule, '2027-01-01') },
    ])
  })

  it('âncora recalculada antes da fatura aberta mais antiga fica nela', () => {
    // Novo fechamento 28: compra de 26/09 seria setembro (fechada) → âncora vira outubro, parcelas não se sobrepõem
    const plans: SchedulePlan[] = [{ id: 'p', purchaseDate: '2026-09-26', firstInstallmentNumber: 1, firstClosingMonth: '2026-10-01' }]
    const change = rescheduleCard(
      { closingDay: 28, dueDay: 5 },
      invoices,
      [
        { id: 'k1', invoiceId: 'inv-oct', date: '2026-09-26', installmentPlanId: 'p', installmentNumber: 1 },
        { id: 'k2', invoiceId: 'inv-nov', date: '2026-10-26', installmentPlanId: 'p', installmentNumber: 2 },
      ],
      plans,
      today,
    )
    expect(change.plans).toEqual([])
    expect(change.moves).toEqual([])
  })

  it('sem faturas abertas não há nada a mover', () => {
    expect(rescheduleCard({ closingDay: 10, dueDay: 20 }, [invoices[0]], [], [], today)).toEqual({ invoices: [], plans: [], moves: [] })
  })
})
```

Crie `lib/finance/installments-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { groupInstallmentsByMonth, totalCommitted, type InstallmentEntry } from './installments-view'

function entry(partial: Partial<InstallmentEntry> & Pick<InstallmentEntry, 'id'>): InstallmentEntry {
  return {
    planId: 'p1',
    cardId: 'nubank',
    description: 'Geladeira',
    amountCents: 10_000,
    installmentNumber: 1,
    installmentsCount: 3,
    referenceMonth: '2026-11-01',
    ...partial,
  }
}

describe('groupInstallmentsByMonth', () => {
  const entries = [
    entry({ id: 'g3', installmentNumber: 3, referenceMonth: '2027-01-01' }),
    entry({ id: 'g2', installmentNumber: 2, referenceMonth: '2026-12-01' }),
    entry({ id: 't1', planId: 'p2', cardId: 'inter', description: 'TV', amountCents: 50_000, installmentNumber: 4, installmentsCount: 5, referenceMonth: '2026-12-01' }),
    entry({ id: 't2', planId: 'p2', cardId: 'inter', description: 'TV', amountCents: 50_000, installmentNumber: 5, installmentsCount: 5, referenceMonth: '2027-01-01' }),
  ]

  it('agrupa pelo mês de vencimento, em ordem, com totais por mês e por cartão', () => {
    const months = groupInstallmentsByMonth(entries)
    expect(months.map((month) => [month.referenceMonth, month.totalCents])).toEqual([
      ['2026-12-01', 60_000],
      ['2027-01-01', 60_000],
    ])
    expect(months[0].byCard).toEqual([
      { cardId: 'nubank', totalCents: 10_000 },
      { cardId: 'inter', totalCents: 50_000 },
    ])
    expect(months[0].items.map((item) => item.id)).toEqual(['g2', 't1'])
  })

  it('saldo restante = esta parcela + as seguintes do mesmo plano', () => {
    const items = groupInstallmentsByMonth(entries).flatMap((month) => month.items)
    const remaining = Object.fromEntries(items.map((item) => [item.id, item.remainingCents]))
    expect(remaining).toEqual({ g2: 20_000, g3: 10_000, t1: 100_000, t2: 50_000 })
  })

  it('lista vazia', () => {
    expect(groupInstallmentsByMonth([])).toEqual([])
  })
})

describe('totalCommitted', () => {
  it('soma todas as parcelas', () => {
    expect(totalCommitted([{ amountCents: 100 }, { amountCents: 250 }])).toBe(350)
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- lib/finance/card.test.ts lib/finance/installments-view.test.ts`
Expected: FAIL — módulos `./card` e `./installments-view` não existem.

- [ ] **Step 3: Implementar `lib/finance/card.ts`**

```ts
import { cycleForClosingMonth, cycleForDate, shiftClosingMonth } from './invoice'
import type { CardSchedule, InvoiceCycle } from './types'

export type CardUsage = { usedCents: number; availableCents: number; ratio: number }

/** Limite usado = soma dos totais − soma dos pagamentos, em todas as faturas (PRD 8.3). */
export function cardUsage(limitCents: number, invoices: { totalCents: number; paidCents: number }[]): CardUsage {
  const usedCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0)
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
```

- [ ] **Step 4: Implementar `lib/finance/installments-view.ts`**

```ts
export type InstallmentEntry = {
  id: string
  planId: string
  cardId: string
  description: string
  amountCents: number
  installmentNumber: number
  installmentsCount: number
  /** Mês de vencimento da fatura (AAAA-MM-01). */
  referenceMonth: string
}

export type InstallmentMonth<T extends InstallmentEntry> = {
  referenceMonth: string
  totalCents: number
  byCard: { cardId: string; totalCents: number }[]
  items: (T & { remainingCents: number })[]
}

/** Agrupa as parcelas pelo mês em que a fatura vence, com totais e saldo restante de cada compra. */
export function groupInstallmentsByMonth<T extends InstallmentEntry>(entries: T[]): InstallmentMonth<T>[] {
  const remaining = new Map<string, number>()
  const byPlan = new Map<string, T[]>()
  for (const entry of entries) byPlan.set(entry.planId, [...(byPlan.get(entry.planId) ?? []), entry])
  for (const planEntries of byPlan.values()) {
    let running = 0
    for (const entry of [...planEntries].sort((a, b) => b.installmentNumber - a.installmentNumber)) {
      running += entry.amountCents
      remaining.set(entry.id, running)
    }
  }

  const sorted = [...entries].sort(
    (a, b) => a.referenceMonth.localeCompare(b.referenceMonth) || a.description.localeCompare(b.description, 'pt-BR'),
  )
  const months: InstallmentMonth<T>[] = []
  for (const entry of sorted) {
    let month = months.at(-1)
    if (!month || month.referenceMonth !== entry.referenceMonth) {
      month = { referenceMonth: entry.referenceMonth, totalCents: 0, byCard: [], items: [] }
      months.push(month)
    }
    month.totalCents += entry.amountCents
    const card = month.byCard.find((item) => item.cardId === entry.cardId)
    if (card) card.totalCents += entry.amountCents
    else month.byCard.push({ cardId: entry.cardId, totalCents: entry.amountCents })
    month.items.push({ ...entry, remainingCents: remaining.get(entry.id) ?? entry.amountCents })
  }
  return months
}

export function totalCommitted(entries: { amountCents: number }[]): number {
  return entries.reduce((sum, entry) => sum + entry.amountCents, 0)
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- lib/finance/card.test.ts lib/finance/installments-view.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/finance/card.ts lib/finance/card.test.ts lib/finance/installments-view.ts lib/finance/installments-view.test.ts
git commit -m "$(cat <<'EOF'
feat(finance): uso do limite, redistribuição ao mudar os dias do cartão e visão de parcelas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Razão com pagamento de fatura, status efetivo e filtros de URL

**Files:**
- Modify: `lib/finance/types.ts`, `lib/finance/balance.ts`, `lib/finance/summary.ts`, `lib/finance/status.ts`, `lib/finance/invoice.ts`, `lib/transaction-filters.ts`
- Test: `lib/finance/balance.test.ts`, `lib/finance/summary.test.ts`, `lib/finance/status.test.ts`, `lib/finance/invoice.test.ts`, `lib/transaction-filters.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `TransactionType = 'income' | 'expense' | 'transfer' | 'invoice_payment'`
  - `LedgerTransaction.accountId: string | null` (nulo = receita/despesa no cartão)
  - `effectiveStatus(tx: { type: TransactionType; status: TransactionStatus; date: string; accountId: string | null }, today: string): TransactionStatus`
  - `type InvoiceAmounts = { chargesCents: number; creditsCents: number; totalCents: number; paidCents: number }`
  - `summarizeInvoice(transactions: Pick<LedgerTransaction, 'type' | 'status' | 'amountCents'>[]): InvoiceAmounts`
  - `TransactionFilters.cardId?: string` (URL `cartao`); tipo `invoice_payment` na URL como `pagamento-fatura`.

- [ ] **Step 1: Escrever os testes que falham**

Em `lib/finance/balance.test.ts`, acrescente ao final:

```ts
describe('pagamento de fatura e lançamentos no cartão', () => {
  it('pagamento de fatura sai da conta; compra no cartão não mexe em conta', () => {
    expect(transactionDelta(tx({ type: 'invoice_payment', amountCents: 3000 }), 'a1')).toBe(-3000)
    expect(transactionDelta(tx({ type: 'expense', accountId: null }), 'a1')).toBe(0)
    expect(
      accountBalance(account, [
        tx({ type: 'invoice_payment', amountCents: 3000 }),
        tx({ type: 'expense', amountCents: 9000, accountId: null }),
      ]),
    ).toBe(97_000)
  })
})
```

Em `lib/finance/summary.test.ts`, dentro do `describe('summarizeMonth', ...)`:

```ts
  it('pagamento de fatura não é despesa (PRD 8.5)', () => {
    const summary = summarizeMonth([
      { type: 'invoice_payment', status: 'paid', amountCents: 5000 },
      { type: 'expense', status: 'paid', amountCents: 1000 },
    ])
    expect(summary.expense.paid).toBe(1000)
    expect(summary.balancePaid).toBe(-1000)
  })
```

Em `lib/finance/status.test.ts`, troque o import para `import { defaultStatus, effectiveStatus } from './status'` e acrescente:

```ts
describe('effectiveStatus', () => {
  const card = { type: 'expense' as const, status: 'pending' as const, date: '2026-10-04', accountId: null }

  it('receita e despesa no cartão seguem a data', () => {
    expect(effectiveStatus(card, '2026-10-04')).toBe('paid')
    expect(effectiveStatus({ ...card, status: 'paid', date: '2026-11-04' }, '2026-10-04')).toBe('pending')
    expect(effectiveStatus({ ...card, type: 'income' }, '2026-10-05')).toBe('paid')
  })

  it('lançamentos em conta e pagamentos de fatura usam o status salvo', () => {
    expect(effectiveStatus({ ...card, accountId: 'acc' }, '2026-12-01')).toBe('pending')
    expect(effectiveStatus({ ...card, type: 'invoice_payment', accountId: 'acc', date: '2026-01-01' }, '2026-12-01')).toBe('pending')
  })
})
```

Em `lib/finance/invoice.test.ts`, acrescente `summarizeInvoice` ao import e:

```ts
describe('summarizeInvoice', () => {
  it('compras − estornos; só pagamentos pagos contam como pago', () => {
    expect(
      summarizeInvoice([
        { type: 'expense', status: 'paid', amountCents: 3334 },
        { type: 'expense', status: 'pending', amountCents: 1000 },
        { type: 'income', status: 'paid', amountCents: 500 },
        { type: 'invoice_payment', status: 'paid', amountCents: 2000 },
        { type: 'invoice_payment', status: 'pending', amountCents: 999 },
      ]),
    ).toEqual({ chargesCents: 4334, creditsCents: 500, totalCents: 3834, paidCents: 2000 })
  })
})
```

Em `lib/transaction-filters.test.ts`, acrescente a constante `const CARD = '44444444-4444-4444-8444-444444444444'` depois de `CAT` e:

```ts
describe('filtros da Fase 3', () => {
  it('lê cartão e pagamento de fatura; ignora valores adulterados', () => {
    expect(parseTransactionsQuery({ cartao: CARD, tipo: 'pagamento-fatura' }, now).filters).toEqual({
      cardId: CARD,
      type: 'invoice_payment',
    })
    expect(parseTransactionsQuery({ cartao: 'nao-uuid', tipo: 'constructor' }, now).filters).toEqual({})
  })

  it('filterParams preserva o cartão', () => {
    const query = parseTransactionsQuery({ cartao: CARD, tipo: 'pagamento-fatura' }, now)
    expect(filterParams(query)).toEqual({ tipo: 'pagamento-fatura', cartao: CARD })
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- lib/finance lib/transaction-filters.test.ts`
Expected: FAIL — `effectiveStatus`/`summarizeInvoice` não exportados; `transactionDelta` de `invoice_payment` dá 0; filtros sem `cardId`.

- [ ] **Step 3: Tipos em `lib/finance/types.ts`**

Troque as duas primeiras definições e o campo `accountId`:

```ts
export type TransactionType = 'income' | 'expense' | 'transfer' | 'invoice_payment'
export type TransactionStatus = 'paid' | 'pending'
```

```ts
export type LedgerTransaction = {
  id: string
  type: TransactionType
  amountCents: number
  date: string
  status: TransactionStatus
  /** Nulo nas receitas e despesas no cartão. */
  accountId: string | null
  destinationAccountId: string | null
  createdAt: string
}
```

- [ ] **Step 4: `transactionDelta` em `lib/finance/balance.ts`**

```ts
/** Efeito do lançamento no saldo da conta (0 se não a envolve). */
export function transactionDelta(tx: LedgerTransaction, accountId: string): number {
  if (tx.type === 'income') return tx.accountId === accountId ? tx.amountCents : 0
  // Pagamento de fatura sai da conta como uma despesa, mas não é despesa no resumo (PRD 8.5)
  if (tx.type === 'expense' || tx.type === 'invoice_payment') return tx.accountId === accountId ? -tx.amountCents : 0
  let delta = 0
  if (tx.accountId === accountId) delta -= tx.amountCents
  if (tx.destinationAccountId === accountId) delta += tx.amountCents
  return delta
}
```

- [ ] **Step 5: `summarizeMonth` em `lib/finance/summary.ts`**

Troque o comentário e a primeira linha do laço:

```ts
/** Receitas e despesas do mês, realizado x previsto. Transferências e pagamentos de fatura não entram (PRD 8.5). */
```

```ts
    if (tx.type === 'transfer' || tx.type === 'invoice_payment') continue
```

- [ ] **Step 6: `effectiveStatus` em `lib/finance/status.ts`**

Arquivo completo:

```ts
import type { TransactionStatus, TransactionType } from './types'

/** Status sugerido para um lançamento novo: hoje ou passado → pago; futuro → pendente. */
export function defaultStatus(date: string, today: string): TransactionStatus {
  return date <= today ? 'paid' : 'pending'
}

/**
 * Status usado na leitura. Receitas e despesas no cartão (sem conta) seguem a data — uma parcela futura
 * vira "realizada" quando chega o dia. Lançamentos em conta e pagamentos de fatura usam o status salvo.
 */
export function effectiveStatus(
  tx: { type: TransactionType; status: TransactionStatus; date: string; accountId: string | null },
  today: string,
): TransactionStatus {
  if (tx.accountId === null && (tx.type === 'income' || tx.type === 'expense')) return defaultStatus(tx.date, today)
  return tx.status
}
```

- [ ] **Step 7: `summarizeInvoice` em `lib/finance/invoice.ts`**

Troque o import de tipos por `import type { CardSchedule, InvoiceCycle, LedgerTransaction } from './types'` e acrescente ao final:

```ts
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
```

- [ ] **Step 8: Filtros em `lib/transaction-filters.ts`**

```ts
export type TransactionFilters = {
  type?: TransactionType
  categoryId?: string
  accountId?: string
  cardId?: string
  status?: TransactionStatus
}
```

```ts
const TYPE_FROM_PARAM: Record<string, TransactionType> = {
  receita: 'income',
  despesa: 'expense',
  transferencia: 'transfer',
  'pagamento-fatura': 'invoice_payment',
}
const TYPE_TO_PARAM: Record<TransactionType, string> = {
  income: 'receita',
  expense: 'despesa',
  transfer: 'transferencia',
  invoice_payment: 'pagamento-fatura',
}
```

Em `parseTransactionsQuery`, depois de `const accountId = ...`:

```ts
  const cardId = validUuid(first(params.cartao))
```

e depois de `if (accountId) filters.accountId = accountId`:

```ts
  if (cardId) filters.cardId = cardId
```

Em `filterParams`, depois da linha de `conta`:

```ts
  if (query.filters.cardId) params.cartao = query.filters.cardId
```

- [ ] **Step 9: Rodar testes e tipos**

Run: `npm test && npx tsc --noEmit`
Expected: PASS em todos os testes; sem erros de tipo (`Record<TransactionType, ...>` precisa estar completo).

- [ ] **Step 10: Commit**

```bash
git add lib/finance lib/transaction-filters.ts lib/transaction-filters.test.ts
git commit -m "$(cat <<'EOF'
feat(finance): pagamento de fatura no saldo, status efetivo no cartão e filtro de cartão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migration de cartões, faturas e parcelas com testes de RLS

**Files:**
- Create: `supabase/migrations/20261004140000_cartoes_faturas_parcelas.sql`, `lib/card-rpc.ts`, `lib/card-rpc.test.ts`, `tests/rls/cards.rls.test.ts`
- Modify: `lib/supabase/errors.ts`, `lib/supabase/errors.test.ts`, `lib/transaction-mappers.ts`, `lib/transaction-mappers.test.ts`, `components/accounts/statement-list.tsx`, `components/transactions/transaction-list.tsx`, `lib/supabase/database.types.ts` (gerado)

**Interfaces:**
- Consumes: Tasks 1–4 (`buildCardPurchase`, `cycleForDate`, `cycleForClosingMonth`, `summarizeInvoice`, `accountBalance`, `defaultStatus`, `effectiveStatus`, `ScheduleChange`).
- Produces:
  - Tabelas `credit_cards`, `card_invoices`, `installment_plans`; colunas novas em `transactions` e `profiles.last_credit_card_id`; views `v_account_balances` (recriada) e `v_invoice_totals`.
  - RPCs: `ensure_invoice(p_card_id, p_closing_month, p_closing_date, p_due_date, p_reference_month) → uuid`, `create_card_purchase(p_card_id, p_plan, p_rows) → uuid[]`, `apply_card_schedule(p_card_id, p_closing_day, p_due_day, p_invoices, p_plans, p_moves) → void`, `restore_transactions(p_plan, p_rows) → void`.
  - `lib/card-rpc.ts`: `cycleColumns(cycle)`, `ensureInvoiceArgs(cardId, cycle)`, `type PurchaseFields = { type: 'income' | 'expense'; description: string; categoryId: string; notes: string | null }`, `purchaseRpcArgs(cardId, purchase, fields, today)`, `scheduleRpcArgs(cardId, schedule, change)`.
  - `lib/supabase/errors.ts`: mensagens de `INVALID_CARD`, `INVALID_INVOICE`, `INVALID_PLAN`, `INVALID_INPUT`, `23514`; `export const CARD_IN_USE`.
  - `TransactionRow` com `account_id: string | null`, `credit_card_id`, `invoice_id`, `installment_plan_id`, `installment_number`, `installment_plans: { installments_count: number } | null`, `card_invoices: { closing_month: string } | null`; `applyEffectiveStatus(row, today): TransactionRow`.

**Nota:** a spec chama o RPC de desfazer de `restore_card_transactions`; aqui ele se chama `restore_transactions` porque serve para qualquer exclusão (conta, cartão, pagamento ou parcelas). A spec já usa esse nome.

- [ ] **Step 1: Argumentos dos RPCs — teste que falha**

Crie `lib/card-rpc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ensureInvoiceArgs, purchaseRpcArgs, scheduleRpcArgs } from './card-rpc'
import { buildCardPurchase } from './finance/installments'
import { cycleForClosingMonth, cycleForDate } from './finance/invoice'

const card = { closingDay: 3, dueDay: 10 }

describe('purchaseRpcArgs', () => {
  it('monta o plano e as linhas com o ciclo e o status pela data', () => {
    const purchase = buildCardPurchase(card, { mode: 'installments', totalCents: 10_000, count: 3, date: '2026-10-02' })
    const args = purchaseRpcArgs('card-1', purchase, { type: 'expense', description: 'Geladeira', categoryId: 'cat-1', notes: null }, '2026-10-04')
    expect(args.p_card_id).toBe('card-1')
    expect(args.p_plan).toEqual({
      category_id: 'cat-1',
      description: 'Geladeira',
      total_amount_cents: 10_000,
      installments_count: 3,
      first_installment_number: 1,
      purchase_date: '2026-10-02',
      first_closing_month: '2026-10-01',
    })
    expect(args.p_rows[0]).toEqual({
      type: 'expense',
      description: 'Geladeira',
      amount_cents: 3334,
      date: '2026-10-02',
      status: 'paid',
      category_id: 'cat-1',
      notes: null,
      installment_number: 1,
      closing_month: '2026-10-01',
      closing_date: '2026-10-03',
      due_date: '2026-10-10',
      reference_month: '2026-10-01',
    })
    expect(args.p_rows.map((row) => row.status)).toEqual(['paid', 'pending', 'pending'])
  })

  it('compra à vista e estorno não têm plano', () => {
    const purchase = buildCardPurchase(card, { mode: 'single', amountCents: 500, date: '2026-10-04' })
    const args = purchaseRpcArgs('card-1', purchase, { type: 'income', description: 'Estorno', categoryId: 'cat-2', notes: 'loja' }, '2026-10-04')
    expect(args.p_plan).toBeNull()
    expect(args.p_rows).toHaveLength(1)
    expect(args.p_rows[0]).toMatchObject({ type: 'income', installment_number: null, notes: 'loja' })
  })
})

describe('ensureInvoiceArgs e scheduleRpcArgs', () => {
  it('converte o ciclo para as colunas do banco', () => {
    expect(ensureInvoiceArgs('card-1', cycleForDate(card, '2026-10-02'))).toEqual({
      p_card_id: 'card-1',
      p_closing_month: '2026-10-01',
      p_closing_date: '2026-10-03',
      p_due_date: '2026-10-10',
      p_reference_month: '2026-10-01',
    })
  })

  it('monta faturas, planos e movimentos', () => {
    const schedule = { closingDay: 25, dueDay: 5 }
    const cycle = cycleForClosingMonth(schedule, '2026-11-01')
    expect(
      scheduleRpcArgs('card-1', schedule, {
        invoices: [{ id: 'inv-1', cycle }],
        plans: [{ id: 'plan-1', firstClosingMonth: '2026-11-01' }],
        moves: [{ transactionId: 'tx-1', cycle }],
      }),
    ).toEqual({
      p_card_id: 'card-1',
      p_closing_day: 25,
      p_due_day: 5,
      p_invoices: [{ id: 'inv-1', closing_month: '2026-11-01', closing_date: '2026-11-25', due_date: '2026-12-05', reference_month: '2026-12-01' }],
      p_plans: [{ id: 'plan-1', first_closing_month: '2026-11-01' }],
      p_moves: [{ transaction_id: 'tx-1', closing_month: '2026-11-01', closing_date: '2026-11-25', due_date: '2026-12-05', reference_month: '2026-12-01' }],
    })
  })
})
```

Run: `npm test -- lib/card-rpc.test.ts`
Expected: FAIL — `Failed to resolve import "./card-rpc"`.

- [ ] **Step 2: Implementar `lib/card-rpc.ts`**

```ts
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
```

Run: `npm test -- lib/card-rpc.test.ts`
Expected: PASS.

- [ ] **Step 3: Escrever os testes de integração que falham**

Crie `tests/rls/cards.rls.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureInvoiceArgs, purchaseRpcArgs, scheduleRpcArgs } from '@/lib/card-rpc'
import { accountBalance } from '@/lib/finance/balance'
import { buildCardPurchase, type CardPurchaseInput } from '@/lib/finance/installments'
import { cycleForClosingMonth, cycleForDate, summarizeInvoice } from '@/lib/finance/invoice'
import type { CardSchedule } from '@/lib/finance/types'
import { rowToLedger, TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'
import { createTestContext, type TestUser } from './helpers'

const ctx = createTestContext()
const SCHEDULE: CardSchedule = { closingDay: 3, dueDay: 10 }
const TODAY = '2026-10-04'
const RECORD_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, source, external_id, notes'
const PLAN_COLUMNS =
  'id, credit_card_id, category_id, description, total_amount_cents, installments_count, first_installment_number, purchase_date, first_closing_month'

describe('cartões, faturas e parcelas', () => {
  let a: TestUser
  let b: TestUser
  let houseA: string
  let houseB: string
  let accA: string
  let mercadoA: string
  let reembolsoA: string
  let mercadoB: string
  let cardA: string
  let cardA2: string
  let cardB: string
  let planA: string
  let invoicesA: string[]

  async function insertCard(user: TestUser, householdId: string, name: string): Promise<string> {
    const { data, error } = await user.client
      .from('credit_cards')
      .insert({
        household_id: householdId,
        name,
        brand: 'visa',
        limit_cents: 500_000,
        closing_day: SCHEDULE.closingDay,
        due_day: SCHEDULE.dueDay,
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

  function purchaseArgs(cardId: string, input: CardPurchaseInput, description: string, category: string) {
    return purchaseRpcArgs(cardId, buildCardPurchase(SCHEDULE, input), { type: 'expense', description, categoryId: category, notes: null }, TODAY)
  }

  function tx(householdId: string, fields: Record<string, unknown>) {
    return { household_id: householdId, description: 'Teste', status: 'paid', date: '2026-10-02', ...fields }
  }

  beforeAll(async () => {
    ;[a, b] = await Promise.all([ctx.newUser('card-a'), ctx.newUser('card-b')])
    houseA = await ctx.createHousehold(a, 'Casa Cartão A')
    houseB = await ctx.createHousehold(b, 'Casa Cartão B')
    mercadoA = await categoryId(a, houseA, 'Mercado', 'expense')
    reembolsoA = await categoryId(a, houseA, 'Reembolso', 'income')
    mercadoB = await categoryId(b, houseB, 'Mercado', 'expense')
    const { data: account, error } = await a.client
      .from('accounts')
      .insert({
        household_id: houseA,
        name: 'Conta A',
        type: 'checking',
        initial_balance_cents: 100_000,
        initial_balance_date: '2026-09-01',
        color: '#3b82f6',
      })
      .select('id')
      .single()
    if (error) throw error
    accA = account.id as string
    cardA = await insertCard(a, houseA, 'Cartão A')
    cardA2 = await insertCard(a, houseA, 'Cartão A2')
    cardB = await insertCard(b, houseB, 'Cartão B')
  })

  afterAll(() => ctx.cleanup())

  it('create_card_purchase grava plano, faturas e parcelas (R$ 100,00 em 3x)', async () => {
    const { data: ids, error } = await a.client.rpc(
      'create_card_purchase',
      purchaseArgs(cardA, { mode: 'installments', totalCents: 10_000, count: 3, date: '2026-10-02' }, 'Geladeira', mercadoA),
    )
    expect(error).toBeNull()
    expect(ids).toHaveLength(3)

    const { data: totals } = await a.client
      .from('v_invoice_totals')
      .select('invoice_id, closing_month, total_cents')
      .eq('credit_card_id', cardA)
      .order('closing_month')
    expect(totals!.map((row) => [row.closing_month, Number(row.total_cents)])).toEqual([
      ['2026-10-01', 3334],
      ['2026-11-01', 3333],
      ['2026-12-01', 3333],
    ])
    invoicesA = totals!.map((row) => row.invoice_id as string)

    const { data: rows } = await a.client
      .from('transactions')
      .select('installment_plan_id, installment_number')
      .in('id', ids as string[])
      .order('installment_number')
    expect(rows!.map((row) => row.installment_number)).toEqual([1, 2, 3])
    planA = rows![0].installment_plan_id as string
    const { data: plan } = await a.client.from('installment_plans').select('installments_count, first_closing_month').eq('id', planA).single()
    expect(plan).toEqual({ installments_count: 3, first_closing_month: '2026-10-01' })
  })

  it('outra casa não lê cartões, faturas, planos nem totais', async () => {
    const results = await Promise.all([
      b.client.from('credit_cards').select('id').eq('household_id', houseA),
      b.client.from('card_invoices').select('id').eq('household_id', houseA),
      b.client.from('installment_plans').select('id').eq('household_id', houseA),
      b.client.from('v_invoice_totals').select('invoice_id').eq('household_id', houseA),
    ])
    for (const result of results) {
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    }
  })

  it('outra casa não grava nem usa os RPCs com o cartão de A', async () => {
    const insert = await b.client
      .from('credit_cards')
      .insert({ household_id: houseA, name: 'Intruso', brand: 'visa', closing_day: 1, due_day: 10, color: '#3b82f6' })
    expect(insert.error).not.toBeNull()

    const purchase = await b.client.rpc(
      'create_card_purchase',
      purchaseArgs(cardA, { mode: 'single', amountCents: 100, date: '2026-10-02' }, 'Intrusa', mercadoB),
    )
    expect(purchase.error?.message).toBe('INVALID_CARD')

    const ensure = await b.client.rpc('ensure_invoice', ensureInvoiceArgs(cardA, cycleForDate(SCHEDULE, '2026-10-02')))
    expect(ensure.error?.message).toBe('INVALID_CARD')
  })

  it('o RPC é atômico: uma linha inválida não deixa plano, fatura nem parcela', async () => {
    const args = purchaseArgs(cardA, { mode: 'installments', totalCents: 30_000, count: 3, date: '2030-01-10' }, 'Atômica', mercadoA)
    args.p_rows[1] = { ...args.p_rows[1], category_id: mercadoB }
    const { error } = await a.client.rpc('create_card_purchase', args)
    expect(error?.message).toBe('INVALID_CATEGORY')

    const [plans, invoices, rows] = await Promise.all([
      a.client.from('installment_plans').select('id').eq('description', 'Atômica'),
      a.client.from('card_invoices').select('id').eq('credit_card_id', cardA).gte('closing_month', '2030-01-01'),
      a.client.from('transactions').select('id').eq('description', 'Atômica'),
    ])
    expect(plans.data).toEqual([])
    expect(invoices.data).toEqual([])
    expect(rows.data).toEqual([])
  })

  it('o trigger recusa cartão, fatura e plano que não combinam', async () => {
    const [invOct] = invoicesA
    const base = { type: 'expense', amount_cents: 100, category_id: mercadoA }

    const otherHouseCard = await a.client.from('transactions').insert(tx(houseA, { ...base, credit_card_id: cardB, invoice_id: invOct }))
    expect(otherHouseCard.error?.message).toBe('INVALID_CARD')

    const otherCardInvoice = await a.client.from('transactions').insert(tx(houseA, { ...base, credit_card_id: cardA2, invoice_id: invOct }))
    expect(otherCardInvoice.error?.message).toBe('INVALID_INVOICE')

    const { data: invA2 } = await a.client.rpc('ensure_invoice', ensureInvoiceArgs(cardA2, cycleForDate(SCHEDULE, '2026-10-02')))
    const otherCardPlan = await a.client
      .from('transactions')
      .insert(tx(houseA, { ...base, credit_card_id: cardA2, invoice_id: invA2, installment_plan_id: planA, installment_number: 1 }))
    expect(otherCardPlan.error?.message).toBe('INVALID_PLAN')

    const outOfRange = await a.client
      .from('transactions')
      .insert(tx(houseA, { ...base, credit_card_id: cardA, invoice_id: invOct, installment_plan_id: planA, installment_number: 5 }))
    expect(outOfRange.error?.message).toBe('INVALID_PLAN')
  })

  it('constraints de formato de cada tipo', async () => {
    const [invOct] = invoicesA
    const cases = [
      // conta e cartão ao mesmo tempo
      { type: 'expense', amount_cents: 100, category_id: mercadoA, account_id: accA, credit_card_id: cardA, invoice_id: invOct },
      // despesa no cartão sem fatura
      { type: 'expense', amount_cents: 100, category_id: mercadoA, credit_card_id: cardA },
      // pagamento de fatura sem conta
      { type: 'invoice_payment', amount_cents: 100, credit_card_id: cardA, invoice_id: invOct },
      // estorno parcelado
      {
        type: 'income',
        amount_cents: 100,
        category_id: reembolsoA,
        credit_card_id: cardA,
        invoice_id: invOct,
        installment_plan_id: planA,
        installment_number: 1,
      },
    ]
    for (const fields of cases) {
      const { error } = await a.client.from('transactions').insert(tx(houseA, fields))
      expect(error?.code).toBe('23514')
    }
  })

  it('v_invoice_totals e v_account_balances batem com as funções TypeScript', async () => {
    const [invOct] = invoicesA
    const insert = await a.client.from('transactions').insert([
      tx(houseA, { type: 'income', amount_cents: 500, category_id: reembolsoA, credit_card_id: cardA, invoice_id: invOct }),
      tx(houseA, { type: 'invoice_payment', amount_cents: 3334, date: '2026-10-10', account_id: accA, credit_card_id: cardA, invoice_id: invOct }),
    ])
    expect(insert.error).toBeNull()

    const { data: view } = await a.client
      .from('v_invoice_totals')
      .select('charges_cents, credits_cents, total_cents, paid_cents')
      .eq('invoice_id', invOct)
      .single()
    const { data } = await a.client.from('transactions').select(TRANSACTION_COLUMNS).eq('household_id', houseA)
    const rows = data as TransactionRow[]
    const expected = summarizeInvoice(rows.filter((row) => row.invoice_id === invOct).map(rowToLedger))
    expect(expected).toEqual({ chargesCents: 3334, creditsCents: 500, totalCents: 2834, paidCents: 3334 })
    expect([view!.charges_cents, view!.credits_cents, view!.total_cents, view!.paid_cents].map(Number)).toEqual([
      expected.chargesCents,
      expected.creditsCents,
      expected.totalCents,
      expected.paidCents,
    ])

    const { data: balance } = await a.client.from('v_account_balances').select('balance_cents').eq('account_id', accA).single()
    expect(Number(balance!.balance_cents)).toBe(96_666)
    expect(Number(balance!.balance_cents)).toBe(
      accountBalance({ id: accA, initialBalanceCents: 100_000, initialBalanceDate: '2026-09-01' }, rows.map(rowToLedger)),
    )
  })

  it('apply_card_schedule move o lançamento e recalcula a fatura aberta', async () => {
    const { data: ids, error } = await a.client.rpc(
      'create_card_purchase',
      purchaseArgs(cardA2, { mode: 'single', amountCents: 10_000, date: '2026-12-20' }, 'Mercado grande', mercadoA),
    )
    expect(error).toBeNull()
    const txId = (ids as string[])[0]
    const { data: before } = await a.client.from('transactions').select('invoice_id, card_invoices(closing_month)').eq('id', txId).single()
    expect(before!.card_invoices).toEqual({ closing_month: '2027-01-01' })
    const januaryId = before!.invoice_id as string

    const newSchedule = { closingDay: 25, dueDay: 5 }
    const apply = await a.client.rpc(
      'apply_card_schedule',
      scheduleRpcArgs(cardA2, newSchedule, {
        invoices: [{ id: januaryId, cycle: cycleForClosingMonth(newSchedule, '2027-01-01') }],
        plans: [],
        moves: [{ transactionId: txId, cycle: cycleForDate(newSchedule, '2026-12-20') }],
      }),
    )
    expect(apply.error).toBeNull()

    const [{ data: after }, { data: card }, { data: january }] = await Promise.all([
      a.client.from('transactions').select('card_invoices(closing_month, closing_date)').eq('id', txId).single(),
      a.client.from('credit_cards').select('closing_day, due_day').eq('id', cardA2).single(),
      a.client.from('card_invoices').select('closing_date, due_date').eq('id', januaryId).single(),
    ])
    expect(after!.card_invoices).toEqual({ closing_month: '2026-12-01', closing_date: '2026-12-25' })
    expect(card).toEqual({ closing_day: 25, due_day: 5 })
    expect(january).toEqual({ closing_date: '2027-01-25', due_date: '2027-02-05' })
  })

  it('restore_transactions recria o plano e as parcelas com os mesmos ids', async () => {
    const { data: plan } = await a.client.from('installment_plans').select(PLAN_COLUMNS).eq('id', planA).single()
    const { data: rows } = await a.client
      .from('transactions')
      .select(RECORD_COLUMNS)
      .eq('installment_plan_id', planA)
      .order('installment_number')
    expect(rows).toHaveLength(3)

    const removed = await a.client.from('installment_plans').delete().eq('id', planA)
    expect(removed.error).toBeNull()
    const { data: gone } = await a.client.from('transactions').select('id').eq('installment_plan_id', planA)
    expect(gone).toEqual([])

    const restore = await a.client.rpc('restore_transactions', {
      p_plan: { ...plan, household_id: houseA },
      p_rows: rows!.map((row) => ({ ...row, household_id: houseA })),
    })
    expect(restore.error).toBeNull()
    const { data: back } = await a.client
      .from('transactions')
      .select(RECORD_COLUMNS)
      .eq('installment_plan_id', planA)
      .order('installment_number')
    expect(back).toEqual(rows)
  })

  it('cartão com lançamentos não pode ser excluído; sem lançamentos leva as faturas vazias', async () => {
    const blocked = await a.client.from('credit_cards').delete().eq('id', cardA)
    expect(blocked.error?.code).toBe('23503')

    const tmp = await insertCard(a, houseA, 'Temporário')
    const { data: invoiceId } = await a.client.rpc('ensure_invoice', ensureInvoiceArgs(tmp, cycleForDate(SCHEDULE, '2026-10-02')))
    expect(invoiceId).toBeTruthy()
    const removed = await a.client.from('credit_cards').delete().eq('id', tmp).select('id')
    expect(removed.data).toHaveLength(1)
    const { data: invoices } = await a.client.from('card_invoices').select('id').eq('credit_card_id', tmp)
    expect(invoices).toEqual([])
  })
})
```

Run: `npm run test:rls`
Expected: FAIL nos testes novos (tabela `credit_cards` inexistente, `PGRST205` ou similar). Os testes das Fases 1 e 2 continuam passando.

- [ ] **Step 4: Escrever a migration**

`supabase/migrations/20261004140000_cartoes_faturas_parcelas.sql`:

```sql
-- Fase 3 — Cartões, faturas e parcelas.

-- =====================================================================
-- Cartões
-- =====================================================================

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  brand text not null check (brand in ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other')),
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  limit_cents bigint not null default 0 check (limit_cents >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  default_payment_account_id uuid references public.accounts (id) on delete set null,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index credit_cards_household_id_idx on public.credit_cards (household_id);
create index credit_cards_default_payment_account_id_idx on public.credit_cards (default_payment_account_id);

create trigger credit_cards_set_updated_at
  before update on public.credit_cards
  for each row execute function public.set_updated_at();

create or replace function public.credit_cards_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_payment_account_id is not null and not exists (
    select 1 from public.accounts a
    where a.id = new.default_payment_account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;
  return new;
end;
$$;

create trigger credit_cards_check_refs
  before insert or update on public.credit_cards
  for each row execute function public.credit_cards_check_refs();

-- =====================================================================
-- Faturas — identificadas pelo mês de fechamento; o status é calculado no app
-- =====================================================================

create table public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards (id) on delete cascade,
  closing_month date not null,
  closing_date date not null,
  due_date date not null,
  reference_month date not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_invoices_closing_month check (date_trunc('month', closing_date::timestamp)::date = closing_month),
  constraint card_invoices_reference_month check (date_trunc('month', due_date::timestamp)::date = reference_month),
  constraint card_invoices_due_after_closing check (due_date >= closing_date),
  constraint card_invoices_cycle_unique unique (credit_card_id, closing_month)
);

create index card_invoices_household_id_idx on public.card_invoices (household_id);

create trigger card_invoices_set_updated_at
  before update on public.card_invoices
  for each row execute function public.set_updated_at();

create or replace function public.card_invoices_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.credit_cards c where c.id = new.credit_card_id and c.household_id = new.household_id
  ) then
    raise exception 'INVALID_CARD';
  end if;
  return new;
end;
$$;

create trigger card_invoices_check_refs
  before insert or update on public.card_invoices
  for each row execute function public.card_invoices_check_refs();

-- =====================================================================
-- Compras parceladas
-- =====================================================================

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- NO ACTION (padrão): 23503 ao excluir cartão/categoria com parcelamentos
  credit_card_id uuid not null references public.credit_cards (id),
  category_id uuid not null references public.categories (id),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  total_amount_cents bigint not null check (total_amount_cents > 0),
  installments_count smallint not null check (installments_count between 2 and 24),
  first_installment_number smallint not null,
  purchase_date date not null,
  -- Mês de fechamento da fatura da parcela 1: a parcela k fica em first_closing_month + (k − 1)
  first_closing_month date not null
    check (date_trunc('month', first_closing_month::timestamp)::date = first_closing_month),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installment_plans_first_number check (first_installment_number between 1 and installments_count)
);

create index installment_plans_household_id_idx on public.installment_plans (household_id);
create index installment_plans_credit_card_id_idx on public.installment_plans (credit_card_id);
create index installment_plans_category_id_idx on public.installment_plans (category_id);

create trigger installment_plans_set_updated_at
  before update on public.installment_plans
  for each row execute function public.set_updated_at();

create or replace function public.installment_plans_check_refs()
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
    select 1 from public.credit_cards c where c.id = new.credit_card_id and c.household_id = new.household_id
  ) then
    raise exception 'INVALID_CARD';
  end if;

  select c.kind, c.household_id into v_kind, v_household_id from public.categories c where c.id = new.category_id;
  if not found or v_household_id <> new.household_id then
    raise exception 'INVALID_CATEGORY';
  end if;
  if v_kind <> 'expense' then
    raise exception 'CATEGORY_KIND_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger installment_plans_check_refs
  before insert or update on public.installment_plans
  for each row execute function public.installment_plans_check_refs();

-- =====================================================================
-- Lançamentos: cartão, fatura, parcela e pagamento de fatura
-- =====================================================================

alter table public.transactions drop constraint transactions_shape;
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check check (type in ('income', 'expense', 'transfer', 'invoice_payment'));

alter table public.transactions alter column account_id drop not null;

alter table public.transactions
  add column credit_card_id uuid references public.credit_cards (id),
  add column invoice_id uuid references public.card_invoices (id),
  add column installment_plan_id uuid references public.installment_plans (id) on delete cascade,
  add column installment_number smallint;

alter table public.transactions add constraint transactions_shape check (
  (
    type in ('income', 'expense')
    and category_id is not null
    and destination_account_id is null
    and (
      (account_id is not null and credit_card_id is null and invoice_id is null)
      or (account_id is null and credit_card_id is not null and invoice_id is not null)
    )
  )
  or (
    type = 'transfer'
    and category_id is null
    and account_id is not null
    and destination_account_id is not null
    and destination_account_id <> account_id
    and credit_card_id is null
    and invoice_id is null
  )
  or (
    type = 'invoice_payment'
    and account_id is not null
    and credit_card_id is not null
    and invoice_id is not null
    and category_id is null
    and destination_account_id is null
  )
);

alter table public.transactions add constraint transactions_installment_shape check (
  (installment_plan_id is null and installment_number is null)
  or (
    installment_plan_id is not null
    and installment_number is not null
    and type = 'expense'
    and credit_card_id is not null
  )
);

create index transactions_credit_card_id_idx on public.transactions (credit_card_id);
create index transactions_invoice_id_idx on public.transactions (invoice_id);
create index transactions_installment_plan_id_idx on public.transactions (installment_plan_id);

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
-- Último cartão usado por pessoa
-- =====================================================================

alter table public.profiles
  add column last_credit_card_id uuid references public.credit_cards (id) on delete set null;

grant update (last_credit_card_id) on public.profiles to authenticated;

-- =====================================================================
-- Views
-- =====================================================================

-- Saldo por conta: pagamentos de fatura saem da conta de origem
create or replace view public.v_account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.household_id,
  (a.initial_balance_cents + coalesce(sum(
    case
      when t.type = 'income' and t.account_id = a.id then t.amount_cents
      when t.type = 'expense' and t.account_id = a.id then -t.amount_cents
      when t.type = 'invoice_payment' and t.account_id = a.id then -t.amount_cents
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

-- Totais por fatura (mesma regra de summarizeInvoice em lib/finance/invoice.ts)
create view public.v_invoice_totals
with (security_invoker = true)
as
select
  i.id as invoice_id,
  i.household_id,
  i.credit_card_id,
  i.closing_month,
  i.closing_date,
  i.due_date,
  i.reference_month,
  coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)::bigint as charges_cents,
  coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint as credits_cents,
  (
    coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)
    - coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)
  )::bigint as total_cents,
  coalesce(sum(t.amount_cents) filter (where t.type = 'invoice_payment' and t.status = 'paid'), 0)::bigint as paid_cents
from public.card_invoices i
left join public.transactions t on t.invoice_id = i.id
group by i.id;

-- =====================================================================
-- RPCs (security invoker: o RLS vale para quem chama)
-- =====================================================================

create or replace function public.ensure_invoice(
  p_card_id uuid,
  p_closing_month date,
  p_closing_date date,
  p_due_date date,
  p_reference_month date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_invoice_id uuid;
begin
  select c.household_id into v_household_id from public.credit_cards c where c.id = p_card_id;
  if not found then
    raise exception 'INVALID_CARD';
  end if;

  insert into public.card_invoices (household_id, credit_card_id, closing_month, closing_date, due_date, reference_month)
  values (v_household_id, p_card_id, p_closing_month, p_closing_date, p_due_date, p_reference_month)
  on conflict (credit_card_id, closing_month) do nothing;

  select i.id into v_invoice_id
  from public.card_invoices i
  where i.credit_card_id = p_card_id and i.closing_month = p_closing_month;

  return v_invoice_id;
end;
$$;

-- Compra no cartão (à vista, parcelada ou estorno): plano + faturas + linhas numa transação só
create or replace function public.create_card_purchase(p_card_id uuid, p_plan jsonb, p_rows jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_plan_id uuid;
  v_row jsonb;
  v_invoice_id uuid;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  select c.household_id into v_household_id from public.credit_cards c where c.id = p_card_id;
  if not found then
    raise exception 'INVALID_CARD';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVALID_INPUT';
  end if;

  if p_plan is not null and jsonb_typeof(p_plan) = 'object' then
    insert into public.installment_plans (
      household_id, credit_card_id, category_id, description, total_amount_cents,
      installments_count, first_installment_number, purchase_date, first_closing_month
    )
    values (
      v_household_id,
      p_card_id,
      (p_plan ->> 'category_id')::uuid,
      p_plan ->> 'description',
      (p_plan ->> 'total_amount_cents')::bigint,
      (p_plan ->> 'installments_count')::smallint,
      (p_plan ->> 'first_installment_number')::smallint,
      (p_plan ->> 'purchase_date')::date,
      (p_plan ->> 'first_closing_month')::date
    )
    returning id into v_plan_id;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_invoice_id := public.ensure_invoice(
      p_card_id,
      (v_row ->> 'closing_month')::date,
      (v_row ->> 'closing_date')::date,
      (v_row ->> 'due_date')::date,
      (v_row ->> 'reference_month')::date
    );

    insert into public.transactions (
      household_id, type, description, amount_cents, date, status, category_id,
      credit_card_id, invoice_id, installment_plan_id, installment_number, notes
    )
    values (
      v_household_id,
      v_row ->> 'type',
      v_row ->> 'description',
      (v_row ->> 'amount_cents')::bigint,
      (v_row ->> 'date')::date,
      v_row ->> 'status',
      (v_row ->> 'category_id')::uuid,
      p_card_id,
      v_invoice_id,
      v_plan_id,
      (v_row ->> 'installment_number')::smallint,
      v_row ->> 'notes'
    )
    returning id into v_id;

    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end;
$$;

-- Novos dias do cartão: recalcula faturas abertas e âncoras e move lançamentos (calculado em lib/finance/card.ts)
create or replace function public.apply_card_schedule(
  p_card_id uuid,
  p_closing_day integer,
  p_due_day integer,
  p_invoices jsonb,
  p_plans jsonb,
  p_moves jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_move jsonb;
  v_invoice_id uuid;
begin
  update public.credit_cards c
  set closing_day = p_closing_day::smallint, due_day = p_due_day::smallint
  where c.id = p_card_id
  returning c.household_id into v_household_id;
  if v_household_id is null then
    raise exception 'INVALID_CARD';
  end if;

  update public.card_invoices i
  set
    closing_date = (x.value ->> 'closing_date')::date,
    due_date = (x.value ->> 'due_date')::date,
    reference_month = (x.value ->> 'reference_month')::date
  from jsonb_array_elements(coalesce(p_invoices, '[]'::jsonb)) as x
  where i.id = (x.value ->> 'id')::uuid and i.credit_card_id = p_card_id;

  update public.installment_plans p
  set first_closing_month = (x.value ->> 'first_closing_month')::date
  from jsonb_array_elements(coalesce(p_plans, '[]'::jsonb)) as x
  where p.id = (x.value ->> 'id')::uuid and p.credit_card_id = p_card_id;

  for v_move in select value from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) loop
    v_invoice_id := public.ensure_invoice(
      p_card_id,
      (v_move ->> 'closing_month')::date,
      (v_move ->> 'closing_date')::date,
      (v_move ->> 'due_date')::date,
      (v_move ->> 'reference_month')::date
    );
    update public.transactions t
    set invoice_id = v_invoice_id
    where t.id = (v_move ->> 'transaction_id')::uuid and t.credit_card_id = p_card_id;
  end loop;
end;
$$;

-- "Desfazer": recria o plano (se veio no snapshot) e as linhas com os mesmos ids
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
    source, external_id, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.date, r.status, r.category_id, r.account_id,
    r.destination_account_id, r.credit_card_id, r.invoice_id, r.installment_plan_id, r.installment_number,
    coalesce(r.source, 'manual'), r.external_id, r.notes
  from jsonb_populate_recordset(null::public.transactions, p_rows) r;
end;
$$;

-- =====================================================================
-- Permissões e RLS
-- =====================================================================

revoke all on function public.credit_cards_check_refs() from public, anon, authenticated;
revoke all on function public.card_invoices_check_refs() from public, anon, authenticated;
revoke all on function public.installment_plans_check_refs() from public, anon, authenticated;

revoke all on function public.ensure_invoice(uuid, date, date, date, date) from public, anon;
revoke all on function public.create_card_purchase(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.apply_card_schedule(uuid, integer, integer, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.restore_transactions(jsonb, jsonb) from public, anon;
grant execute on function public.ensure_invoice(uuid, date, date, date, date) to authenticated;
grant execute on function public.create_card_purchase(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.apply_card_schedule(uuid, integer, integer, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.restore_transactions(jsonb, jsonb) to authenticated;

revoke all on public.credit_cards, public.card_invoices, public.installment_plans, public.v_invoice_totals from anon;
revoke truncate, references, trigger on public.credit_cards, public.card_invoices, public.installment_plans from authenticated;
grant select on public.v_invoice_totals to authenticated;

alter table public.credit_cards enable row level security;
alter table public.card_invoices enable row level security;
alter table public.installment_plans enable row level security;

create policy credit_cards_all on public.credit_cards
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy card_invoices_all on public.card_invoices
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy installment_plans_all on public.installment_plans
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
```

- [ ] **Step 5: Aplicar no projeto remoto**

Run: `npx supabase db push --yes`
Expected: "Applying migration 20261004140000_cartoes_faturas_parcelas.sql..." e "Finished supabase db push." Se der erro de SQL, confira com `npx supabase migration list` se a migration ficou registrada; se não, corrija e rode de novo; se ficou parcial, PARE e avise o usuário.

- [ ] **Step 6: Regenerar os tipos**

Run: `npm run db:types && grep -c "credit_cards\|v_invoice_totals\|create_card_purchase\|last_credit_card_id" lib/supabase/database.types.ts`
Expected: contagem ≥ 4.

- [ ] **Step 7: Erros traduzidos — teste que falha**

Em `lib/supabase/errors.test.ts`, troque o import por `import { CARD_IN_USE, GENERIC_ERROR, translateError } from './errors'` e acrescente:

```ts
describe('erros dos cartões', () => {
  it('traduz os códigos da Fase 3', () => {
    expect(translateError({ code: 'P0001', message: 'INVALID_CARD' })).toBe('Cartão inválido.')
    expect(translateError({ code: 'P0001', message: 'INVALID_INVOICE' })).toBe('Fatura inválida.')
    expect(translateError({ code: 'P0001', message: 'INVALID_PLAN' })).toBe('Parcelamento inválido.')
    expect(translateError({ code: 'P0001', message: 'INVALID_INPUT' })).toBe('Dados inválidos.')
    expect(translateError({ code: '23514', message: 'violates check constraint' })).toBe(
      'Os dados do lançamento não combinam. Confira e tente de novo.',
    )
    expect(CARD_IN_USE).toBe('Não é possível excluir: há lançamentos neste cartão. Arquive em vez de excluir.')
  })
})
```

Run: `npm test -- lib/supabase/errors.test.ts`
Expected: FAIL.

- [ ] **Step 8: Mensagens em `lib/supabase/errors.ts`**

Depois de `CATEGORY_KIND_MISMATCH`, acrescente:

```ts
  INVALID_CARD: 'Cartão inválido.',
  INVALID_INVOICE: 'Fatura inválida.',
  INVALID_PLAN: 'Parcelamento inválido.',
  INVALID_INPUT: 'Dados inválidos.',
```

e, depois de `'23505'`:

```ts
  '23514': 'Os dados do lançamento não combinam. Confira e tente de novo.',
```

Depois de `GENERIC_ERROR`:

```ts
/** 23503 ao excluir um cartão: a mensagem genérica fala de subcategorias, que não se aplicam. */
export const CARD_IN_USE = 'Não é possível excluir: há lançamentos neste cartão. Arquive em vez de excluir.'
```

Run: `npm test -- lib/supabase/errors.test.ts`
Expected: PASS.

- [ ] **Step 9: Linha de lançamento com as colunas novas — teste que falha**

Em `lib/transaction-mappers.test.ts`, troque o import por:

```ts
import {
  applyEffectiveStatus,
  inputToRow,
  pickDefaultAccountId,
  rowToFormValues,
  rowToInput,
  rowToLedger,
  type TransactionRow,
} from './transaction-mappers'
```

e o objeto `row` por:

```ts
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
  credit_card_id: null,
  invoice_id: null,
  installment_plan_id: null,
  installment_number: null,
  notes: null,
  created_at: '2026-10-04T12:00:00Z',
  installment_plans: null,
  card_invoices: null,
}
```

Acrescente ao final do `describe`:

```ts
  it('applyEffectiveStatus: compra no cartão segue a data; em conta, o status salvo', () => {
    const card = { ...row, account_id: null, credit_card_id: 'card-1', invoice_id: 'inv-1', status: 'pending' as const }
    expect(applyEffectiveStatus(card, '2026-10-04').status).toBe('paid')
    expect(applyEffectiveStatus({ ...card, date: '2026-11-04', status: 'paid' }, '2026-10-04').status).toBe('pending')
    expect(applyEffectiveStatus({ ...row, status: 'pending' }, '2026-12-01').status).toBe('pending')
    expect(applyEffectiveStatus(row, '2026-10-04')).toBe(row)
  })
```

Run: `npm test -- lib/transaction-mappers.test.ts`
Expected: FAIL — `applyEffectiveStatus` não exportado.

- [ ] **Step 10: `lib/transaction-mappers.ts`**

Troque o topo do arquivo (imports, `TRANSACTION_COLUMNS` e `TransactionRow`) por:

```ts
import { effectiveStatus } from '@/lib/finance/status'
import type { LedgerTransaction, TransactionStatus, TransactionType } from '@/lib/finance/types'
import type { TransactionFormValues, TransactionInput } from '@/lib/validation/transaction'

export const TRANSACTION_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, notes, created_at, installment_plans(installments_count), card_invoices(closing_month)'

export type TransactionRow = {
  id: string
  type: TransactionType
  description: string
  amount_cents: number
  date: string
  status: TransactionStatus
  category_id: string | null
  /** Nulo nas receitas e despesas no cartão. */
  account_id: string | null
  destination_account_id: string | null
  credit_card_id: string | null
  invoice_id: string | null
  installment_plan_id: string | null
  installment_number: number | null
  notes: string | null
  created_at: string
  installment_plans: { installments_count: number } | null
  card_invoices: { closing_month: string } | null
}
```

Em `rowToInput` e `rowToFormValues`, troque `accountId: row.account_id,` por `accountId: row.account_id ?? '',`. Acrescente ao final do arquivo:

```ts
/** Linha com o status de leitura (compras no cartão seguem a data). */
export function applyEffectiveStatus(row: TransactionRow, today: string): TransactionRow {
  const status = effectiveStatus({ type: row.type, status: row.status, date: row.date, accountId: row.account_id }, today)
  return status === row.status ? row : { ...row, status }
}
```

- [ ] **Step 11: Compilar as telas com `account_id` opcional**

Em `components/accounts/statement-list.tsx`, troque `accountNames.get(row.account_id)` por `accountNames.get(row.account_id ?? '')`.

Em `components/transactions/transaction-list.tsx`, troque as duas ocorrências de `accountName.get(row.account_id)` por `accountName.get(row.account_id ?? '')`.

Run: `npm test && npx tsc --noEmit`
Expected: PASS e sem erros de tipo.

- [ ] **Step 12: Rodar os testes de integração**

Run: `npm run test:rls`
Expected: PASS em todos (Fases 1 e 2 + 10 novos de `cards.rls.test.ts`).

- [ ] **Step 13: Commit**

```bash
git add supabase/migrations lib/card-rpc.ts lib/card-rpc.test.ts lib/supabase lib/transaction-mappers.ts lib/transaction-mappers.test.ts components/accounts/statement-list.tsx components/transactions/transaction-list.tsx tests/rls/cards.rls.test.ts
git commit -m "$(cat <<'EOF'
feat(db): cartões, faturas, parcelas e pagamento de fatura com RLS e RPCs atômicos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Schemas de cartão, pagamento, compra no cartão e snapshot de exclusão

**Files:**
- Create: `lib/validation/card.ts`, `lib/validation/card.test.ts`, `lib/validation/invoice-payment.ts`, `lib/validation/invoice-payment.test.ts`, `lib/validation/transaction-record.ts`, `lib/validation/transaction-record.test.ts`
- Modify: `lib/validation/transaction.ts`, `lib/validation/transaction.test.ts`, `lib/transaction-mappers.ts`, `lib/transaction-mappers.test.ts`, `components/transactions/transaction-form.tsx`

**Interfaces:**
- Consumes: `MAX_INSTALLMENTS`, `CardPurchaseInput` (Task 2); `COLOR_PALETTE`, `PaletteColor` (`lib/categories.ts`); `isoDateSchema` (`lib/validation/common.ts`).
- Produces:
  - `lib/validation/card.ts`: `CARD_BRANDS`, `type CardBrand`, `CARD_BRAND_LABELS`, `type CardOption = { id: string; name: string; color: string; archived: boolean; closingDay: number; dueDay: number }`, `cardSchema`, `type CardFormInput`, `type CardOutput`, `cardSubtitle(card: { brand: CardBrand; lastFour: string | null; archived: boolean }): string`.
  - `lib/validation/invoice-payment.ts`: `invoicePaymentSchema`, `type InvoicePaymentInput = { accountId: string; amountCents: number; date: string }`.
  - `lib/validation/transaction.ts`: `cardTransactionSchema`, `type CardTransactionInput`, `toCardPurchaseInput(input): CardPurchaseInput`, `INSTALLMENT_SCOPES`, `type InstallmentScope = 'one' | 'future'`, `installmentEditSchema`, `type InstallmentEditInput`, `type FormTransactionType = 'income' | 'expense' | 'transfer'`, `TransactionFormValues` com `creditCardId`, `installmentsCount`, `inProgress`, `currentInstallment`; `isCardForm(values)`, `toCardTransactionInput(values)`; o resolver escolhe o schema.
  - `lib/validation/transaction-record.ts`: `TRANSACTION_RECORD_COLUMNS`, `PLAN_RECORD_COLUMNS`, `transactionRecordSchema`, `planRecordSchema`, `deletionSnapshotSchema`, tipos `TransactionRecord`, `PlanRecord`, `DeletionSnapshot = { plan: PlanRecord | null; rows: TransactionRecord[] }`.

- [ ] **Step 1: Testes de cartão e pagamento que falham**

Crie `lib/validation/card.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cardSchema, cardSubtitle } from './card'

const ACC = '11111111-1111-4111-8111-111111111111'
const valid = {
  name: ' Nubank ',
  brand: 'mastercard',
  lastFour: '1234',
  limitCents: 500_000,
  closingDay: 3,
  dueDay: 10,
  defaultPaymentAccountId: ACC,
  color: '#3b82f6',
}

describe('cardSchema', () => {
  it('aceita e normaliza o nome', () => {
    expect(cardSchema.parse(valid)).toEqual({ ...valid, name: 'Nubank' })
  })

  it('últimos dígitos e conta padrão vazios viram null', () => {
    expect(cardSchema.parse({ ...valid, lastFour: '', defaultPaymentAccountId: '' })).toMatchObject({
      lastFour: null,
      defaultPaymentAccountId: null,
    })
  })

  it('recusa dígitos inválidos, dia fora de 1–31 e limite negativo', () => {
    expect(cardSchema.safeParse({ ...valid, lastFour: '12a4' }).error?.issues[0].message).toBe('Informe os 4 últimos dígitos.')
    expect(cardSchema.safeParse({ ...valid, closingDay: 32 }).error?.issues[0].path).toEqual(['closingDay'])
    expect(cardSchema.safeParse({ ...valid, dueDay: 0 }).error?.issues[0].message).toBe('Escolha o dia de vencimento.')
    expect(cardSchema.safeParse({ ...valid, limitCents: -1 }).success).toBe(false)
    expect(cardSchema.safeParse({ ...valid, brand: 'diners' }).error?.issues[0].message).toBe('Escolha a bandeira.')
  })
})

describe('cardSubtitle', () => {
  it('bandeira, final e arquivado', () => {
    expect(cardSubtitle({ brand: 'visa', lastFour: '1234', archived: false })).toBe('Visa · •••• 1234')
    expect(cardSubtitle({ brand: 'other', lastFour: null, archived: true })).toBe('Outra · arquivado')
  })
})
```

Crie `lib/validation/invoice-payment.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { invoicePaymentSchema } from './invoice-payment'

const ACC = '11111111-1111-4111-8111-111111111111'

describe('invoicePaymentSchema', () => {
  it('aceita conta, valor e data', () => {
    expect(invoicePaymentSchema.parse({ accountId: ACC, amountCents: 3334, date: '2026-10-10' })).toEqual({
      accountId: ACC,
      amountCents: 3334,
      date: '2026-10-10',
    })
  })

  it('recusa valor zero e conta ausente', () => {
    expect(invoicePaymentSchema.safeParse({ accountId: ACC, amountCents: 0, date: '2026-10-10' }).error?.issues[0].message).toBe(
      'Informe um valor maior que zero.',
    )
    expect(invoicePaymentSchema.safeParse({ accountId: '', amountCents: 10, date: '2026-10-10' }).error?.issues[0].message).toBe(
      'Escolha a conta.',
    )
  })
})
```

Run: `npm test -- lib/validation/card.test.ts lib/validation/invoice-payment.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 2: Implementar `lib/validation/card.ts` e `lib/validation/invoice-payment.ts`**

`lib/validation/card.ts`:

```ts
import { z } from 'zod'
import { COLOR_PALETTE } from '@/lib/categories'

export const CARD_BRANDS = ['visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other'] as const
export type CardBrand = (typeof CARD_BRANDS)[number]

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
  other: 'Outra',
}

/** Cartão como o formulário rápido precisa (seguro para componentes de cliente). */
export type CardOption = { id: string; name: string; color: string; archived: boolean; closingDay: number; dueDay: number }

const MAX_CENTS = 99_999_999_999

function day(label: string) {
  const error = `Escolha o dia de ${label}.`
  return z.number({ error }).int({ error }).min(1, { error }).max(31, { error })
}

export const cardSchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome do cartão.' }).max(40, { error: 'Use no máximo 40 caracteres.' }),
  brand: z.enum(CARD_BRANDS, { error: 'Escolha a bandeira.' }),
  lastFour: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, { error: 'Informe os 4 últimos dígitos.' })
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  limitCents: z
    .number({ error: 'Informe o limite.' })
    .int({ error: 'Informe o limite.' })
    .min(0, { error: 'O limite não pode ser negativo.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  closingDay: day('fechamento'),
  dueDay: day('vencimento'),
  defaultPaymentAccountId: z
    .union([z.uuid({ error: 'Conta inválida.' }), z.literal('')])
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  color: z.enum(COLOR_PALETTE, { error: 'Escolha uma cor.' }),
})

export type CardFormInput = z.input<typeof cardSchema>
export type CardOutput = z.output<typeof cardSchema>

/** "Visa · •••• 1234 · arquivado". */
export function cardSubtitle(card: { brand: CardBrand; lastFour: string | null; archived: boolean }): string {
  return [CARD_BRAND_LABELS[card.brand], card.lastFour ? `•••• ${card.lastFour}` : null, card.archived ? 'arquivado' : null]
    .filter(Boolean)
    .join(' · ')
}
```

`lib/validation/invoice-payment.ts`:

```ts
import { z } from 'zod'
import { isoDateSchema } from './common'

const MAX_CENTS = 99_999_999_999

export const invoicePaymentSchema = z.object({
  accountId: z.uuid({ error: 'Escolha a conta.' }),
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int({ error: 'Informe o valor.' })
    .positive({ error: 'Informe um valor maior que zero.' })
    .max(MAX_CENTS, { error: 'Valor muito alto.' }),
  date: isoDateSchema,
})

export type InvoicePaymentInput = z.output<typeof invoicePaymentSchema>
```

Run: `npm test -- lib/validation/card.test.ts lib/validation/invoice-payment.test.ts`
Expected: PASS.

- [ ] **Step 3: Testes do snapshot de exclusão que falham**

Crie `lib/validation/transaction-record.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deletionSnapshotSchema } from './transaction-record'

const ID = '11111111-1111-4111-8111-111111111111'
const CAT = '33333333-3333-4333-8333-333333333333'
const CARD = '44444444-4444-4444-8444-444444444444'
const INV = '55555555-5555-4555-8555-555555555555'
const PLAN = '66666666-6666-4666-8666-666666666666'

const record = {
  id: ID,
  type: 'expense',
  description: 'Geladeira',
  amount_cents: 3334,
  date: '2026-10-02',
  status: 'paid',
  category_id: CAT,
  account_id: null,
  destination_account_id: null,
  credit_card_id: CARD,
  invoice_id: INV,
  installment_plan_id: PLAN,
  installment_number: 1,
  source: 'manual',
  external_id: null,
  notes: null,
}

const plan = {
  id: PLAN,
  credit_card_id: CARD,
  category_id: CAT,
  description: 'Geladeira',
  total_amount_cents: 10_000,
  installments_count: 3,
  first_installment_number: 1,
  purchase_date: '2026-10-02',
  first_closing_month: '2026-10-01',
}

describe('deletionSnapshotSchema', () => {
  it('aceita a exclusão de parcelas com o plano', () => {
    expect(deletionSnapshotSchema.parse({ plan, rows: [record] })).toEqual({ plan, rows: [record] })
  })

  it('aceita a exclusão simples, sem plano', () => {
    const single = { ...record, installment_plan_id: null, installment_number: null }
    expect(deletionSnapshotSchema.parse({ plan: null, rows: [single] }).rows).toEqual([single])
  })

  it('recusa snapshot vazio ou adulterado', () => {
    expect(deletionSnapshotSchema.safeParse({ plan: null, rows: [] }).success).toBe(false)
    expect(deletionSnapshotSchema.safeParse({ plan: null, rows: [{ ...record, type: 'hack' }] }).success).toBe(false)
    expect(deletionSnapshotSchema.safeParse({ plan: null, rows: [{ ...record, id: 'x' }] }).success).toBe(false)
    expect(deletionSnapshotSchema.safeParse({ plan: { ...plan, installments_count: 99 }, rows: [record] }).success).toBe(false)
  })
})
```

Run: `npm test -- lib/validation/transaction-record.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implementar `lib/validation/transaction-record.ts`**

```ts
import { z } from 'zod'
import { isoDateSchema } from './common'

/** Colunas de transactions que o "Desfazer" recria (sem embeds: servem também para delete().select()). */
export const TRANSACTION_RECORD_COLUMNS =
  'id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, source, external_id, notes'

export const PLAN_RECORD_COLUMNS =
  'id, credit_card_id, category_id, description, total_amount_cents, installments_count, first_installment_number, purchase_date, first_closing_month'

const nullableUuid = z.uuid().nullable()

export const transactionRecordSchema = z.object({
  id: z.uuid(),
  type: z.enum(['income', 'expense', 'transfer', 'invoice_payment']),
  description: z.string().min(1).max(120),
  amount_cents: z.number().int().positive(),
  date: isoDateSchema,
  status: z.enum(['paid', 'pending']),
  category_id: nullableUuid,
  account_id: nullableUuid,
  destination_account_id: nullableUuid,
  credit_card_id: nullableUuid,
  invoice_id: nullableUuid,
  installment_plan_id: nullableUuid,
  installment_number: z.number().int().min(1).max(24).nullable(),
  source: z.enum(['manual', 'recurrence', 'property', 'import']),
  external_id: z.string().max(200).nullable(),
  notes: z.string().max(500).nullable(),
})

export const planRecordSchema = z.object({
  id: z.uuid(),
  credit_card_id: z.uuid(),
  category_id: z.uuid(),
  description: z.string().min(1).max(120),
  total_amount_cents: z.number().int().positive(),
  installments_count: z.number().int().min(2).max(24),
  first_installment_number: z.number().int().min(1).max(24),
  purchase_date: isoDateSchema,
  first_closing_month: isoDateSchema,
})

/** O que uma exclusão devolve para o "Desfazer": o plano (se foi apagado junto) e as linhas. */
export const deletionSnapshotSchema = z.object({
  plan: planRecordSchema.nullable(),
  rows: z.array(transactionRecordSchema).min(1).max(24),
})

export type TransactionRecord = z.output<typeof transactionRecordSchema>
export type PlanRecord = z.output<typeof planRecordSchema>
export type DeletionSnapshot = z.output<typeof deletionSnapshotSchema>
```

Run: `npm test -- lib/validation/transaction-record.test.ts`
Expected: PASS.

- [ ] **Step 5: Testes de compra no cartão que falham**

Em `lib/validation/transaction.test.ts`, troque o import por:

```ts
import {
  cardTransactionSchema,
  installmentEditSchema,
  isCardForm,
  toCardPurchaseInput,
  toCardTransactionInput,
  toTransactionInput,
  transactionFormResolver,
  transactionSchema,
  transactionSnapshotSchema,
  type TransactionFormValues,
} from './transaction'
```

acrescente `const CARD = '44444444-4444-4444-8444-444444444444'` depois de `CAT`, e troque o objeto `form` por:

```ts
const form: TransactionFormValues = {
  type: 'expense',
  amountCents: 1250,
  description: ' Padaria ',
  categoryId: CAT,
  accountId: ACC_1,
  creditCardId: '',
  destinationAccountId: '',
  date: '2026-10-04',
  status: 'paid',
  notes: '',
  installmentsCount: 1,
  inProgress: false,
  currentInstallment: 1,
}

const cardForm: TransactionFormValues = { ...form, accountId: '', creditCardId: CARD }
```

Acrescente ao final:

```ts
describe('cardTransactionSchema', () => {
  it('compra parcelada: amountCents é o total', () => {
    const parsed = cardTransactionSchema.parse(toCardTransactionInput({ ...cardForm, amountCents: 10_000, installmentsCount: 3 }))
    expect(parsed).toMatchObject({ type: 'expense', creditCardId: CARD, installmentsCount: 3, currentInstallment: null })
    expect(toCardPurchaseInput(parsed)).toEqual({ mode: 'installments', totalCents: 10_000, count: 3, date: '2026-10-04' })
  })

  it('compra em andamento: amountCents é o valor da parcela', () => {
    const parsed = cardTransactionSchema.parse(
      toCardTransactionInput({ ...cardForm, amountCents: 15_000, installmentsCount: 10, inProgress: true, currentInstallment: 3 }),
    )
    expect(toCardPurchaseInput(parsed)).toEqual({ mode: 'in_progress', installmentCents: 15_000, current: 3, count: 10, date: '2026-10-04' })
  })

  it('à vista e estorno (o formulário zera as parcelas da receita)', () => {
    expect(toCardPurchaseInput(cardTransactionSchema.parse(toCardTransactionInput(cardForm)))).toEqual({
      mode: 'single',
      amountCents: 1250,
      date: '2026-10-04',
    })
    const refund = cardTransactionSchema.parse(toCardTransactionInput({ ...cardForm, type: 'income', installmentsCount: 5, inProgress: true }))
    expect(refund).toMatchObject({ type: 'income', installmentsCount: 1, currentInstallment: null })
  })

  it('recusa combinações inválidas', () => {
    const base = toCardTransactionInput(cardForm) as Record<string, unknown>
    const firstIssue = (patch: Record<string, unknown>) => cardTransactionSchema.safeParse({ ...base, ...patch }).error?.issues[0].message
    expect(firstIssue({ type: 'income', installmentsCount: 2 })).toBe('Estorno não pode ser parcelado.')
    expect(firstIssue({ installmentsCount: 1, currentInstallment: 1 })).toBe('Informe o total de parcelas.')
    expect(firstIssue({ installmentsCount: 3, currentInstallment: 4 })).toBe('A parcela atual não pode passar do total.')
    expect(firstIssue({ amountCents: 1, installmentsCount: 2 })).toBe('Valor pequeno demais para tantas parcelas.')
    expect(firstIssue({ installmentsCount: 25 })).toBe('Use no máximo 24 parcelas.')
    expect(firstIssue({ creditCardId: undefined })).toBe('Escolha o cartão.')
  })
})

describe('formulário com cartão', () => {
  it('isCardForm: cartão escolhido e tipo diferente de transferência', () => {
    expect(isCardForm(cardForm)).toBe(true)
    expect(isCardForm(form)).toBe(false)
    expect(isCardForm({ ...cardForm, type: 'transfer' })).toBe(false)
  })

  it('o resolver valida pelo schema do cartão', async () => {
    const result = await transactionFormResolver(
      { ...cardForm, installmentsCount: 3, inProgress: true, currentInstallment: 5 },
      undefined,
      { fields: {}, shouldUseNativeValidation: false },
    )
    expect(result.errors.currentInstallment?.message).toBe('A parcela atual não pode passar do total.')
  })
})

describe('installmentEditSchema', () => {
  it('aceita escopo e normaliza a descrição', () => {
    expect(installmentEditSchema.parse({ scope: 'future', description: ' TV ', categoryId: CAT, notes: '' })).toEqual({
      scope: 'future',
      description: 'TV',
      categoryId: CAT,
      notes: null,
    })
    expect(installmentEditSchema.safeParse({ scope: 'all', description: 'TV', categoryId: CAT }).success).toBe(false)
  })
})
```

Run: `npm test -- lib/validation/transaction.test.ts`
Expected: FAIL — exports inexistentes.

- [ ] **Step 6: Reescrever `lib/validation/transaction.ts`**

Arquivo completo (o `transactionSnapshotSchema` ainda fica; sai no Task 8):

```ts
import type { FieldErrors, Resolver } from 'react-hook-form'
import { z } from 'zod'
import { MAX_INSTALLMENTS, type CardPurchaseInput } from '@/lib/finance/installments'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { isoDateSchema } from './common'

const MAX_CENTS = 99_999_999_999

const description = z
  .string()
  .trim()
  .min(1, { error: 'Informe a descrição.' })
  .max(120, { error: 'Use no máximo 120 caracteres.' })

const amountCents = z
  .number({ error: 'Informe o valor.' })
  .int({ error: 'Informe o valor.' })
  .positive({ error: 'Informe um valor maior que zero.' })
  .max(MAX_CENTS, { error: 'Valor muito alto.' })

const notes = z
  .string()
  .trim()
  .max(500, { error: 'Use no máximo 500 caracteres.' })
  .nullable()
  .optional()
  .transform((value) => (value ? value : null))

const categoryId = z.uuid({ error: 'Escolha a categoria.' })

const baseFields = {
  description,
  amountCents,
  date: isoDateSchema,
  status: z.enum(['paid', 'pending'], { error: 'Escolha o status.' }),
  accountId: z.uuid({ error: 'Escolha a conta.' }),
  notes,
}

/** Lançamento em conta (receita, despesa ou transferência). */
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

const installmentNumber = z
  .number({ error: 'Escolha o número de parcelas.' })
  .int({ error: 'Escolha o número de parcelas.' })
  .min(1, { error: 'Escolha o número de parcelas.' })
  .max(MAX_INSTALLMENTS, { error: `Use no máximo ${MAX_INSTALLMENTS} parcelas.` })

/**
 * Receita (estorno) ou despesa no cartão. `amountCents` é o total da compra — ou o valor de cada parcela
 * quando `currentInstallment` vem preenchido (compra já em andamento).
 */
export const cardTransactionSchema = z
  .object({
    type: z.enum(['income', 'expense'], { error: 'Escolha o tipo.' }),
    description,
    amountCents,
    date: isoDateSchema,
    notes,
    categoryId,
    creditCardId: z.uuid({ error: 'Escolha o cartão.' }),
    installmentsCount: installmentNumber,
    currentInstallment: installmentNumber.nullable(),
  })
  .refine((value) => value.type === 'expense' || (value.installmentsCount === 1 && value.currentInstallment === null), {
    error: 'Estorno não pode ser parcelado.',
    path: ['installmentsCount'],
  })
  .refine((value) => value.currentInstallment === null || value.installmentsCount >= 2, {
    error: 'Informe o total de parcelas.',
    path: ['installmentsCount'],
  })
  .refine((value) => value.currentInstallment === null || value.currentInstallment <= value.installmentsCount, {
    error: 'A parcela atual não pode passar do total.',
    path: ['currentInstallment'],
  })
  .refine((value) => value.currentInstallment !== null || value.amountCents >= value.installmentsCount, {
    error: 'Valor pequeno demais para tantas parcelas.',
    path: ['amountCents'],
  })

export type CardTransactionInput = z.output<typeof cardTransactionSchema>

/** Entrada de buildCardPurchase a partir do formulário validado. */
export function toCardPurchaseInput(input: CardTransactionInput): CardPurchaseInput {
  if (input.currentInstallment !== null) {
    return {
      mode: 'in_progress',
      installmentCents: input.amountCents,
      current: input.currentInstallment,
      count: input.installmentsCount,
      date: input.date,
    }
  }
  if (input.installmentsCount > 1) {
    return { mode: 'installments', totalCents: input.amountCents, count: input.installmentsCount, date: input.date }
  }
  return { mode: 'single', amountCents: input.amountCents, date: input.date }
}

export const INSTALLMENT_SCOPES = ['one', 'future'] as const
export type InstallmentScope = (typeof INSTALLMENT_SCOPES)[number]

/** Edição de parcela: só os campos descritivos, nesta parcela ou nesta e nas futuras. */
export const installmentEditSchema = z.object({
  scope: z.enum(INSTALLMENT_SCOPES, { error: 'Escolha onde aplicar.' }),
  description,
  categoryId,
  notes,
})

export type InstallmentEditInput = z.input<typeof installmentEditSchema>

/** Pagamentos de fatura têm formulário próprio (tela da fatura). */
export type FormTransactionType = Exclude<TransactionType, 'invoice_payment'>

/** Estado plano do formulário (campos vazios = ''). */
export type TransactionFormValues = {
  type: FormTransactionType
  amountCents: number
  description: string
  categoryId: string
  accountId: string
  /** Preenchido quando "Pagar com" é um cartão (aí accountId fica ''). */
  creditCardId: string
  destinationAccountId: string
  date: string
  status: TransactionStatus
  notes: string
  installmentsCount: number
  /** Compra já em andamento: o valor passa a ser o de cada parcela. */
  inProgress: boolean
  currentInstallment: number
}

/** Receita/despesa com um cartão em "Pagar com". */
export function isCardForm(values: Pick<TransactionFormValues, 'type' | 'creditCardId'>): boolean {
  return values.type !== 'transfer' && values.creditCardId !== ''
}

/** Converte o formulário na entrada do schema de conta, mantendo só os campos do tipo escolhido. */
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

/** Converte o formulário na entrada do schema do cartão; receita nunca é parcelada. */
export function toCardTransactionInput(values: TransactionFormValues): unknown {
  const canSplit = values.type === 'expense'
  return {
    type: values.type,
    description: values.description,
    amountCents: values.amountCents,
    date: values.date,
    notes: values.notes,
    categoryId: values.categoryId || undefined,
    creditCardId: values.creditCardId || undefined,
    installmentsCount: canSplit ? values.installmentsCount : 1,
    currentInstallment: canSplit && values.inProgress ? values.currentInstallment : null,
  }
}

/** Resolver do react-hook-form que valida com o mesmo schema do servidor (conta ou cartão). */
export const transactionFormResolver: Resolver<TransactionFormValues> = async (values) => {
  const parsed = isCardForm(values)
    ? cardTransactionSchema.safeParse(toCardTransactionInput(values))
    : transactionSchema.safeParse(toTransactionInput(values))
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

- [ ] **Step 7: Mapeador e formulário com os campos novos**

Em `lib/transaction-mappers.ts`, troque `rowToFormValues` por:

```ts
export function rowToFormValues(row: TransactionRow): TransactionFormValues {
  return {
    // Pagamentos de fatura não abrem este formulário (têm o da tela da fatura)
    type: row.type === 'invoice_payment' ? 'expense' : row.type,
    amountCents: row.amount_cents,
    description: row.description,
    categoryId: row.category_id ?? '',
    accountId: row.account_id ?? '',
    creditCardId: row.type === 'invoice_payment' ? '' : (row.credit_card_id ?? ''),
    destinationAccountId: row.destination_account_id ?? '',
    date: row.date,
    status: row.status,
    notes: row.notes ?? '',
    installmentsCount: row.installment_plans?.installments_count ?? 1,
    inProgress: false,
    currentInstallment: row.installment_number ?? 1,
  }
}
```

Em `lib/transaction-mappers.test.ts`, no teste `rowToInput e rowToFormValues`, o objeto esperado de `rowToFormValues` passa a ser:

```ts
    expect(rowToFormValues({ ...row, type: 'transfer', category_id: null, destination_account_id: 'acc-2' })).toEqual({
      type: 'transfer',
      amountCents: 1250,
      description: 'Padaria',
      categoryId: '',
      accountId: 'acc-1',
      creditCardId: '',
      destinationAccountId: 'acc-2',
      date: '2026-10-04',
      status: 'paid',
      notes: '',
      installmentsCount: 1,
      inProgress: false,
      currentInstallment: 1,
    })
```

e acrescente ao `describe`:

```ts
  it('rowToFormValues de uma parcela no cartão', () => {
    const installment = {
      ...row,
      account_id: null,
      credit_card_id: 'card-1',
      invoice_id: 'inv-1',
      installment_plan_id: 'plan-1',
      installment_number: 3,
      installment_plans: { installments_count: 10 },
    }
    expect(rowToFormValues(installment)).toMatchObject({
      accountId: '',
      creditCardId: 'card-1',
      installmentsCount: 10,
      currentInstallment: 3,
    })
  })
```

Em `components/transactions/transaction-form.tsx`:
- troque `import type { TransactionStatus, TransactionType } from '@/lib/finance/types'` por `import type { TransactionStatus } from '@/lib/finance/types'`;
- acrescente `type FormTransactionType` ao import de `@/lib/validation/transaction`;
- troque `function changeType(value: TransactionType)` por `function changeType(value: FormTransactionType)`;
- nos `defaultValues`, depois de `accountId: ...`, acrescente `creditCardId: '',` e, depois de `notes: '',`, acrescente `installmentsCount: 1, inProgress: false, currentInstallment: 1,`.

- [ ] **Step 8: Rodar testes e tipos**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS; sem erros de tipo nem de lint.

- [ ] **Step 9: Commit**

```bash
git add lib/validation lib/transaction-mappers.ts lib/transaction-mappers.test.ts components/transactions/transaction-form.tsx
git commit -m "$(cat <<'EOF'
feat: schemas de cartão, pagamento de fatura, compra no cartão e snapshot de exclusão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Cartões — consultas, ações e tela

**Files:**
- Create: `lib/cards.ts`, `lib/actions/cards.ts`, `components/cards/usage-bar.tsx`, `components/cards/card-form.tsx`
- Modify: `app/(app)/cartoes/page.tsx`

**Interfaces:**
- Consumes: `cardUsage`, `usageLevel`, `rescheduleCard`, `type CardUsage` (Task 3); `cycleForDate` (Task 1); `scheduleRpcArgs` (Task 5); `cardSchema`, `CardOption`, `CardBrand`, `cardSubtitle`, `CARD_BRANDS`, `CARD_BRAND_LABELS` (Task 6); `CARD_IN_USE`, `translateError`, `GENERIC_ERROR`; `fetchAllPages`; `useTransactionFormData().accounts`.
- Produces:
  - `lib/cards.ts` (server-only): `type InvoiceTotals = { invoiceId: string; creditCardId: string; cycle: InvoiceCycle; chargesCents: number; creditsCents: number; totalCents: number; paidCents: number }`, `type Card = CardOption & { brand: CardBrand; lastFour: string | null; limitCents: number; defaultPaymentAccountId: string | null }`, `type CardWithUsage = Card & { usage: CardUsage; currentCycle: InvoiceCycle; currentTotalCents: number }`, `toSchedule(card): CardSchedule`, `listCards({ includeArchived? }): Promise<CardWithUsage[]>`, `getCard(id): Promise<{ card: CardWithUsage; invoices: InvoiceTotals[] } | null>`, `listCardOptions(): Promise<CardOption[]>`.
  - `lib/actions/cards.ts`: `createCard(input)`, `updateCard(id, input)`, `setCardArchived(id, archived)`, `deleteCard(id)` — todas `ActionResult`.
  - `components/cards/usage-bar.tsx`: `UsageBar({ usage }: { usage: CardUsage })`.
  - `components/cards/card-form.tsx`: `CardFormButton({ cardId?, initial?, label, variant? })`.

- [ ] **Step 1: Consultas em `lib/cards.ts`**

```ts
import 'server-only'
import { todayISO } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import { cardUsage, type CardUsage } from '@/lib/finance/card'
import { cycleForDate } from '@/lib/finance/invoice'
import type { CardSchedule, InvoiceCycle } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'
import type { CardBrand, CardOption } from '@/lib/validation/card'

export type InvoiceTotals = {
  invoiceId: string
  creditCardId: string
  cycle: InvoiceCycle
  chargesCents: number
  creditsCents: number
  totalCents: number
  paidCents: number
}

export type Card = CardOption & {
  brand: CardBrand
  lastFour: string | null
  limitCents: number
  defaultPaymentAccountId: string | null
}

export type CardWithUsage = Card & { usage: CardUsage; currentCycle: InvoiceCycle; currentTotalCents: number }

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const CARD_COLUMNS = 'id, name, brand, last_four, limit_cents, closing_day, due_day, default_payment_account_id, color, archived'

type CardRow = {
  id: string
  name: string
  brand: string
  last_four: string | null
  limit_cents: number
  closing_day: number
  due_day: number
  default_payment_account_id: string | null
  color: string
  archived: boolean
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand as CardBrand,
    lastFour: row.last_four,
    limitCents: row.limit_cents,
    closingDay: row.closing_day,
    dueDay: row.due_day,
    defaultPaymentAccountId: row.default_payment_account_id,
    color: row.color,
    archived: row.archived,
  }
}

export function toSchedule(card: { closingDay: number; dueDay: number }): CardSchedule {
  return { closingDay: card.closingDay, dueDay: card.dueDay }
}

async function loadInvoiceTotals(supabase: SupabaseServer, cardId?: string): Promise<InvoiceTotals[]> {
  const rows = await fetchAllPages((from, to) => {
    let query = supabase
      .from('v_invoice_totals')
      .select('invoice_id, credit_card_id, closing_month, closing_date, due_date, reference_month, charges_cents, credits_cents, total_cents, paid_cents')
    if (cardId) query = query.eq('credit_card_id', cardId)
    return query.order('closing_month').order('invoice_id').range(from, to)
  })
  return rows.map((row) => ({
    invoiceId: row.invoice_id as string,
    creditCardId: row.credit_card_id as string,
    cycle: {
      closingMonth: row.closing_month as string,
      closingDate: row.closing_date as string,
      dueDate: row.due_date as string,
      referenceMonth: row.reference_month as string,
    },
    chargesCents: Number(row.charges_cents ?? 0),
    creditsCents: Number(row.credits_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    paidCents: Number(row.paid_cents ?? 0),
  }))
}

/** Uso do limite e a fatura do ciclo atual (vazia se ainda não existe). */
function withUsage(card: Card, invoices: InvoiceTotals[], today: string): CardWithUsage {
  const mine = invoices.filter((invoice) => invoice.creditCardId === card.id)
  const computed = cycleForDate(toSchedule(card), today)
  const current = mine.find((invoice) => invoice.cycle.closingMonth === computed.closingMonth)
  return {
    ...card,
    usage: cardUsage(card.limitCents, mine),
    currentCycle: current?.cycle ?? computed,
    currentTotalCents: current?.totalCents ?? 0,
  }
}

export async function listCards({ includeArchived = false }: { includeArchived?: boolean } = {}): Promise<CardWithUsage[]> {
  const supabase = await createClient()
  let query = supabase.from('credit_cards').select(CARD_COLUMNS).order('name')
  if (!includeArchived) query = query.eq('archived', false)
  const [{ data, error }, invoices] = await Promise.all([query, loadInvoiceTotals(supabase)])
  if (error) throw error
  const today = todayISO()
  return data.map((row) => withUsage(toCard(row), invoices, today))
}

export async function getCard(id: string): Promise<{ card: CardWithUsage; invoices: InvoiceTotals[] } | null> {
  const supabase = await createClient()
  const [{ data, error }, invoices] = await Promise.all([
    supabase.from('credit_cards').select(CARD_COLUMNS).eq('id', id).maybeSingle(),
    loadInvoiceTotals(supabase, id),
  ])
  if (error) throw error
  if (!data) return null
  return { card: withUsage(toCard(data), invoices, todayISO()), invoices }
}

/** Cartões para o formulário rápido e filtros (inclui arquivados, para edição de lançamentos antigos). */
export async function listCardOptions(): Promise<CardOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('credit_cards').select('id, name, color, archived, closing_day, due_day').order('name')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    archived: row.archived,
    closingDay: row.closing_day,
    dueDay: row.due_day,
  }))
}
```

- [ ] **Step 2: Ações em `lib/actions/cards.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { scheduleRpcArgs } from '@/lib/card-rpc'
import { todayISO } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import { rescheduleCard } from '@/lib/finance/card'
import type { CardSchedule } from '@/lib/finance/types'
import { getCurrentHousehold } from '@/lib/household'
import { CARD_IN_USE, GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { cardSchema, type CardOutput } from '@/lib/validation/card'
import { uuidSchema } from '@/lib/validation/common'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

function toRow(input: CardOutput) {
  return {
    name: input.name,
    brand: input.brand,
    last_four: input.lastFour,
    limit_cents: input.limitCents,
    closing_day: input.closingDay,
    due_day: input.dueDay,
    default_payment_account_id: input.defaultPaymentAccountId,
    color: input.color,
  }
}

function done() {
  revalidatePath('/', 'layout')
}

export async function createCard(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = cardSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('credit_cards')
    .insert({ household_id: household.id, ...toRow(parsed.data) })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: { id: data.id } }
}

/** Faturas abertas e seus lançamentos → rescheduleCard → apply_card_schedule (lança em caso de erro). */
async function applySchedule(supabase: SupabaseServer, cardId: string, schedule: CardSchedule): Promise<void> {
  const today = todayISO()
  const { data: invoices, error } = await supabase
    .from('card_invoices')
    .select('id, closing_month, closing_date')
    .eq('credit_card_id', cardId)
  if (error) throw error

  const openIds = invoices.filter((invoice) => today < invoice.closing_date).map((invoice) => invoice.id)
  const transactions =
    openIds.length === 0
      ? []
      : await fetchAllPages((from, to) =>
          supabase
            .from('transactions')
            .select('id, invoice_id, date, installment_plan_id, installment_number')
            .in('invoice_id', openIds)
            .in('type', ['income', 'expense'])
            .order('id')
            .range(from, to),
        )

  const planIds = [...new Set(transactions.map((tx) => tx.installment_plan_id).filter((id): id is string => id !== null))]
  let plans: { id: string; purchase_date: string; first_installment_number: number; first_closing_month: string }[] = []
  if (planIds.length > 0) {
    const result = await supabase
      .from('installment_plans')
      .select('id, purchase_date, first_installment_number, first_closing_month')
      .in('id', planIds)
    if (result.error) throw result.error
    plans = result.data
  }

  const change = rescheduleCard(
    schedule,
    invoices.map((invoice) => ({ id: invoice.id, closingMonth: invoice.closing_month, closingDate: invoice.closing_date })),
    transactions.map((tx) => ({
      id: tx.id,
      invoiceId: tx.invoice_id as string,
      date: tx.date,
      installmentPlanId: tx.installment_plan_id,
      installmentNumber: tx.installment_number,
    })),
    plans.map((plan) => ({
      id: plan.id,
      purchaseDate: plan.purchase_date,
      firstInstallmentNumber: plan.first_installment_number,
      firstClosingMonth: plan.first_closing_month,
    })),
    today,
  )
  const { error: rpcError } = await supabase.rpc('apply_card_schedule', scheduleRpcArgs(cardId, schedule, change))
  if (rpcError) throw rpcError
}

export async function updateCard(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = cardSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data: current, error: currentError } = await supabase
    .from('credit_cards')
    .select('closing_day, due_day')
    .eq('id', parsedId.data)
    .maybeSingle()
  if (currentError) return { ok: false, error: translateError(currentError) }
  if (!current) return { ok: false, error: GENERIC_ERROR }

  // Os dias só mudam por apply_card_schedule, junto com as faturas abertas
  const { closing_day: closingDay, due_day: dueDay, ...rest } = toRow(parsed.data)
  const { error } = await supabase.from('credit_cards').update(rest).eq('id', parsedId.data)
  if (error) return { ok: false, error: translateError(error) }

  if (closingDay !== current.closing_day || dueDay !== current.due_day) {
    try {
      await applySchedule(supabase, parsedId.data, { closingDay, dueDay })
    } catch (scheduleError) {
      return { ok: false, error: translateError(scheduleError as { code?: string; message?: string }) }
    }
  }

  done()
  return { ok: true, data: null }
}

export async function setCardArchived(id: unknown, archived: boolean): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('credit_cards').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function deleteCard(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('credit_cards').delete().eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: error.code === '23503' ? CARD_IN_USE : translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
```

- [ ] **Step 3: Barra de uso em `components/cards/usage-bar.tsx`**

```tsx
import { usageLevel, type CardUsage } from '@/lib/finance/card'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'

const BAR: Record<ReturnType<typeof usageLevel>, string> = { ok: 'bg-primary', warning: 'bg-warning', over: 'bg-expense' }

/** Uso do limite com percentual em texto (alerta em 80% e 100% não depende só da cor). */
export function UsageBar({ usage }: { usage: CardUsage }) {
  const level = usageLevel(usage.ratio)
  const percent = Math.round(usage.ratio * 100)
  const width = Math.min(Math.max(percent, 0), 100)
  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Uso do limite"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
      >
        <div className={cn('h-full rounded-full', BAR[level])} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span className={cn(level === 'warning' && 'text-warning', level === 'over' && 'text-expense')}>
          {percent}% usado{level === 'over' ? ' · acima do limite' : level === 'warning' ? ' · perto do limite' : ''}
        </span>
        <span>Disponível {formatBRL(usage.availableCents)}</span>
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Formulário em `components/cards/card-form.tsx`**

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ColorPicker } from '@/components/form/color-picker'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createCard, updateCard } from '@/lib/actions/cards'
import { COLOR_PALETTE } from '@/lib/categories'
import { applyActionErrors } from '@/lib/forms'
import { CARD_BRAND_LABELS, CARD_BRANDS, cardSchema, type CardFormInput, type CardOutput } from '@/lib/validation/card'

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1)

type CardFormProps = { cardId?: string; initial?: CardFormInput; onDone: () => void }

function CardForm({ cardId, initial, onDone }: CardFormProps) {
  const { accounts } = useTransactionFormData()
  const form = useForm<CardFormInput, unknown, CardOutput>({
    resolver: zodResolver(cardSchema),
    defaultValues: initial ?? {
      name: '',
      brand: 'mastercard',
      lastFour: '',
      limitCents: 0,
      closingDay: 1,
      dueDay: 10,
      defaultPaymentAccountId: '',
      color: COLOR_PALETTE[0],
    },
  })
  const { errors, isSubmitting } = form.formState
  const [closingDay, dueDay, defaultAccountId] = useWatch({
    control: form.control,
    name: ['closingDay', 'dueDay', 'defaultPaymentAccountId'],
  })
  const daysChanged = Boolean(cardId && initial) && (closingDay !== initial?.closingDay || dueDay !== initial?.dueDay)
  const accountOptions = accounts.filter((account) => !account.archived || account.id === defaultAccountId)

  const onSubmit = form.handleSubmit(async (values) => {
    const result = cardId ? await updateCard(cardId, values) : await createCard(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(cardId ? 'Cartão atualizado.' : 'Cartão criado.')
    onDone()
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2" noValidate>
      <Field id="card-name" label="Nome" error={errors.name?.message}>
        <Input
          id="card-name"
          placeholder="Ex.: Nubank Paula"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'card-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="card-brand" label="Bandeira" error={errors.brand?.message}>
          <NativeSelect id="card-brand" {...form.register('brand')}>
            {CARD_BRANDS.map((brand) => (
              <option key={brand} value={brand}>
                {CARD_BRAND_LABELS[brand]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="card-last-four" label="Últimos 4 dígitos (opcional)" error={errors.lastFour?.message}>
          <Input
            id="card-last-four"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="1234"
            aria-invalid={Boolean(errors.lastFour)}
            aria-describedby={errors.lastFour ? 'card-last-four-error' : undefined}
            {...form.register('lastFour')}
          />
        </Field>
      </div>
      <Field id="card-limit" label="Limite (R$)" error={errors.limitCents?.message}>
        <Controller
          control={form.control}
          name="limitCents"
          render={({ field }) => <MoneyInput id="card-limit" valueCents={field.value} onChangeCents={field.onChange} />}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="card-closing" label="Dia de fechamento" error={errors.closingDay?.message}>
          <NativeSelect id="card-closing" {...form.register('closingDay', { valueAsNumber: true })}>
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="card-due" label="Dia de vencimento" error={errors.dueDay?.message}>
          <NativeSelect id="card-due" {...form.register('dueDay', { valueAsNumber: true })}>
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {daysChanged ? (
        <p className="-mt-2 text-sm text-warning">Faturas abertas e futuras serão recalculadas; faturas fechadas não mudam.</p>
      ) : null}
      <Field id="card-account" label="Conta padrão de pagamento" error={errors.defaultPaymentAccountId?.message}>
        <NativeSelect id="card-account" {...form.register('defaultPaymentAccountId')}>
          <option value="">Nenhuma</option>
          {accountOptions.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cor</legend>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => <ColorPicker label="Cor do cartão" value={field.value} onChange={field.onChange} />}
        />
      </fieldset>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

type CardFormButtonProps = { cardId?: string; initial?: CardFormInput; label: string; variant?: 'default' | 'outline' }

export function CardFormButton({ cardId, initial, label, variant = 'default' }: CardFormButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {cardId ? <Pencil aria-hidden /> : <Plus aria-hidden />}
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={cardId ? 'Editar cartão' : 'Novo cartão'}>
        {open ? <CardForm cardId={cardId} initial={initial} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
```

- [ ] **Step 5: Tela `/cartoes` em `app/(app)/cartoes/page.tsx`**

Arquivo completo (substitui o placeholder):

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { CardFormButton } from '@/components/cards/card-form'
import { UsageBar } from '@/components/cards/usage-bar'
import { PageHeader } from '@/components/layout/page-header'
import { listCards } from '@/lib/cards'
import { formatISODateBR } from '@/lib/dates'
import { cardUsage } from '@/lib/finance/card'
import { formatBRL } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { cardSubtitle } from '@/lib/validation/card'

export const metadata: Metadata = { title: 'Cartões' }

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ arquivados?: string }> }) {
  const { arquivados } = await searchParams
  const showArchived = arquivados === '1'
  const cards = await listCards({ includeArchived: showArchived })
  const active = cards.filter((card) => !card.archived)
  const limitCents = active.reduce((sum, card) => sum + card.limitCents, 0)
  // Mesma conta de cardUsage, somando os cartões ativos
  const total = cardUsage(limitCents, active.map((card) => ({ totalCents: card.usage.usedCents, paidCents: 0 })))

  return (
    <>
      <PageHeader title="Cartões" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-64 flex-1 space-y-2 sm:max-w-md">
          <p className="text-sm text-muted-foreground">Limite total de {formatBRL(limitCents)}</p>
          <p className="text-3xl font-semibold tabular-nums">{formatBRL(total.usedCents)}</p>
          <UsageBar usage={total} />
        </div>
        <CardFormButton label="Novo cartão" />
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          Cadastre seu primeiro cartão para lançar compras e acompanhar as faturas.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id}>
              <Link
                href={`/cartoes/${card.id}`}
                className={cn(
                  'block space-y-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2',
                  card.archived && 'opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: card.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{card.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{cardSubtitle(card)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">Fatura atual</p>
                    <p className="font-medium tabular-nums">{formatBRL(card.currentTotalCents)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fecha {formatISODateBR(card.currentCycle.closingDate)} · vence {formatISODateBR(card.currentCycle.dueDate)}
                </p>
                <UsageBar usage={card.usage} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm">
        <Link href={showArchived ? '/cartoes' : '/cartoes?arquivados=1'} className="text-muted-foreground underline underline-offset-4">
          {showArchived ? 'Ocultar arquivados' : 'Mostrar arquivados'}
        </Link>
      </p>
    </>
  )
}
```

- [ ] **Step 6: Verificar tipos, lint e a tela**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

Manual: `npm run dev`, abrir http://localhost:3000/cartoes — estado vazio; **Novo cartão** cria um cartão (fechamento 3, vencimento 10, limite R$ 5.000,00) que aparece com "Fatura atual R$ 0,00", datas do ciclo atual e "0% usado". (O link do card leva a uma página 404 até o Task 9.)

- [ ] **Step 7: Commit**

```bash
git add lib/cards.ts lib/actions/cards.ts components/cards "app/(app)/cartoes/page.tsx"
git commit -m "$(cat <<'EOF'
feat(cartoes): lista com uso do limite, cadastro e redistribuição ao mudar os dias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Formulário rápido com cartão, parcelas e escopo de edição

**Files:**
- Create: `lib/actions/card-transactions.ts`
- Modify: `lib/actions/transactions.ts`, `lib/transaction-mappers.ts`, `lib/transaction-mappers.test.ts`, `lib/validation/transaction.ts`, `lib/validation/transaction.test.ts`, `lib/profile.ts`, `components/transactions/form-data-context.tsx`, `components/transactions/transaction-form.tsx`, `components/transactions/transaction-modal.tsx`, `components/transactions/transaction-list.tsx`, `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `buildCardPurchase`, `MAX_INSTALLMENTS`, `splitInstallments` (Task 2); `cycleForDate` (Task 1); `purchaseRpcArgs`, `ensureInvoiceArgs` (Task 5); `cardTransactionSchema`, `toCardPurchaseInput`, `installmentEditSchema`, `INSTALLMENT_SCOPES`, `InstallmentScope`, `isCardForm`, `toCardTransactionInput`, `FormTransactionType`, `deletionSnapshotSchema`, `TRANSACTION_RECORD_COLUMNS`, `PLAN_RECORD_COLUMNS`, `CardOption` (Task 6); `listCardOptions` (Task 7).
- Produces:
  - `lib/actions/card-transactions.ts`: `createCardTransaction(input): ActionResult<{ ids: string[] }>`, `updateCardTransaction(id, input): ActionResult`, `updateInstallments(id, input: InstallmentEditInput): ActionResult`, `deleteInstallments(id, scope): ActionResult<DeletionSnapshot>`.
  - `lib/actions/transactions.ts`: `deleteTransaction(id): ActionResult<DeletionSnapshot>` (só lançamentos sem plano), `restoreTransactions(snapshot): ActionResult` (substitui `restoreTransaction`).
  - `lib/transaction-mappers.ts`: `type InstallmentInfo = { number: number; count: number }`, `installmentInfo(row)`, `type PaymentSourceValues = { accountId: string; creditCardId: string }`, `encodeSource`, `decodeSource`, `pickDefaultSource(accounts, cards, lastAccountId, lastCreditCardId)`; `inputToRow` limpa `credit_card_id`/`invoice_id`; `rowToInput` removido.
  - `TransactionFormData` ganha `cards: CardOption[]` e `lastCreditCardId: string | null`.
  - `TransactionModal` e `TransactionForm` aceitam `installment?: InstallmentInfo`.

- [ ] **Step 1: Mapeadores — testes que falham**

Em `lib/transaction-mappers.test.ts`, troque o import por:

```ts
import {
  applyEffectiveStatus,
  decodeSource,
  encodeSource,
  inputToRow,
  installmentInfo,
  pickDefaultAccountId,
  pickDefaultSource,
  rowToFormValues,
  rowToLedger,
  type TransactionRow,
} from './transaction-mappers'
```

No teste `rowToInput e rowToFormValues`, apague o primeiro `expect(rowToInput(row))...` (com o objeto esperado) e renomeie o teste para `'rowToFormValues'`. Troque o teste `inputToRow zera os campos do outro tipo` por:

```ts
  it('inputToRow zera os campos do outro tipo e os do cartão', () => {
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

    const expense: TransactionInput = {
      type: 'expense',
      description: 'Padaria',
      amountCents: 1250,
      date: '2026-10-04',
      status: 'paid',
      accountId: 'acc-1',
      notes: null,
      categoryId: 'cat-1',
    }
    expect(inputToRow(expense, 'house-1')).toEqual({
      household_id: 'house-1',
      type: 'expense',
      description: 'Padaria',
      amount_cents: 1250,
      date: '2026-10-04',
      status: 'paid',
      account_id: 'acc-1',
      notes: null,
      category_id: 'cat-1',
      destination_account_id: null,
      credit_card_id: null,
      invoice_id: null,
    })
  })
```

Acrescente ao `describe`:

```ts
  it('encodeSource e decodeSource', () => {
    expect(encodeSource({ accountId: 'a', creditCardId: '' })).toBe('account:a')
    expect(encodeSource({ accountId: '', creditCardId: 'c' })).toBe('card:c')
    expect(encodeSource({ accountId: '', creditCardId: '' })).toBe('')
    expect(decodeSource('card:c')).toEqual({ accountId: '', creditCardId: 'c' })
    expect(decodeSource('account:a')).toEqual({ accountId: 'a', creditCardId: '' })
    expect(decodeSource('outra-coisa')).toEqual({ accountId: '', creditCardId: '' })
  })

  it('pickDefaultSource: último cartão ou conta da pessoa, senão a primeira conta, senão o primeiro cartão', () => {
    const accounts = [{ id: 'a' }]
    const cards = [{ id: 'c' }]
    expect(pickDefaultSource(accounts, cards, null, 'c')).toEqual({ accountId: '', creditCardId: 'c' })
    expect(pickDefaultSource(accounts, cards, 'a', 'arquivado')).toEqual({ accountId: 'a', creditCardId: '' })
    expect(pickDefaultSource([], cards, null, null)).toEqual({ accountId: '', creditCardId: 'c' })
    expect(pickDefaultSource([], [], null, null)).toEqual({ accountId: '', creditCardId: '' })
  })

  it('installmentInfo', () => {
    expect(installmentInfo(row)).toBeUndefined()
    expect(
      installmentInfo({ ...row, installment_plan_id: 'plan-1', installment_number: 3, installment_plans: { installments_count: 10 } }),
    ).toEqual({ number: 3, count: 10 })
  })
```

Run: `npm test -- lib/transaction-mappers.test.ts`
Expected: FAIL — exports inexistentes.

- [ ] **Step 2: Implementar os mapeadores**

Em `lib/transaction-mappers.ts`:

1. Apague a função `rowToInput` inteira e troque o import de `@/lib/validation/transaction` por `import type { TransactionFormValues, TransactionInput } from '@/lib/validation/transaction'` (se `TransactionInput` continuar em uso por `inputToRow`, mantenha; ele continua).
2. Troque `TransactionInsertRow` e `inputToRow` por:

```ts
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
  credit_card_id: null
  invoice_id: null
}

/** Linha para insert/update em conta; zera os campos que não pertencem ao tipo e os do cartão. */
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
    credit_card_id: null,
    invoice_id: null,
  }
}
```

(Os campos de cartão vão sempre `null`: editar uma compra à vista no cartão pelo caminho de conta a transforma em lançamento em conta.)

3. Acrescente ao final:

```ts
export type InstallmentInfo = { number: number; count: number }

/** Número e total da parcela, se a linha for parcela de uma compra. */
export function installmentInfo(row: TransactionRow): InstallmentInfo | undefined {
  if (row.installment_plan_id === null || row.installment_number === null) return undefined
  return { number: row.installment_number, count: row.installment_plans?.installments_count ?? row.installment_number }
}

export type PaymentSourceValues = { accountId: string; creditCardId: string }

/** Valor do seletor "Pagar com": "account:<id>" ou "card:<id>". */
export function encodeSource({ accountId, creditCardId }: PaymentSourceValues): string {
  if (creditCardId) return `card:${creditCardId}`
  if (accountId) return `account:${accountId}`
  return ''
}

export function decodeSource(value: string): PaymentSourceValues {
  if (value.startsWith('card:')) return { accountId: '', creditCardId: value.slice('card:'.length) }
  if (value.startsWith('account:')) return { accountId: value.slice('account:'.length), creditCardId: '' }
  return { accountId: '', creditCardId: '' }
}

/** Pré-seleção do "Pagar com": último cartão ou última conta da pessoa (se ativos); senão a primeira conta; senão o primeiro cartão. */
export function pickDefaultSource(
  accounts: { id: string }[],
  cards: { id: string }[],
  lastAccountId: string | null,
  lastCreditCardId: string | null,
): PaymentSourceValues {
  if (lastCreditCardId && cards.some((card) => card.id === lastCreditCardId)) return { accountId: '', creditCardId: lastCreditCardId }
  const accountId = pickDefaultAccountId(accounts, lastAccountId)
  if (accountId) return { accountId, creditCardId: '' }
  return { accountId: '', creditCardId: cards[0]?.id ?? '' }
}
```

Run: `npm test -- lib/transaction-mappers.test.ts`
Expected: PASS.

- [ ] **Step 3: Tirar o snapshot antigo de `lib/validation/transaction.ts`**

Apague as duas últimas linhas (`transactionSnapshotSchema` e `TransactionSnapshot`). Em `lib/validation/transaction.test.ts`, tire `transactionSnapshotSchema` do import e apague o teste `'o snapshot aceita a saída do schema (desfazer exclusão)'` (o snapshot novo é testado em `transaction-record.test.ts`).

- [ ] **Step 4: Ações de lançamento em conta (`lib/actions/transactions.ts`)**

Arquivo completo:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { getCurrentHousehold } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { inputToRow } from '@/lib/transaction-mappers'
import { uuidSchema } from '@/lib/validation/common'
import { transactionSchema } from '@/lib/validation/transaction'
import {
  deletionSnapshotSchema,
  TRANSACTION_RECORD_COLUMNS,
  type DeletionSnapshot,
  type TransactionRecord,
} from '@/lib/validation/transaction-record'

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
  await supabase.from('profiles').update({ last_account_id: parsed.data.accountId, last_credit_card_id: null }).eq('user_id', user.id)

  done()
  return { ok: true, data: { id: data.id } }
}

/** Atualiza um lançamento em conta (também converte uma compra à vista no cartão em lançamento em conta). */
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
    .is('installment_plan_id', null)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

/** Exclui um lançamento sem plano (conta, cartão à vista, estorno ou pagamento de fatura). Parcelas: deleteInstallments. */
export async function deleteTransaction(id: unknown): Promise<ActionResult<DeletionSnapshot>> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', parsedId.data)
    .is('installment_plan_id', null)
    .select(TRANSACTION_RECORD_COLUMNS)
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: { plan: null, rows: data as TransactionRecord[] } }
}

/** "Desfazer": recria o plano (se veio) e as linhas com os mesmos ids. */
export async function restoreTransactions(snapshot: unknown): Promise<ActionResult> {
  const parsed = deletionSnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_transactions', {
    p_plan: parsed.data.plan ? { ...parsed.data.plan, household_id: household.id } : null,
    p_rows: parsed.data.rows.map((row) => ({ ...row, household_id: household.id })),
  })
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: null }
}
```

- [ ] **Step 5: Ações de compra no cartão (`lib/actions/card-transactions.ts`)**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { ensureInvoiceArgs, purchaseRpcArgs } from '@/lib/card-rpc'
import { todayISO } from '@/lib/dates'
import { buildCardPurchase } from '@/lib/finance/installments'
import { cycleForDate } from '@/lib/finance/invoice'
import { defaultStatus } from '@/lib/finance/status'
import type { CardSchedule } from '@/lib/finance/types'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import { cardTransactionSchema, INSTALLMENT_SCOPES, installmentEditSchema, toCardPurchaseInput } from '@/lib/validation/transaction'
import {
  PLAN_RECORD_COLUMNS,
  TRANSACTION_RECORD_COLUMNS,
  type DeletionSnapshot,
  type PlanRecord,
  type TransactionRecord,
} from '@/lib/validation/transaction-record'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const scopeSchema = z.enum(INSTALLMENT_SCOPES)

function done() {
  revalidatePath('/', 'layout')
}

async function loadSchedule(supabase: SupabaseServer, cardId: string): Promise<CardSchedule | null> {
  const { data } = await supabase.from('credit_cards').select('closing_day, due_day').eq('id', cardId).maybeSingle()
  return data ? { closingDay: data.closing_day, dueDay: data.due_day } : null
}

async function loadInstallment(supabase: SupabaseServer, id: string) {
  const { data } = await supabase.from('transactions').select('installment_plan_id, installment_number').eq('id', id).maybeSingle()
  if (!data?.installment_plan_id || data.installment_number === null) return null
  return { planId: data.installment_plan_id, number: data.installment_number }
}

/** Compra à vista, parcelada, em andamento ou estorno no cartão — tudo numa transação (create_card_purchase). */
export async function createCardTransaction(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = cardTransactionSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: translateError({ message: 'NOT_AUTHENTICATED' }) }

  const supabase = await createClient()
  const schedule = await loadSchedule(supabase, parsed.data.creditCardId)
  if (!schedule) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }

  const purchase = buildCardPurchase(schedule, toCardPurchaseInput(parsed.data))
  const fields = {
    type: parsed.data.type,
    description: parsed.data.description,
    categoryId: parsed.data.categoryId,
    notes: parsed.data.notes,
  }
  const { data, error } = await supabase.rpc('create_card_purchase', purchaseRpcArgs(parsed.data.creditCardId, purchase, fields, todayISO()))
  if (error) return { ok: false, error: translateError(error) }

  // Lembra o cartão usado por quem lançou (falha aqui não desfaz a compra)
  await supabase.from('profiles').update({ last_credit_card_id: parsed.data.creditCardId, last_account_id: null }).eq('user_id', user.id)

  done()
  return { ok: true, data: { ids: data ?? [] } }
}

/** Edição completa de um lançamento no cartão sem parcelas (inclui trocar de cartão ou vir de uma conta). */
export async function updateCardTransaction(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = cardTransactionSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  if (parsed.data.installmentsCount !== 1 || parsed.data.currentInstallment !== null) {
    return { ok: false, error: 'Para parcelar, exclua e lance de novo.' }
  }

  const supabase = await createClient()
  if (await loadInstallment(supabase, parsedId.data)) return { ok: false, error: GENERIC_ERROR }
  const schedule = await loadSchedule(supabase, parsed.data.creditCardId)
  if (!schedule) return { ok: false, error: translateError({ message: 'INVALID_CARD' }) }

  const cycle = cycleForDate(schedule, parsed.data.date)
  const { data: invoiceId, error: invoiceError } = await supabase.rpc('ensure_invoice', ensureInvoiceArgs(parsed.data.creditCardId, cycle))
  if (invoiceError) return { ok: false, error: translateError(invoiceError) }

  const { data, error } = await supabase
    .from('transactions')
    .update({
      type: parsed.data.type,
      description: parsed.data.description,
      amount_cents: parsed.data.amountCents,
      date: parsed.data.date,
      status: defaultStatus(parsed.data.date, todayISO()),
      category_id: parsed.data.categoryId,
      notes: parsed.data.notes,
      account_id: null,
      destination_account_id: null,
      credit_card_id: parsed.data.creditCardId,
      invoice_id: invoiceId,
    })
    .eq('id', parsedId.data)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

/** Descrição, categoria e observação desta parcela ou desta e das futuras (spec: decisão "A"). */
export async function updateInstallments(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = installmentEditSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const installment = await loadInstallment(supabase, parsedId.data)
  if (!installment) return { ok: false, error: GENERIC_ERROR }

  const fields = { description: parsed.data.description, category_id: parsed.data.categoryId, notes: parsed.data.notes }
  const base = supabase.from('transactions').update(fields).eq('installment_plan_id', installment.planId)
  const query = parsed.data.scope === 'one' ? base.eq('id', parsedId.data) : base.gte('installment_number', installment.number)
  const { error } = await query.select('id')
  if (error) return { ok: false, error: translateError(error) }

  if (parsed.data.scope === 'future') {
    const { error: planError } = await supabase
      .from('installment_plans')
      .update({ description: parsed.data.description, category_id: parsed.data.categoryId })
      .eq('id', installment.planId)
    if (planError) return { ok: false, error: translateError(planError) }
  }

  done()
  return { ok: true, data: null }
}

/** Exclui esta parcela ou esta e as futuras; o plano vai junto se ficar vazio. Devolve o snapshot do "Desfazer". */
export async function deleteInstallments(id: unknown, scope: unknown): Promise<ActionResult<DeletionSnapshot>> {
  const parsedId = uuidSchema.safeParse(id)
  const parsedScope = scopeSchema.safeParse(scope)
  if (!parsedId.success || !parsedScope.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const installment = await loadInstallment(supabase, parsedId.data)
  if (!installment) return { ok: false, error: GENERIC_ERROR }

  const { data: plan, error: planError } = await supabase
    .from('installment_plans')
    .select(PLAN_RECORD_COLUMNS)
    .eq('id', installment.planId)
    .single()
  if (planError) return { ok: false, error: translateError(planError) }

  const base = supabase.from('transactions').delete().eq('installment_plan_id', installment.planId)
  const query = parsedScope.data === 'one' ? base.eq('id', parsedId.data) : base.gte('installment_number', installment.number)
  const { data: rows, error } = await query.select(TRANSACTION_RECORD_COLUMNS)
  if (error) return { ok: false, error: translateError(error) }
  if (rows.length === 0) return { ok: false, error: GENERIC_ERROR }

  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('installment_plan_id', installment.planId)
  let removedPlan: PlanRecord | null = null
  if (count === 0) {
    const { error: removeError } = await supabase.from('installment_plans').delete().eq('id', installment.planId)
    if (!removeError) removedPlan = plan as PlanRecord
  }

  done()
  return { ok: true, data: { plan: removedPlan, rows: rows as TransactionRecord[] } }
}
```

- [ ] **Step 5b: Rodar os testes e os tipos das ações**

Run: `npm test && npx tsc --noEmit`
Expected: os testes passam; `tsc` aponta erro só em `components/transactions/transaction-form.tsx`, que ainda importa `restoreTransaction` (removida). O Step 7 reescreve o formulário e corrige.

- [ ] **Step 6: Perfil, contexto e layout**

`lib/profile.ts`: troque o select por `.select('user_id, display_name, last_account_id, last_credit_card_id')`.

`components/transactions/form-data-context.tsx`: acrescente o import `import type { CardOption } from '@/lib/validation/card'` e troque o tipo por:

```ts
export type TransactionFormData = {
  accounts: AccountOption[]
  cards: CardOption[]
  categories: Category[]
  topCategoryIds: Record<CategoryKind, string[]>
  lastAccountId: string | null
  lastCreditCardId: string | null
}
```

`app/(app)/layout.tsx`: acrescente `import { listCardOptions } from '@/lib/cards'`, inclua `listCardOptions()` no `Promise.all` (desestruture como `cards`, depois de `accounts`) e, no objeto `formData`, acrescente `cards,` depois de `accounts: ...` e `lastCreditCardId: profile?.last_credit_card_id ?? null,` depois de `lastAccountId`.

- [ ] **Step 7: Reescrever `components/transactions/transaction-form.tsx`**

Arquivo completo:

```tsx
'use client'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/categories/category-icon'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { Segmented } from '@/components/form/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ActionResult } from '@/lib/action-result'
import { createCardTransaction, deleteInstallments, updateCardTransaction, updateInstallments } from '@/lib/actions/card-transactions'
import { createTransaction, deleteTransaction, restoreTransactions, updateTransaction } from '@/lib/actions/transactions'
import { activeCategories, buildCategoryTree, chipCategories, type Category } from '@/lib/categories'
import { addDaysISO, formatISODateBR, formatYearMonthLabel, todayISO, yearMonthOfISO } from '@/lib/dates'
import { MAX_INSTALLMENTS, splitInstallments } from '@/lib/finance/installments'
import { cycleForDate } from '@/lib/finance/invoice'
import { formatBRL } from '@/lib/finance/money'
import { defaultStatus } from '@/lib/finance/status'
import type { TransactionStatus } from '@/lib/finance/types'
import { applyActionErrors } from '@/lib/forms'
import { decodeSource, encodeSource, pickDefaultAccountId, pickDefaultSource, type InstallmentInfo } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'
import {
  isCardForm,
  toCardTransactionInput,
  toTransactionInput,
  transactionFormResolver,
  type FormTransactionType,
  type InstallmentScope,
  type TransactionFormValues,
} from '@/lib/validation/transaction'
import type { DeletionSnapshot } from '@/lib/validation/transaction-record'
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

const NUMBERS = Array.from({ length: MAX_INSTALLMENTS }, (_, index) => index + 1)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

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

type TransactionFormProps = {
  transactionId?: string
  initial?: TransactionFormValues
  /** Parcela de uma compra: valor, cartão, data e parcelas ficam travados. */
  installment?: InstallmentInfo
  onDone: () => void
}

export function TransactionForm({ transactionId, initial, installment, onDone }: TransactionFormProps) {
  const data = useTransactionFormData()
  const [today] = useState(() => todayISO())
  const activeAccounts = data.accounts.filter((account) => !account.archived)
  const activeCards = data.cards.filter((card) => !card.archived)
  const form = useForm<TransactionFormValues>({
    resolver: transactionFormResolver,
    defaultValues: initial ?? {
      type: 'expense',
      amountCents: 0,
      description: '',
      categoryId: '',
      ...pickDefaultSource(activeAccounts, activeCards, data.lastAccountId, data.lastCreditCardId),
      destinationAccountId: '',
      date: today,
      status: 'paid',
      notes: '',
      installmentsCount: 1,
      inProgress: false,
      currentInstallment: 1,
    },
  })
  const [statusTouched, setStatusTouched] = useState(Boolean(initial))
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showNotes, setShowNotes] = useState(Boolean(initial?.notes))
  const [scopeAction, setScopeAction] = useState<'save' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const { errors, isSubmitting } = form.formState
  const locked = Boolean(installment)

  const [type, date, status, accountId, creditCardId, destinationAccountId, categoryId, amountCents, installmentsCount, inProgress] =
    useWatch({
      control: form.control,
      name: [
        'type',
        'date',
        'status',
        'accountId',
        'creditCardId',
        'destinationAccountId',
        'categoryId',
        'amountCents',
        'installmentsCount',
        'inProgress',
      ],
    })

  const kind = type === 'income' ? 'income' : 'expense'
  const candidates = activeCategories(data.categories).filter((category) => category.kind === kind)
  const chips = chipCategories(candidates, data.topCategoryIds[kind], 6)
  const selectedCategory = data.categories.find((category) => category.id === categoryId)
  const visibleChips =
    selectedCategory && !chips.some((chip) => chip.id === selectedCategory.id) ? [selectedCategory, ...chips] : chips
  const tree = buildCategoryTree(candidates)

  const isCard = isCardForm({ type, creditCardId })
  const card = data.cards.find((item) => item.id === creditCardId)
  const accountOptions = (selectedId: string) => data.accounts.filter((account) => !account.archived || account.id === selectedId)
  const cardOptions = data.cards.filter((item) => !item.archived || item.id === creditCardId)
  const touchedAccounts = type === 'transfer' ? [accountId, destinationAccountId] : [accountId]
  const beforeInitialBalance =
    !isCard &&
    touchedAccounts.some((id) => {
      const account = data.accounts.find((a) => a.id === id)
      return account ? date < account.initialBalanceDate : false
    })
  const cycle = isCard && card && !locked && ISO_DATE.test(date) ? cycleForDate(card, date) : null
  const canSplit = isCard && type === 'expense' && !transactionId
  const firstInstallment =
    canSplit && !inProgress && installmentsCount > 1 && amountCents >= installmentsCount
      ? splitInstallments(amountCents, installmentsCount)[0]
      : null

  const revalidate = { shouldValidate: form.formState.isSubmitted }

  function changeType(value: FormTransactionType) {
    form.setValue('type', value)
    form.setValue('categoryId', '', revalidate)
    if (value === 'transfer' && form.getValues('creditCardId')) {
      form.setValue('creditCardId', '')
      form.setValue('accountId', pickDefaultAccountId(activeAccounts, data.lastAccountId) ?? '')
    }
    if (value !== 'expense') {
      form.setValue('installmentsCount', 1)
      form.setValue('inProgress', false)
    }
    setShowAllCategories(false)
  }

  function changeSource(value: string) {
    const source = decodeSource(value)
    form.setValue('accountId', source.accountId, revalidate)
    form.setValue('creditCardId', source.creditCardId, revalidate)
    if (!source.creditCardId) {
      form.setValue('installmentsCount', 1)
      form.setValue('inProgress', false)
    }
  }

  function toggleInProgress() {
    const next = !inProgress
    form.setValue('inProgress', next)
    form.setValue('currentInstallment', 1)
    if (next && form.getValues('installmentsCount') < 2) form.setValue('installmentsCount', 2)
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

  function toastDeleted(snapshot: DeletionSnapshot, message: string) {
    toast(message, {
      action: {
        label: 'Desfazer',
        onClick: async () => {
          const restored = await restoreTransactions(snapshot)
          if (restored.ok) toast.success('Lançamento restaurado.')
          else toast.error(restored.error)
        },
      },
    })
  }

  const onSubmit = form.handleSubmit(async (values) => {
    // Parcela: primeiro pergunta onde aplicar
    if (locked) {
      setScopeAction('save')
      return
    }
    let result: ActionResult<unknown>
    if (isCardForm(values)) {
      const input = toCardTransactionInput(values)
      result = transactionId ? await updateCardTransaction(transactionId, input) : await createCardTransaction(input)
    } else {
      const input = toTransactionInput(values)
      result = transactionId ? await updateTransaction(transactionId, input) : await createTransaction(input)
    }
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(transactionId ? 'Lançamento atualizado.' : 'Lançamento salvo.')
    onDone()
  })

  async function onDelete() {
    if (!transactionId) return
    if (locked) {
      setScopeAction('delete')
      return
    }
    const result = await deleteTransaction(transactionId)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toastDeleted(result.data, 'Lançamento excluído.')
    onDone()
  }

  async function applyScope(scope: InstallmentScope) {
    if (!transactionId || !scopeAction) return
    setBusy(true)
    try {
      if (scopeAction === 'save') {
        const values = form.getValues()
        const result = await updateInstallments(transactionId, {
          scope,
          description: values.description,
          categoryId: values.categoryId,
          notes: values.notes,
        })
        if (!result.ok) {
          applyActionErrors(form, result)
          return
        }
        toast.success(scope === 'one' ? 'Parcela atualizada.' : 'Parcelas atualizadas.')
      } else {
        const result = await deleteInstallments(transactionId, scope)
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toastDeleted(result.data, scope === 'one' ? 'Parcela excluída.' : 'Parcelas excluídas.')
      }
      onDone()
    } finally {
      setBusy(false)
      setScopeAction(null)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-2" noValidate>
      {locked ? null : <Segmented label="Tipo de lançamento" value={type} options={TYPE_OPTIONS} onChange={changeType} />}

      <div>
        <label htmlFor="tx-amount" className="text-sm text-muted-foreground">
          {canSplit && inProgress ? 'Valor da parcela' : 'Valor'}
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
                disabled={locked}
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

      {type === 'transfer' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="tx-account" label="De" error={errors.accountId?.message}>
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
        </div>
      ) : (
        <Field id="tx-source" label="Pagar com" error={errors.accountId?.message ?? errors.creditCardId?.message}>
          <NativeSelect
            id="tx-source"
            value={encodeSource({ accountId, creditCardId })}
            onChange={(event) => changeSource(event.target.value)}
            disabled={locked}
            aria-invalid={Boolean(errors.accountId ?? errors.creditCardId)}
            aria-describedby={errors.accountId || errors.creditCardId ? 'tx-source-error' : undefined}
          >
            <option value="" disabled>
              Escolha…
            </option>
            <optgroup label="Contas">
              {accountOptions(accountId).map((account) => (
                <option key={account.id} value={`account:${account.id}`}>
                  {account.name}
                </option>
              ))}
            </optgroup>
            {cardOptions.length > 0 ? (
              <optgroup label="Cartões">
                {cardOptions.map((item) => (
                  <option key={item.id} value={`card:${item.id}`}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </NativeSelect>
        </Field>
      )}
      {isCard && type === 'income' ? (
        <p className="-mt-3 text-sm text-muted-foreground">Estorno / crédito no cartão: abate o total da fatura.</p>
      ) : null}

      {canSplit ? (
        <div className="space-y-2">
          {inProgress ? (
            <div className="grid grid-cols-2 gap-4">
              <Field id="tx-current" label="Parcela atual" error={errors.currentInstallment?.message}>
                <NativeSelect id="tx-current" {...form.register('currentInstallment', { valueAsNumber: true })}>
                  {NUMBERS.slice(0, installmentsCount).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="tx-count" label="De" error={errors.installmentsCount?.message}>
                <NativeSelect id="tx-count" {...form.register('installmentsCount', { valueAsNumber: true })}>
                  {NUMBERS.slice(1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          ) : (
            <Field id="tx-count" label="Parcelas" error={errors.installmentsCount?.message}>
              <NativeSelect id="tx-count" {...form.register('installmentsCount', { valueAsNumber: true })}>
                {NUMBERS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'À vista (1x)' : `${n}x`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {firstInstallment !== null ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {installmentsCount}x de {formatBRL(firstInstallment)}
            </p>
          ) : null}
          <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={toggleInProgress}>
            {inProgress ? 'Compra nova (informar o valor total)' : 'Compra já em andamento?'}
          </button>
        </div>
      ) : null}
      {installment ? (
        <p className="text-sm text-muted-foreground">
          Parcela {installment.number} de {installment.count}. Para mudar valor, parcelas ou cartão, exclua e lance de novo.
        </p>
      ) : null}

      <Field id="tx-date" label={canSplit && inProgress ? 'Data da parcela atual' : 'Data'} error={errors.date?.message}>
        <div className="flex gap-2">
          <Input
            id="tx-date"
            type="date"
            value={date}
            disabled={locked}
            onChange={(event) => changeDate(event.target.value)}
            aria-invalid={Boolean(errors.date)}
            className="flex-1"
          />
          <Button type="button" variant="outline" disabled={locked} onClick={() => changeDate(today)}>
            Hoje
          </Button>
          <Button type="button" variant="outline" disabled={locked} onClick={() => changeDate(addDaysISO(today, -1))}>
            Ontem
          </Button>
        </div>
      </Field>
      {cycle ? (
        <p className="-mt-3 text-sm text-muted-foreground">
          Cai na fatura de {formatYearMonthLabel(yearMonthOfISO(cycle.referenceMonth)).toLowerCase()} (fecha{' '}
          {formatISODateBR(cycle.closingDate).slice(0, 5)}, vence {formatISODateBR(cycle.dueDate).slice(0, 5)}).
        </p>
      ) : null}
      {beforeInitialBalance ? (
        <p className="-mt-3 text-sm text-warning">Este lançamento não afeta o saldo atual desta conta (data anterior ao saldo inicial).</p>
      ) : null}

      {isCard ? null : <Segmented label="Status" value={status} options={STATUS_OPTIONS} onChange={changeStatus} />}

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

      {scopeAction ? (
        <div className="space-y-2 rounded-lg border border-border p-3" role="group" aria-label="Escolha o alcance">
          <p className="text-sm font-medium">{scopeAction === 'save' ? 'Aplicar a alteração em:' : 'Excluir:'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => applyScope('one')}>
              Só esta parcela
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => applyScope('future')}>
              Esta e as futuras
            </Button>
          </div>
          <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => setScopeAction(null)}>
            Cancelar
          </Button>
        </div>
      ) : (
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
      )}
    </form>
  )
}
```

- [ ] **Step 8: Modal e lista**

`components/transactions/transaction-modal.tsx`, arquivo completo:

```tsx
'use client'

import Link from 'next/link'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import type { InstallmentInfo } from '@/lib/transaction-mappers'
import type { TransactionFormValues } from '@/lib/validation/transaction'
import { useTransactionFormData } from './form-data-context'
import { TransactionForm } from './transaction-form'

type TransactionModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionId?: string
  initial?: TransactionFormValues
  installment?: InstallmentInfo
}

export function TransactionModal({ open, onOpenChange, transactionId, initial, installment }: TransactionModalProps) {
  const data = useTransactionFormData()
  const hasSources = data.accounts.some((account) => !account.archived) || data.cards.some((card) => !card.archived)
  const title = installment ? 'Editar parcela' : transactionId ? 'Editar lançamento' : 'Novo lançamento'

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title}>
      {!open ? null : hasSources || transactionId ? (
        <TransactionForm
          key={transactionId ?? 'new'}
          transactionId={transactionId}
          initial={initial}
          installment={installment}
          onDone={() => onOpenChange(false)}
        />
      ) : (
        <div className="space-y-4 pb-2 text-center">
          <p className="text-muted-foreground">Cadastre sua primeira conta ou cartão para começar a lançar.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild>
              <Link href="/contas" onClick={() => onOpenChange(false)}>
                Ir para Contas
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cartoes" onClick={() => onOpenChange(false)}>
                Ir para Cartões
              </Link>
            </Button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  )
}
```

Em `components/transactions/transaction-list.tsx`, troque o import de mapeadores por `import { installmentInfo, rowToFormValues, type TransactionRow } from '@/lib/transaction-mappers'` e, no `<TransactionModal ...>`, acrescente a prop:

```tsx
        installment={editing ? installmentInfo(editing) : undefined}
```

- [ ] **Step 9: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS, sem erros.

Manual (`npm run dev`, celular 360px no DevTools):
1. "+" → "Pagar com" mostra os grupos Contas e Cartões; escolher um cartão some o Status e mostra "Parcelas" e "Cai na fatura de …".
2. Despesa R$ 100,00 em 3x no cartão (fechamento 3, vencimento 10) com data 02/10 → salvar → em `/lancamentos` aparecem 3 linhas (out, nov, dez) de 33,34 / 33,33 / 33,33 (o sufixo "(k/N)" chega no Task 9).
3. "Compra já em andamento?" com R$ 150,00, parcela 3 de 10 → cria 8 linhas.
4. Abrir uma parcela: valor, "Pagar com" e data travados; mudar a descrição → "Esta e as futuras" muda as seguintes; "Excluir" → "Só esta parcela" → toast com **Desfazer** restaura.
5. Receita no cartão mostra "Estorno / crédito no cartão" e não mostra Parcelas.
6. Abrir o "+" de novo: o cartão usado fica pré-selecionado.

- [ ] **Step 10: Commit**

```bash
git add lib components/transactions "app/(app)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(lancamentos): compras no cartão à vista, parceladas e em andamento no formulário rápido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Tela da fatura e pagamento de fatura

**Files:**
- Create: `lib/invoice-labels.ts`, `lib/invoice-labels.test.ts`, `lib/actions/invoices.ts`, `components/cards/card-actions.tsx`, `components/cards/invoice-selector.tsx`, `components/cards/invoice-status-badge.tsx`, `components/cards/payment-form.tsx`, `components/cards/invoice-transactions.tsx`, `app/(app)/cartoes/[id]/page.tsx`
- Modify: `lib/transactions.ts`, `components/transactions/transaction-item.tsx`, `components/transactions/transaction-list.tsx`

**Interfaces:**
- Consumes: `getCard`, `toSchedule`, `CardWithUsage` (Task 7); `CardFormButton`, `UsageBar` (Task 7); `cycleForClosingMonth`, `invoiceStatus`, `INVOICE_STATUS_LABELS`, `InvoiceStatus`, `shiftClosingMonth` (Task 1); `installmentLabel` (Task 2); `invoicePaymentSchema`, `cardSubtitle`, `CardFormInput` (Task 6); `deleteTransaction`, `restoreTransactions`, `TransactionModal`, `installmentInfo`, `rowToFormValues` (Task 8); `applyEffectiveStatus` (Task 5).
- Produces:
  - `lib/invoice-labels.ts`: `paymentDescription(cardName, referenceMonth)`, `invoiceTitle(referenceMonth)`, `parseInvoiceParam(value): string | null` (`?fatura=AAAA-MM` = mês de **fechamento**), `invoiceHref(cardId, closingMonth)`.
  - `lib/actions/invoices.ts`: `payInvoice(invoiceId, input): ActionResult<{ id: string }>`, `updateInvoicePayment(id, input): ActionResult`.
  - `lib/transactions.ts`: `listInvoiceTransactions(invoiceId): Promise<TransactionRow[]>`.
  - `TransactionItem` passa a receber `sourceLabel` (antes `accountLabel`) e mostra "(k/N)", ícone de cartão e valor sem sinal para pagamento de fatura.

**Nota:** a URL da fatura usa `?fatura=AAAA-MM` com o **mês de fechamento** (identidade do ciclo), não `?mes=` com o mês de referência como dizia a spec — dois ciclos podem ter o mesmo mês de referência quando o vencimento muda. O título continua "Fatura de <mês do vencimento>". A spec já está atualizada.

- [ ] **Step 1: Rótulos — teste que falha**

Crie `lib/invoice-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { invoiceHref, invoiceTitle, parseInvoiceParam, paymentDescription } from './invoice-labels'

describe('rótulos da fatura', () => {
  it('descrição do pagamento', () => {
    expect(paymentDescription('Nubank', '2026-11-01')).toBe('Pagamento fatura Nubank (nov/2026)')
    expect(paymentDescription('Inter', '2027-03-01')).toBe('Pagamento fatura Inter (mar/2027)')
  })

  it('título pelo mês do vencimento', () => {
    expect(invoiceTitle('2026-11-01')).toBe('Fatura de Novembro 2026')
  })

  it('?fatura= aceita só AAAA-MM válido', () => {
    expect(parseInvoiceParam('2026-11')).toBe('2026-11-01')
    expect(parseInvoiceParam(['2026-12', 'x'])).toBe('2026-12-01')
    expect(parseInvoiceParam('xyz')).toBeNull()
    expect(parseInvoiceParam('2026-13')).toBeNull()
    expect(parseInvoiceParam(undefined)).toBeNull()
  })

  it('link da fatura', () => {
    expect(invoiceHref('card-1', '2026-11-01')).toBe('/cartoes/card-1?fatura=2026-11')
  })
})
```

Run: `npm test -- lib/invoice-labels.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 2: Implementar `lib/invoice-labels.ts`**

```ts
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
```

Run: `npm test -- lib/invoice-labels.test.ts`
Expected: PASS.

- [ ] **Step 3: Ações de pagamento em `lib/actions/invoices.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { todayISO } from '@/lib/dates'
import { defaultStatus } from '@/lib/finance/status'
import { getCurrentHousehold } from '@/lib/household'
import { paymentDescription } from '@/lib/invoice-labels'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import { invoicePaymentSchema } from '@/lib/validation/invoice-payment'

function done() {
  revalidatePath('/', 'layout')
}

/** Pagamento total ou parcial da fatura a partir de uma conta: sai do saldo, mas não é despesa (PRD 8.5). */
export async function payInvoice(invoiceId: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsedId = uuidSchema.safeParse(invoiceId)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = invoicePaymentSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data: invoice, error: invoiceError } = await supabase
    .from('card_invoices')
    .select('id, credit_card_id, reference_month, credit_cards(name)')
    .eq('id', parsedId.data)
    .maybeSingle()
  if (invoiceError) return { ok: false, error: translateError(invoiceError) }
  if (!invoice) return { ok: false, error: GENERIC_ERROR }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      household_id: household.id,
      type: 'invoice_payment',
      description: paymentDescription(invoice.credit_cards?.name ?? 'cartão', invoice.reference_month),
      amount_cents: parsed.data.amountCents,
      date: parsed.data.date,
      status: defaultStatus(parsed.data.date, todayISO()),
      account_id: parsed.data.accountId,
      credit_card_id: invoice.credit_card_id,
      invoice_id: invoice.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }

  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateInvoicePayment(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = invoicePaymentSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .update({
      account_id: parsed.data.accountId,
      amount_cents: parsed.data.amountCents,
      date: parsed.data.date,
      status: defaultStatus(parsed.data.date, todayISO()),
    })
    .eq('id', parsedId.data)
    .eq('type', 'invoice_payment')
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
```

- [ ] **Step 4: Lançamentos da fatura em `lib/transactions.ts`**

Acrescente depois de `listAccountTransactions`:

```ts
/** Lançamentos de uma fatura (compras, parcelas, estornos e pagamentos), em ordem cronológica. */
export async function listInvoiceTransactions(invoiceId: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('invoice_id', invoiceId)
      .order('date')
      .order('created_at')
      .order('id')
      .range(from, to),
  )
  return rows as TransactionRow[]
}
```

- [ ] **Step 5: Item de lançamento com parcela e pagamento de fatura**

`components/transactions/transaction-item.tsx`, arquivo completo:

```tsx
import { ArrowLeftRight, CreditCard } from 'lucide-react'
import { CategoryIcon } from '@/components/categories/category-icon'
import type { Category } from '@/lib/categories'
import { installmentLabel } from '@/lib/finance/installments'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import type { TransactionRow } from '@/lib/transaction-mappers'
import { cn } from '@/lib/utils'

type TransactionItemProps = {
  row: TransactionRow
  category?: Category
  /** Conta, cartão, "Origem → Destino" ou a data, conforme a tela. */
  sourceLabel: string
  onClick: () => void
}

export function TransactionItem({ row, category, sourceLabel, onClick }: TransactionItemProps) {
  const isPayment = row.type === 'invoice_payment'
  // Transferência e pagamento de fatura não são receita nem despesa: sem sinal
  const neutral = row.type === 'transfer' || isPayment
  const amount = neutral ? formatBRL(row.amount_cents) : formatSignedBRL(row.type === 'income' ? row.amount_cents : -row.amount_cents)
  const title = installmentLabel(row.description, row.installment_number, row.installment_plans?.installments_count ?? null)
  const subtitle = [neutral ? null : category?.name, sourceLabel, row.status === 'pending' ? 'previsto' : null]
    .filter(Boolean)
    .join(' · ')
  const NeutralIcon = isPayment ? CreditCard : ArrowLeftRight

  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2">
      {neutral ? (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
          <NeutralIcon className="size-4" />
        </span>
      ) : (
        <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span
        className={cn(
          'shrink-0 text-right font-medium tabular-nums',
          neutral ? 'text-foreground' : row.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {neutral ? <span className="sr-only">{isPayment ? 'Pagamento de fatura de ' : 'Transferência de '}</span> : null}
        {amount}
      </span>
    </button>
  )
}
```

Em `components/transactions/transaction-list.tsx`, troque `accountLabel={labelFor(row)}` por `sourceLabel={labelFor(row)}`.

- [ ] **Step 6: Componentes da fatura**

`components/cards/card-actions.tsx`:

```tsx
'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteCard, setCardArchived } from '@/lib/actions/cards'
import type { CardFormInput } from '@/lib/validation/card'
import { CardFormButton } from './card-form'

type CardActionsProps = { id: string; archived: boolean; initial: CardFormInput }

export function CardActions({ id, archived, initial }: CardActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggleArchive() {
    startTransition(async () => {
      const result = await setCardArchived(id, !archived)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(archived ? 'Cartão reativado.' : 'Cartão arquivado.')
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm('Excluir este cartão? Só é possível se ele não tiver lançamentos.')) return
    startTransition(async () => {
      const result = await deleteCard(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Cartão excluído.')
      router.push('/cartoes')
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <CardFormButton cardId={id} initial={initial} label="Editar" variant="outline" />
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

`components/cards/invoice-selector.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { shiftClosingMonth } from '@/lib/finance/invoice'
import { invoiceHref, invoiceTitle } from '@/lib/invoice-labels'

type InvoiceSelectorProps = { cardId: string; closingMonth: string; referenceMonth: string }

/** "‹ Fatura de Novembro 2026 ›": navega de ciclo em ciclo (?fatura= é o mês de fechamento). */
export function InvoiceSelector({ cardId, closingMonth, referenceMonth }: InvoiceSelectorProps) {
  return (
    <nav
      aria-label="Selecionar fatura"
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-1 sm:justify-start"
    >
      <Button asChild variant="ghost" size="icon">
        <Link href={invoiceHref(cardId, shiftClosingMonth(closingMonth, -1))} aria-label="Fatura anterior">
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <span className="min-w-44 text-center font-medium">{invoiceTitle(referenceMonth)}</span>
      <Button asChild variant="ghost" size="icon">
        <Link href={invoiceHref(cardId, shiftClosingMonth(closingMonth, 1))} aria-label="Próxima fatura">
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </nav>
  )
}
```

`components/cards/invoice-status-badge.tsx`:

```tsx
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@/lib/finance/invoice'
import { cn } from '@/lib/utils'

const STYLES: Record<InvoiceStatus, string> = {
  open: 'border-primary/40 text-primary',
  closed: 'border-border text-foreground',
  paid: 'border-income/40 text-income',
  overdue: 'border-expense bg-expense/15 font-semibold text-expense',
}

/** Status sempre em texto; a cor só reforça. */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs', STYLES[status])}>{INVOICE_STATUS_LABELS[status]}</span>
}
```

`components/cards/payment-form.tsx`:

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Wallet } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { payInvoice, updateInvoicePayment } from '@/lib/actions/invoices'
import { deleteTransaction, restoreTransactions } from '@/lib/actions/transactions'
import { todayISO } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import { applyActionErrors } from '@/lib/forms'
import { invoicePaymentSchema, type InvoicePaymentInput } from '@/lib/validation/invoice-payment'

export type ExistingPayment = InvoicePaymentInput & { id: string }

type PaymentFormProps = {
  invoiceId: string
  remainingCents: number
  defaultAccountId: string | null
  payment?: ExistingPayment
  onDone: () => void
}

function PaymentForm({ invoiceId, remainingCents, defaultAccountId, payment, onDone }: PaymentFormProps) {
  const { accounts } = useTransactionFormData()
  const active = accounts.filter((account) => !account.archived)
  const fallbackAccountId =
    defaultAccountId && active.some((account) => account.id === defaultAccountId) ? defaultAccountId : (active[0]?.id ?? '')
  const form = useForm<InvoicePaymentInput, unknown, InvoicePaymentInput>({
    resolver: zodResolver(invoicePaymentSchema),
    defaultValues: payment
      ? { accountId: payment.accountId, amountCents: payment.amountCents, date: payment.date }
      : { accountId: fallbackAccountId, amountCents: remainingCents, date: todayISO() },
  })
  const { errors, isSubmitting } = form.formState
  const [accountId, amountCents] = useWatch({ control: form.control, name: ['accountId', 'amountCents'] })
  // Na edição, este pagamento já está descontado do que falta
  const limit = remainingCents + (payment?.amountCents ?? 0)
  const options = accounts.filter((account) => !account.archived || account.id === accountId)

  const onSubmit = form.handleSubmit(async (values) => {
    const result = payment ? await updateInvoicePayment(payment.id, values) : await payInvoice(invoiceId, values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(payment ? 'Pagamento atualizado.' : 'Pagamento registrado.')
    onDone()
  })

  async function onDelete() {
    if (!payment) return
    const result = await deleteTransaction(payment.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const snapshot = result.data
    toast('Pagamento excluído.', {
      action: {
        label: 'Desfazer',
        onClick: async () => {
          const restored = await restoreTransactions(snapshot)
          if (restored.ok) toast.success('Pagamento restaurado.')
          else toast.error(restored.error)
        },
      },
    })
    onDone()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2" noValidate>
      <Field id="payment-account" label="Conta" error={errors.accountId?.message}>
        <NativeSelect
          id="payment-account"
          aria-invalid={Boolean(errors.accountId)}
          aria-describedby={errors.accountId ? 'payment-account-error' : undefined}
          {...form.register('accountId')}
        >
          <option value="" disabled>
            Escolha…
          </option>
          {options.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="payment-amount" label="Valor (R$)" error={errors.amountCents?.message}>
        <Controller
          control={form.control}
          name="amountCents"
          render={({ field }) => (
            <MoneyInput
              id="payment-amount"
              valueCents={field.value}
              onChangeCents={field.onChange}
              aria-invalid={Boolean(errors.amountCents)}
              aria-describedby={errors.amountCents ? 'payment-amount-error' : undefined}
            />
          )}
        />
      </Field>
      {amountCents > limit ? (
        <p className="-mt-2 text-sm text-warning">Acima do que falta ({formatBRL(limit)}). O excedente fica como crédito na fatura.</p>
      ) : null}
      <Field id="payment-date" label="Data" error={errors.date?.message}>
        <Input id="payment-date" type="date" aria-invalid={Boolean(errors.date)} {...form.register('date')} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : 'Salvar'}
        </Button>
        {payment ? (
          <Button type="button" variant="outline" className="text-expense" onClick={onDelete} disabled={isSubmitting}>
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  )
}

type PaymentModalProps = Omit<PaymentFormProps, 'onDone'> & { open: boolean; onOpenChange: (open: boolean) => void }

export function PaymentModal({ open, onOpenChange, payment, ...props }: PaymentModalProps) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={payment ? 'Editar pagamento' : 'Pagar fatura'}>
      {open ? <PaymentForm key={payment?.id ?? 'new'} payment={payment} {...props} onDone={() => onOpenChange(false)} /> : null}
    </ResponsiveModal>
  )
}

type PayInvoiceButtonProps = { invoiceId: string | null; remainingCents: number; defaultAccountId: string | null }

/** Sem fatura salva (nenhum lançamento no ciclo) não há o que pagar. */
export function PayInvoiceButton({ invoiceId, remainingCents, defaultAccountId }: PayInvoiceButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="w-full sm:w-auto" disabled={!invoiceId} onClick={() => setOpen(true)}>
        <Wallet aria-hidden />
        Pagar fatura
      </Button>
      {invoiceId ? (
        <PaymentModal
          open={open}
          onOpenChange={setOpen}
          invoiceId={invoiceId}
          remainingCents={remainingCents}
          defaultAccountId={defaultAccountId}
        />
      ) : null}
    </>
  )
}
```

`components/cards/invoice-transactions.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { TransactionItem } from '@/components/transactions/transaction-item'
import { TransactionModal } from '@/components/transactions/transaction-modal'
import type { Category } from '@/lib/categories'
import { formatISODateBR } from '@/lib/dates'
import { installmentInfo, rowToFormValues, type TransactionRow } from '@/lib/transaction-mappers'
import { PaymentModal } from './payment-form'

type InvoiceTransactionsProps = {
  purchases: TransactionRow[]
  payments: TransactionRow[]
  categories: Category[]
  accounts: { id: string; name: string }[]
  invoiceId: string | null
  remainingCents: number
  defaultAccountId: string | null
}

export function InvoiceTransactions({
  purchases,
  payments,
  categories,
  accounts,
  invoiceId,
  remainingCents,
  defaultAccountId,
}: InvoiceTransactionsProps) {
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [editingPayment, setEditingPayment] = useState<TransactionRow | null>(null)
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Compras</h2>
        {purchases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
            Nenhuma compra nesta fatura.
          </div>
        ) : (
          <ul className="rounded-xl border border-border bg-surface p-2">
            {purchases.map((row) => (
              <li key={row.id}>
                <TransactionItem
                  row={row}
                  category={row.category_id ? categoryById.get(row.category_id) : undefined}
                  sourceLabel={formatISODateBR(row.date)}
                  onClick={() => setEditing(row)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {payments.length > 0 ? (
        <section className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pagamentos</h2>
          <ul className="rounded-xl border border-border bg-surface p-2">
            {payments.map((row) => (
              <li key={row.id}>
                <TransactionItem
                  row={row}
                  sourceLabel={`${formatISODateBR(row.date)} · ${accountName.get(row.account_id ?? '') ?? '?'}`}
                  onClick={() => setEditingPayment(row)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TransactionModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        transactionId={editing?.id}
        initial={editing ? rowToFormValues(editing) : undefined}
        installment={editing ? installmentInfo(editing) : undefined}
      />
      {invoiceId ? (
        <PaymentModal
          open={editingPayment !== null}
          onOpenChange={(open) => {
            if (!open) setEditingPayment(null)
          }}
          invoiceId={invoiceId}
          remainingCents={remainingCents}
          defaultAccountId={defaultAccountId}
          payment={
            editingPayment
              ? {
                  id: editingPayment.id,
                  accountId: editingPayment.account_id ?? '',
                  amountCents: editingPayment.amount_cents,
                  date: editingPayment.date,
                }
              : undefined
          }
        />
      ) : null}
    </>
  )
}
```

- [ ] **Step 7: Página `app/(app)/cartoes/[id]/page.tsx`**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CardActions } from '@/components/cards/card-actions'
import { InvoiceSelector } from '@/components/cards/invoice-selector'
import { InvoiceStatusBadge } from '@/components/cards/invoice-status-badge'
import { InvoiceTransactions } from '@/components/cards/invoice-transactions'
import { PayInvoiceButton } from '@/components/cards/payment-form'
import { UsageBar } from '@/components/cards/usage-bar'
import { listAccounts } from '@/lib/accounts'
import { getCard, toSchedule } from '@/lib/cards'
import type { PaletteColor } from '@/lib/categories'
import { listCategories } from '@/lib/categories-query'
import { formatISODateBR, todayISO } from '@/lib/dates'
import { cycleForClosingMonth, invoiceStatus } from '@/lib/finance/invoice'
import { formatBRL } from '@/lib/finance/money'
import { parseInvoiceParam } from '@/lib/invoice-labels'
import { applyEffectiveStatus, type TransactionRow } from '@/lib/transaction-mappers'
import { listInvoiceTransactions } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import { cardSubtitle } from '@/lib/validation/card'
import { uuidSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Cartão' }

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fatura?: string | string[] }>
}

export default async function CardPage({ params, searchParams }: Props) {
  const [{ id }, { fatura }] = await Promise.all([params, searchParams])
  if (!uuidSchema.safeParse(id).success) notFound()

  const detail = await getCard(id)
  if (!detail) notFound()
  const { card, invoices } = detail

  const today = todayISO()
  const closingMonth = parseInvoiceParam(fatura) ?? card.currentCycle.closingMonth
  const invoice = invoices.find((item) => item.cycle.closingMonth === closingMonth)
  // Ciclo sem lançamentos ainda não tem fatura salva: mostra as datas calculadas
  const cycle = invoice?.cycle ?? cycleForClosingMonth(toSchedule(card), closingMonth)
  const totalCents = invoice?.totalCents ?? 0
  const paidCents = invoice?.paidCents ?? 0
  const status = invoiceStatus(cycle, { totalCents, paidCents }, today)
  const remainingCents = Math.max(totalCents - paidCents, 0)

  const [rows, categories, accounts] = await Promise.all([
    invoice ? listInvoiceTransactions(invoice.invoiceId) : Promise.resolve<TransactionRow[]>([]),
    listCategories(),
    listAccounts({ includeArchived: true }),
  ])
  const visible = rows.map((row) => applyEffectiveStatus(row, today))

  return (
    <>
      <div className="mb-2">
        <Link href="/cartoes" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ Cartões
        </Link>
      </div>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{card.name}</h1>
          <p className="text-sm text-muted-foreground">{cardSubtitle(card)}</p>
        </div>
        <InvoiceSelector cardId={card.id} closingMonth={cycle.closingMonth} referenceMonth={cycle.referenceMonth} />
      </header>

      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2" aria-label="Resumo da fatura">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <InvoiceStatusBadge status={status} />
            <p className="text-sm text-muted-foreground">
              Fecha {formatISODateBR(cycle.closingDate)} · vence {formatISODateBR(cycle.dueDate)}
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatBRL(totalCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pago</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatBRL(paidCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Falta pagar</dt>
              <dd className={cn('text-lg font-semibold tabular-nums', status === 'overdue' && 'text-expense')}>
                {formatBRL(remainingCents)}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <PayInvoiceButton
              invoiceId={invoice?.invoiceId ?? null}
              remainingCents={remainingCents}
              defaultAccountId={card.defaultPaymentAccountId}
            />
          </div>
        </section>
        <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-label="Limite do cartão">
          <p className="text-sm text-muted-foreground">
            Limite de {formatBRL(card.limitCents)} · usado {formatBRL(card.usage.usedCents)}
          </p>
          <UsageBar usage={card.usage} />
          <CardActions
            id={card.id}
            archived={card.archived}
            initial={{
              name: card.name,
              brand: card.brand,
              lastFour: card.lastFour ?? '',
              limitCents: card.limitCents,
              closingDay: card.closingDay,
              dueDay: card.dueDay,
              defaultPaymentAccountId: card.defaultPaymentAccountId ?? '',
              color: card.color as PaletteColor,
            }}
          />
        </section>
      </div>

      <InvoiceTransactions
        purchases={visible.filter((row) => row.type !== 'invoice_payment')}
        payments={visible.filter((row) => row.type === 'invoice_payment')}
        categories={categories}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
        invoiceId={invoice?.invoiceId ?? null}
        remainingCents={remainingCents}
        defaultAccountId={card.defaultPaymentAccountId}
      />
    </>
  )
}
```

- [ ] **Step 8: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS, sem erros.

Manual (`npm run dev`):
1. `/cartoes` → abrir o cartão: "Fatura de <mês>" com status, datas, Total/Pago/Falta pagar; ‹ › trocam de ciclo; `?fatura=xyz` cai na fatura atual.
2. A compra 3x do Task 8 aparece como "Geladeira (1/3)" na fatura de outubro e "(2/3)" na de novembro.
3. Receita no cartão (estorno) de R$ 5,00 aparece com **+** e abate o total.
4. **Pagar fatura** com o valor sugerido → status "Paga" depois do fechamento (ou "Aberta" com Pago preenchido antes dele); `/contas/<conta>` mostra a saída; `/lancamentos` não soma o pagamento nas despesas.
5. Pagamento parcial numa fatura com vencimento passado → "Vencida" em destaque.
6. Tocar no pagamento → editar valor; **Excluir** → **Desfazer** restaura.
7. Editar o cartão mudando o fechamento → aviso de recálculo; salvar e conferir que compras das faturas abertas mudaram de ciclo e as fechadas não.

- [ ] **Step 9: Commit**

```bash
git add lib components "app/(app)/cartoes"
git commit -m "$(cat <<'EOF'
feat(cartoes): tela da fatura com status, compras, estornos e pagamento total ou parcial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Lançamentos e extrato com cartões e pagamentos de fatura

**Files:**
- Modify: `lib/transaction-filters.ts`, `lib/transaction-filters.test.ts`, `lib/transactions.ts`, `app/(app)/lancamentos/page.tsx`, `components/transactions/transaction-list.tsx`, `components/transactions/transactions-toolbar.tsx`, `components/accounts/statement-list.tsx`

**Interfaces:**
- Consumes: `TransactionFilters.cardId` (Task 4); `applyEffectiveStatus` (Task 5); `listCardOptions` (Task 7); `invoiceHref` (Task 9).
- Produces:
  - `statusFilter(status: TransactionStatus, today: string): string` (filtro PostgREST do status efetivo).
  - `TransactionQueryFilters.cardId?: string`; `listMonthTransactions(ym, filters, today)` e `searchTransactions(q, filters, today)` recebem `today`.
  - `TransactionList` recebe `cards: { id: string; name: string }[]`; `TransactionsToolbar` recebe `cards: { id: string; name: string; archived: boolean }[]`.

- [ ] **Step 1: Filtro de status efetivo — teste que falha**

Em `lib/transaction-filters.test.ts`, acrescente `statusFilter` ao import e:

```ts
describe('statusFilter', () => {
  it('compras no cartão (sem conta) pelo dia; o resto pelo status salvo', () => {
    expect(statusFilter('pending', '2026-10-04')).toBe(
      'and(account_id.not.is.null,status.eq.pending),and(account_id.is.null,date.gt.2026-10-04)',
    )
    expect(statusFilter('paid', '2026-10-04')).toBe('and(account_id.not.is.null,status.eq.paid),and(account_id.is.null,date.lte.2026-10-04)')
  })
})
```

Run: `npm test -- lib/transaction-filters.test.ts`
Expected: FAIL — `statusFilter` não exportado.

- [ ] **Step 2: Implementar `statusFilter` em `lib/transaction-filters.ts`**

Acrescente ao final:

```ts
/**
 * Filtro PostgREST (para `.or()`) do status efetivo: receitas e despesas no cartão (account_id nulo)
 * seguem a data; lançamentos em conta e pagamentos de fatura, o status salvo. `today` vem de todayISO().
 */
export function statusFilter(status: TransactionStatus, today: string): string {
  const byDate = status === 'paid' ? `date.lte.${today}` : `date.gt.${today}`
  return `and(account_id.not.is.null,status.eq.${status}),and(account_id.is.null,${byDate})`
}
```

Run: `npm test -- lib/transaction-filters.test.ts`
Expected: PASS.

- [ ] **Step 3: Consultas em `lib/transactions.ts`**

Acrescente `statusFilter` ao import de `@/lib/transaction-filters` (`import { escapeLike, statusFilter } from '@/lib/transaction-filters'`) e troque o bloco de `TransactionQueryFilters` até o fim do arquivo por:

```ts
export type TransactionQueryFilters = {
  type?: TransactionType
  categoryIds?: string[]
  accountId?: string
  cardId?: string
  status?: TransactionStatus
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/** Filtros já validados (uuid/enum) por parseTransactionsQuery. `today` define o status das compras no cartão. */
function filteredQuery(supabase: SupabaseServer, filters: TransactionQueryFilters, today: string) {
  let query = supabase.from('transactions').select(TRANSACTION_COLUMNS)
  if (filters.type) query = query.eq('type', filters.type)
  if (filters.cardId) query = query.eq('credit_card_id', filters.cardId)
  if (filters.categoryIds) query = query.in('category_id', filters.categoryIds)
  if (filters.accountId) {
    query = query.or(`account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`)
    // Com filtro de conta só vêm linhas com conta: vale o status salvo
    if (filters.status) query = query.eq('status', filters.status)
  } else if (filters.status) {
    query = query.or(statusFilter(filters.status, today))
  }
  return query
}

export async function listMonthTransactions(ym: YearMonth, filters: TransactionQueryFilters, today: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { start, end } = monthBounds(ym)
  const rows = await fetchAllPages((from, to) =>
    filteredQuery(supabase, filters, today)
      .gte('date', start)
      .lt('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  return rows as TransactionRow[]
}

/** Busca por descrição em todo o histórico (texto literal, sem curingas). */
export async function searchTransactions(q: string, filters: TransactionQueryFilters, today: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { data, error } = await filteredQuery(supabase, filters, today)
    .ilike('description', `%${escapeLike(q)}%`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(SEARCH_LIMIT)
  if (error) throw error
  return data as TransactionRow[]
}
```

- [ ] **Step 4: Página `/lancamentos`**

Em `app/(app)/lancamentos/page.tsx`:
- acrescente os imports `import { listCardOptions } from '@/lib/cards'`, `import { todayISO } from '@/lib/dates'` e troque `import { rowToLedger } from '@/lib/transaction-mappers'` por `import { applyEffectiveStatus, rowToLedger } from '@/lib/transaction-mappers'`;
- troque o corpo da função até o `return` por:

```tsx
  const query = parseTransactionsQuery(await searchParams)
  const today = todayISO()
  const [categories, accounts, cards] = await Promise.all([
    listCategories(),
    listAccounts({ includeArchived: true }),
    listCardOptions(),
  ])

  const filters = {
    type: query.filters.type,
    status: query.filters.status,
    accountId: query.filters.accountId,
    cardId: query.filters.cardId,
    categoryIds: query.filters.categoryId ? expandCategoryFilter(query.filters.categoryId, categories) : undefined,
  }
  const found = query.q ? await searchTransactions(query.q, filters, today) : await listMonthTransactions(query.ym, filters, today)
  // Compras no cartão: previsto/realizado pela data
  const rows = found.map((row) => applyEffectiveStatus(row, today))
  // Trocar de mês sai do modo busca: o seletor preserva só os filtros
  const monthParams = filterParams({ ...query, q: '' })
```

- no `<TransactionsToolbar ...>`, acrescente a prop `cards={cards.map((card) => ({ id: card.id, name: card.name, archived: card.archived }))}`;
- no `<TransactionList ...>`, acrescente a prop `cards={cards.map((card) => ({ id: card.id, name: card.name }))}`.

- [ ] **Step 5: Lista com cartão e pagamento de fatura**

`components/transactions/transaction-list.tsx`, arquivo completo:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Category } from '@/lib/categories'
import { invoiceHref } from '@/lib/invoice-labels'
import { groupByDay, groupByMonth, splitPending, type TransactionGroup } from '@/lib/transaction-grouping'
import { installmentInfo, rowToFormValues, type TransactionRow } from '@/lib/transaction-mappers'
import { TransactionItem } from './transaction-item'
import { TransactionModal } from './transaction-modal'

type TransactionListProps = {
  rows: TransactionRow[]
  categories: Category[]
  accounts: { id: string; name: string }[]
  cards: { id: string; name: string }[]
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

export function TransactionList({ rows, categories, accounts, cards, mode }: TransactionListProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const cardName = new Map(cards.map((card) => [card.id, card.name]))

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
        {mode === 'search' ? 'Nenhum lançamento encontrado.' : 'Nenhum lançamento neste mês. Toque no + para lançar o primeiro.'}
      </div>
    )
  }

  const account = (id: string | null) => accountName.get(id ?? '') ?? '?'
  const card = (id: string | null) => cardName.get(id ?? '') ?? '?'
  const labelFor = (row: TransactionRow) => {
    if (row.type === 'transfer') return `${account(row.account_id)} → ${account(row.destination_account_id)}`
    if (row.type === 'invoice_payment') return `${account(row.account_id)} → ${card(row.credit_card_id)}`
    return row.credit_card_id ? card(row.credit_card_id) : account(row.account_id)
  }

  // Pagamento de fatura se edita na tela da fatura
  const open = (row: TransactionRow) => {
    if (row.type === 'invoice_payment' && row.credit_card_id && row.card_invoices) {
      router.push(invoiceHref(row.credit_card_id, row.card_invoices.closing_month))
      return
    }
    setEditing(row)
  }

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
                        sourceLabel={labelFor(row)}
                        onClick={() => open(row)}
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
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditing(null)
        }}
        transactionId={editing?.id}
        initial={editing ? rowToFormValues(editing) : undefined}
        installment={editing ? installmentInfo(editing) : undefined}
      />
    </>
  )
}
```

- [ ] **Step 6: Filtros de cartão e pagamento de fatura na barra**

Em `components/transactions/transactions-toolbar.tsx`:

1. `ToolbarProps` ganha `cards: { id: string; name: string; archived: boolean }[]`.
2. `FilterControls` passa a desestruturar `{ query, categories, accounts, cards, onChange }`.
3. No select de Tipo, depois de `<option value="transfer">Transferências</option>`, acrescente `<option value="invoice_payment">Pagamentos de fatura</option>`.
4. Depois do select de Conta, acrescente:

```tsx
      {cards.length > 0 ? (
        <NativeSelect aria-label="Cartão" value={filters.cardId ?? ''} onChange={(e) => set({ cardId: e.target.value || undefined })}>
          <option value="">Todos os cartões</option>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.archived ? `${card.name} (arquivado)` : card.name}
            </option>
          ))}
        </NativeSelect>
      ) : null}
```

5. `TransactionsToolbar` desestrutura `{ query, categories, accounts, cards }` e passa `cards={cards}` aos dois `<FilterControls ...>`.
6. No grid do desktop, troque `lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]` por `lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]`.

- [ ] **Step 7: Pagamento de fatura no extrato da conta**

Em `components/accounts/statement-list.tsx`:
- troque o import de ícones por `import { ArrowLeftRight, CreditCard } from 'lucide-react'`;
- dentro do `map`, depois de `const isTransfer = ...`, acrescente `const isPayment = row.type === 'invoice_payment'`;
- no `subtitle`, troque o trecho do meio por:

```tsx
              isTransfer
                ? `${accountNames.get(row.account_id ?? '') ?? '?'} → ${accountNames.get(row.destination_account_id ?? '') ?? '?'}`
                : isPayment
                  ? null
                  : category?.name,
```

- troque o bloco do ícone por:

```tsx
                {isTransfer || isPayment ? (
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground" aria-hidden>
                    {isPayment ? <CreditCard className="size-4" /> : <ArrowLeftRight className="size-4" />}
                  </span>
                ) : (
                  <CategoryIcon name={category?.icon ?? 'circle-ellipsis'} color={category?.color ?? '#64748b'} />
                )}
```

- [ ] **Step 8: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS, sem erros.

Manual (`npm run dev`):
1. `/lancamentos`: parcelas do cartão mostram "Geladeira (2/3)" e o nome do cartão; a de novembro fica em **Previsto** no mês de novembro e entra em "Despesas" daquele mês; o pagamento de fatura aparece com ícone de cartão, "Conta → Cartão", sem sinal, e **não** entra em Despesas.
2. Filtro **Cartão** mostra só as compras e pagamentos daquele cartão; Tipo "Pagamentos de fatura" mostra só pagamentos; Status "Pendentes" sem conta selecionada traz as parcelas futuras.
3. `?cartao=nao-uuid&tipo=constructor` → lista normal sem filtros.
4. Tocar num pagamento de fatura leva à fatura certa.
5. `/contas/<conta>`: o pagamento aparece como saída com ícone de cartão e o saldo bate.

- [ ] **Step 9: Commit**

```bash
git add lib "app/(app)/lancamentos/page.tsx" components/transactions components/accounts/statement-list.tsx
git commit -m "$(cat <<'EOF'
feat(lancamentos): cartões e pagamentos de fatura na lista, filtros e extrato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Tela de parcelas

**Files:**
- Create: `lib/installments-query.ts`, `components/installments/installments-view.tsx`
- Modify: `app/(app)/parcelas/page.tsx`

**Interfaces:**
- Consumes: `groupInstallmentsByMonth`, `totalCommitted`, `InstallmentEntry`, `InstallmentMonth` (Task 3); `TRANSACTION_COLUMNS`, `TransactionRow`, `installmentInfo`, `rowToFormValues`, `applyEffectiveStatus` (Tasks 5 e 8); `listCardOptions` (Task 7); `TransactionModal` (Task 8).
- Produces: `listUpcomingInstallments({ cardId? }): Promise<(InstallmentEntry & { row: TransactionRow })[]>`; página `/parcelas?cartao=<uuid>`.

- [ ] **Step 1: Consulta em `lib/installments-query.ts`**

```ts
import 'server-only'
import { currentYearMonth, monthBounds } from '@/lib/dates'
import { fetchAllPages } from '@/lib/fetch-all'
import type { InstallmentEntry } from '@/lib/finance/installments-view'
import { createClient } from '@/lib/supabase/server'
import { TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'

export type UpcomingInstallment = InstallmentEntry & { row: TransactionRow }

/** Parcelas cujas faturas vencem do mês atual em diante (todos os cartões ou um). `cardId` já validado como uuid. */
export async function listUpcomingInstallments({ cardId }: { cardId?: string } = {}): Promise<UpcomingInstallment[]> {
  const supabase = await createClient()
  const { start } = monthBounds(currentYearMonth())
  let invoiceQuery = supabase.from('card_invoices').select('id, reference_month').gte('reference_month', start)
  if (cardId) invoiceQuery = invoiceQuery.eq('credit_card_id', cardId)
  const { data: invoices, error } = await invoiceQuery
  if (error) throw error
  if (invoices.length === 0) return []

  const referenceOf = new Map(invoices.map((invoice) => [invoice.id, invoice.reference_month]))
  const rows = (await fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .in('invoice_id', [...referenceOf.keys()])
      .not('installment_plan_id', 'is', null)
      .order('id')
      .range(from, to),
  )) as TransactionRow[]

  return rows.map((row) => ({
    id: row.id,
    planId: row.installment_plan_id as string,
    cardId: row.credit_card_id as string,
    description: row.description,
    amountCents: row.amount_cents,
    installmentNumber: row.installment_number as number,
    installmentsCount: row.installment_plans?.installments_count ?? (row.installment_number as number),
    referenceMonth: referenceOf.get(row.invoice_id as string) as string,
    row,
  }))
}
```

- [ ] **Step 2: Componente `components/installments/installments-view.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { NativeSelect } from '@/components/form/native-select'
import { TransactionModal } from '@/components/transactions/transaction-modal'
import { formatYearMonthLabel, yearMonthOfISO } from '@/lib/dates'
import type { InstallmentEntry, InstallmentMonth } from '@/lib/finance/installments-view'
import { formatBRL } from '@/lib/finance/money'
import { installmentInfo, rowToFormValues, type TransactionRow } from '@/lib/transaction-mappers'

type Entry = InstallmentEntry & { row: TransactionRow }

type InstallmentsViewProps = {
  months: InstallmentMonth<Entry>[]
  totalCents: number
  cards: { id: string; name: string; color: string }[]
  cardId: string
}

export function InstallmentsView({ months, totalCents, cards, cardId }: InstallmentsViewProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const cardName = (id: string) => cardById.get(id)?.name ?? 'Cartão'

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Total comprometido</p>
          <p className="text-3xl font-semibold tabular-nums">{formatBRL(totalCents)}</p>
        </div>
        {cards.length > 0 ? (
          <NativeSelect
            aria-label="Cartão"
            className="sm:w-56"
            value={cardId}
            onChange={(event) => router.replace(event.target.value ? `/parcelas?cartao=${event.target.value}` : '/parcelas')}
          >
            <option value="">Todos os cartões</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>

      {months.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
          Nenhuma parcela pela frente.
        </div>
      ) : (
        <div className="space-y-4">
          {months.map((month) => (
            <section key={month.referenceMonth} className="rounded-xl border border-border bg-surface p-2">
              <header className="flex flex-wrap items-baseline justify-between gap-2 px-2 pt-1 pb-2">
                <h2 className="font-medium">{formatYearMonthLabel(yearMonthOfISO(month.referenceMonth))}</h2>
                <p className="font-semibold tabular-nums">{formatBRL(month.totalCents)}</p>
              </header>
              {month.byCard.length > 1 ? (
                <ul className="flex flex-wrap gap-2 px-2 pb-2 text-xs text-muted-foreground">
                  {month.byCard.map((item) => (
                    <li key={item.cardId} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 tabular-nums">
                      <span className="size-2 rounded-full" style={{ backgroundColor: cardById.get(item.cardId)?.color }} aria-hidden />
                      {cardName(item.cardId)} {formatBRL(item.totalCents)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul>
                {month.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(item.row)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.description}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {cardName(item.cardId)} · {item.installmentNumber}/{item.installmentsCount}
                        </span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block font-medium">{formatBRL(item.amountCents)}</span>
                        <span className="block text-xs text-muted-foreground">Restam {formatBRL(item.remainingCents)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TransactionModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        transactionId={editing?.id}
        initial={editing ? rowToFormValues(editing) : undefined}
        installment={editing ? installmentInfo(editing) : undefined}
      />
    </>
  )
}
```

- [ ] **Step 3: Página `app/(app)/parcelas/page.tsx`**

Arquivo completo (substitui o placeholder):

```tsx
import type { Metadata } from 'next'
import { InstallmentsView } from '@/components/installments/installments-view'
import { PageHeader } from '@/components/layout/page-header'
import { listCardOptions } from '@/lib/cards'
import { todayISO } from '@/lib/dates'
import { groupInstallmentsByMonth, totalCommitted } from '@/lib/finance/installments-view'
import { listUpcomingInstallments } from '@/lib/installments-query'
import { applyEffectiveStatus } from '@/lib/transaction-mappers'
import { uuidSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Parcelas' }

export default async function InstallmentsPage({ searchParams }: { searchParams: Promise<{ cartao?: string | string[] }> }) {
  const { cartao } = await searchParams
  const raw = Array.isArray(cartao) ? cartao[0] : cartao
  const cardId = raw && uuidSchema.safeParse(raw).success ? raw : undefined

  const [cards, found] = await Promise.all([listCardOptions(), listUpcomingInstallments({ cardId })])
  const today = todayISO()
  const entries = found.map((entry) => ({ ...entry, row: applyEffectiveStatus(entry.row, today) }))

  return (
    <>
      <PageHeader title="Parcelas" />
      <InstallmentsView
        months={groupInstallmentsByMonth(entries)}
        totalCents={totalCommitted(entries)}
        cards={cards.map((card) => ({ id: card.id, name: card.name, color: card.color }))}
        cardId={cardId ?? ''}
      />
    </>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

Manual (`npm run dev`):
1. `/parcelas` com compras parceladas em dois cartões: meses em ordem a partir do atual, total do mês = soma dos dois cartões, chips por cartão, "3/10" e "Restam R$ …" em cada item; total comprometido no topo.
2. Filtro de cartão muda a URL (`?cartao=`) e os totais; `?cartao=nao-uuid` mostra todos.
3. Tocar num item abre "Editar parcela"; "Esta e as futuras" com nova descrição reflete nos meses seguintes.
4. Sem parcelas: "Nenhuma parcela pela frente."

- [ ] **Step 5: Commit**

```bash
git add lib/installments-query.ts components/installments "app/(app)/parcelas/page.tsx"
git commit -m "$(cat <<'EOF'
feat(parcelas): visão consolidada das parcelas futuras por mês e por cartão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: README, verificação final e parada para revisão

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

Troque o título `## Funcionalidades (até a Fase 2)` por `## Funcionalidades (até a Fase 3)` e, depois do item de **Lançamentos**, acrescente:

```markdown
- **Cartões** (`/cartoes`): limite, dia de fechamento e de vencimento, conta padrão de pagamento e uso do limite com alerta em 80% e 100%. Mudar os dias recalcula as faturas abertas e futuras e redistribui as compras delas; as fechadas não mudam.
- **Faturas** (`/cartoes/[id]`): criadas automaticamente pelo mês de fechamento (compra no dia do fechamento vai para a seguinte); status calculado (aberta, fechada, paga, vencida). Pagamento total ou parcial a partir de uma conta: sai do saldo, mas não é despesa. Estorno é uma receita no cartão e abate o total.
- **Compras parceladas** (botão "+", "Pagar com" um cartão): 1 a 24 parcelas, com o resto dos centavos na primeira; compra já em andamento ("parcela 3 de 10"); editar ou excluir "só esta parcela" ou "esta e as futuras", com "Desfazer".
- **Parcelas** (`/parcelas`): todas as parcelas futuras de todos os cartões por mês de vencimento, com total por mês e por cartão.
```

e troque a linha `- Contas e categorias com lançamentos não podem ser excluídas, só arquivadas.` por `- Contas, categorias e cartões com lançamentos não podem ser excluídos, só arquivados.`

- [ ] **Step 2: Verificação completa**

Run: `npm test && npm run test:rls && npm run lint && npm run build`
Expected: todos passam; o build lista `/cartoes`, `/cartoes/[id]` e `/parcelas`.

- [ ] **Step 3: Checklist manual dos critérios de aceite (spec, seção 6)**

Em `npm run dev`, no celular (DevTools 360px) e em 1440px:
1. Cartão com fechamento dia 3: compra em 02/10 cai na fatura que fecha em 03/10; compra em 03/10, na que fecha em 03/11.
2. R$ 100,00 em 3x → 33,34 + 33,33 + 33,33 em três faturas consecutivas.
3. "Parcela 3 de 10, R$ 150,00" cria 8 parcelas e a 3 cai na fatura atual.
4. `/parcelas` soma o mês com todos os cartões.
5. Pagar a fatura reduz o saldo da conta, não aparece em Despesas; quitada fica "Paga"; parcial fica "Fechada" ou "Vencida".
6. Estorno abate a fatura e aparece como receita.
7. Mudar o fechamento redistribui só as faturas abertas.
8. Cartão com lançamentos: **Excluir** mostra "Não é possível excluir: há lançamentos neste cartão. Arquive em vez de excluir."; **Arquivar** funciona e o cartão some do "Pagar com".
9. Nenhuma tela com rolagem horizontal em 360px.

Anote qualquer item que falhar e corrija antes do commit.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: README com as funcionalidades da Fase 3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Parar para revisão**

O PRD pede parada ao fim de cada fase. Informe o usuário: o que foi entregue, o resultado dos comandos do Step 2 e do checklist do Step 3, e qualquer desvio da spec.
