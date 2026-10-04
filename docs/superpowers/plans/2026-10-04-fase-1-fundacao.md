# Fase 1 — Fundação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o esqueleto funcional do CD: Next.js com tema escuro e layout responsivo, Supabase na nuvem com casas/membros/convites/perfis protegidos por RLS, login e o fluxo de criar casa e convidar o parceiro.

**Architecture:** Next.js 16 (App Router) com Server Components para leitura e Server Actions (em `lib/actions/`) para mutações. Supabase acessado via `@supabase/ssr` (cookies), com a sessão renovada no `proxy.ts`. Operações sensíveis (criar casa, gerar e resgatar convite) são funções RPC `security definer` no Postgres. Regras puras (dinheiro, datas, validação, tradução de erros) ficam em `lib/` com testes Vitest.

**Tech Stack:** Next.js 16.3, React 19.3, TypeScript strict, Tailwind CSS 4.3, shadcn 4.21 (Radix), lucide-react, Supabase (Postgres, Auth, RLS) + @supabase/ssr 0.12, zod 4, react-hook-form 7 + @hookform/resolvers 5, date-fns 4, Vitest 5, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-10-04-fase-1-fundacao-design.md` (referência geral: `docs/PRD.md`)

## Global Constraints

- Todo texto da interface em pt-BR; datas exibidas como dd/mm/aaaa; fuso `America/Sao_Paulo`; moeda BRL.
- Tema escuro único: `<html lang="pt-BR" className="dark">`, sem alternância de tema.
- Valores monetários sempre inteiros em centavos; conversão para reais só na exibição.
- Nenhuma `service_role` key no código do app. Ela só aparece em `.env.test.local` e em `tests/rls/`.
- Toda tabela tem RLS habilitado; policies usam `public.is_household_member(...)`.
- Toda mudança de schema via arquivo em `supabase/migrations/`.
- Sem tela de cadastro e sem recuperação de senha: os usuários são criados no painel do Supabase.
- Mobile-first: sem rolagem horizontal em 360px; a partir de 1024px, menu lateral e conteúdo com `max-w-[1280px]`.
- Use as versões estáveis mais recentes (`@latest`) e nunca faça downgrade para versões anteriores às do Tech Stack.
- Ambiente Windows: rode os comandos com o Bash tool (Git Bash) a partir de `gusfer/`. Não use redirecionamento `>` do PowerShell (gera UTF-16).
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Componentes shadcn baseados em Radix (`asChild` disponível). Se o `shadcn init` perguntar a biblioteca base, escolha Radix.

## Review Focus

1. Código de convite digitado em minúsculas, com espaços ou hífen (`" abc-23k "`) deve ser aceito e normalizado para `ABC23K`. Testado no Task 4 (schema) e no Task 8 (RPC com código "bagunçado").
2. `?mes=` inválido ou adulterado na URL (`abc`, `2026-13`, `2026-1`, parâmetro repetido) deve cair no mês atual, sem erro. Testado no Task 3.
3. Virada de mês no fuso de São Paulo: um servidor em UTC às 02:00 de 01/11 ainda está em outubro no Brasil. Mês atual e datas exibidas precisam usar o fuso de SP. Testado no Task 3.
4. Nome (de usuário ou de casa) só com espaços ou acima do limite deve ser recusado com mensagem em pt-BR e nunca salvo. Testado no Task 4; o banco também tem `check` (Task 8).
5. Valor digitado como `"R$ 1.234,56"`, `"10.50"`, `"1.234"` ou `",50"` deve virar os centavos corretos; lixo vira `null`. Testado no Task 2.

---

## Mapa de arquivos

```
gusfer/
  .gitattributes                         Task 1   normaliza EOL em LF
  .env.example                           Task 1   variáveis públicas (versionado)
  vitest.config.ts                       Task 1   testes unitários (lib/**)
  vitest.rls.config.ts                   Task 8   testes de integração RLS
  proxy.ts                               Task 9   renova sessão + redireciona
  app/
    globals.css                          Task 6   tokens do tema
    layout.tsx                           Task 6   html pt-BR dark, fontes, Toaster
    page.tsx                             Task 10  redirect('/inicio')
    (auth)/login/page.tsx                Task 9
    (auth)/login/login-form.tsx          Task 9
    (onboarding)/bem-vindo/page.tsx      Task 11
    (onboarding)/bem-vindo/welcome-flow.tsx           Task 11
    (onboarding)/bem-vindo/create-household-card.tsx  Task 11
    (onboarding)/bem-vindo/join-household-card.tsx    Task 11
    (app)/layout.tsx                     Task 10  AppShell
    (app)/{inicio,lancamentos,cartoes,parcelas,contas,imovel,relatorios,orcamento}/page.tsx  Task 10
    (app)/configuracoes/page.tsx         Task 12
    (app)/configuracoes/household-name-form.tsx       Task 12
    (app)/configuracoes/members-list.tsx              Task 12
    (app)/configuracoes/invite-card.tsx               Task 12
  components/
    ui/*                                 Task 6   shadcn
    form/field.tsx                       Task 6   label + erro acessível
    layout/nav-items.ts                  Task 10
    layout/bottom-nav.tsx                Task 10  barra inferior + sheet "Mais"
    layout/sidebar.tsx                   Task 10
    layout/quick-add.tsx                 Task 10  botão "+" (sheet/dialog placeholder)
    layout/month-selector.tsx            Task 10
    layout/page-header.tsx               Task 10
    layout/placeholder-page.tsx          Task 10
    profile/display-name-form.tsx        Task 11
  lib/
    finance/money.ts (+ .test.ts)        Task 2
    dates.ts (+ .test.ts)                Task 3   mês na URL, fuso SP, dd/mm/aaaa
    validation/auth.ts (+ .test.ts)      Task 4
    validation/household.ts (+ .test.ts) Task 4
    supabase/errors.ts (+ .test.ts)      Task 5
    action-result.ts (+ .test.ts)        Task 5
    forms.ts                             Task 6   aplica erros de action no RHF
    supabase/env.ts                      Task 9
    supabase/server.ts                   Task 9
    supabase/client.ts                   Task 9
    supabase/proxy.ts                    Task 9
    supabase/database.types.ts           Task 8   gerado
    auth.ts                              Task 9   getCurrentUser
    household.ts                         Task 10  consultas da casa (server-only)
    profile.ts                           Task 11  getMyProfile (server-only)
    actions/auth.ts                      Task 9   signIn, signOut
    actions/household.ts                 Task 11/12
    actions/profile.ts                   Task 11
  supabase/
    config.toml                          Task 7   gerado pelo CLI
    migrations/20261004120000_fundacao.sql  Task 8
  tests/rls/household.rls.test.ts        Task 8
  README.md                              Task 13
```

---

### Task 1: Scaffold do projeto e ferramentas

**Files:**
- Create: projeto Next.js em `gusfer/` (via `create-next-app`), `.gitattributes`, `.env.example`, `vitest.config.ts`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: nada
- Produces: alias `@/*` → raiz do projeto; scripts `npm test`, `npm run lint`, `npm run build`, `npm run test:rls`, `npm run db:types`, `npm run db:push`; Vitest descobrindo `lib/**/*.test.ts`

- [ ] **Step 1: Gerar o projeto Next.js na pasta atual**

A pasta já contém `.git/` e `docs/`, que o `create-next-app` aceita.

Run:
```bash
cd "/c/Users/gustavo.santos/Documents/Curso Claude Code/gusfer"
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --no-react-compiler --yes
```
Expected: cria `package.json`, `app/`, `public/`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`. Se o comando recusar por causa de arquivos existentes, gere em `$TMP/cd-scaffold` com os mesmos flags e copie tudo (exceto `.git`) para `gusfer/`.

- [ ] **Step 2: Instalar as dependências**

Run:
```bash
npm i @supabase/ssr @supabase/supabase-js zod react-hook-form @hookform/resolvers date-fns lucide-react server-only
npm i -D vitest supabase
```
Expected: instala sem erros de peer dependency. Confira com `npm ls next react zod vitest` que as versões são ≥ às do Tech Stack.

- [ ] **Step 3: Adicionar os scripts ao `package.json`**

Deixe a seção `scripts` assim (mantendo `dev`, `build`, `start` e `lint` gerados pelo create-next-app):

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run --passWithNoTests",
  "test:watch": "vitest",
  "test:rls": "vitest run --config vitest.rls.config.ts",
  "db:push": "supabase db push",
  "db:types": "supabase gen types typescript --linked --schema public > lib/supabase/database.types.ts"
}
```

- [ ] **Step 4: Criar `vitest.config.ts`**

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: Criar `.gitattributes`, `.env.example` e liberar o exemplo no `.gitignore`**

`.gitattributes`:
```
* text=auto eol=lf
```

`.env.example`:
```
# Copie para .env.local e preencha com os dados do projeto Supabase
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```

No `.gitignore` gerado existe a linha `.env*`. Logo abaixo dela, adicione:
```
!.env.example
```

- [ ] **Step 6: Verificar o scaffold**

Run: `npm test && npm run lint && npm run build`
Expected: `npm test` informa "No test files found" e sai com código 0; o lint passa; o build termina com "Compiled successfully".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 com Tailwind, Vitest e Supabase CLI" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dinheiro em centavos (`lib/finance/money.ts`)

**Files:**
- Create: `lib/finance/money.ts`
- Test: `lib/finance/money.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `formatBRL(cents: number): string` e `parseBRL(input: string): number | null`

- [ ] **Step 1: Escrever os testes que devem falhar**

`lib/finance/money.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatBRL, parseBRL } from './money'

// Intl usa espaço não separável (U+00A0) depois de "R$"
const plain = (value: string) => value.replace(/ /g, ' ')

describe('formatBRL', () => {
  it('formata centavos como reais', () => {
    expect(plain(formatBRL(0))).toBe('R$ 0,00')
    expect(plain(formatBRL(5))).toBe('R$ 0,05')
    expect(plain(formatBRL(123456))).toBe('R$ 1.234,56')
  })

  it('formata valores negativos', () => {
    expect(plain(formatBRL(-1000))).toBe('-R$ 10,00')
  })
})

describe('parseBRL', () => {
  it.each([
    ['10', 1000],
    ['10,5', 1050],
    ['10,50', 1050],
    ['0,05', 5],
    [',50', 50],
    ['1.234,56', 123456],
    ['12.345.678,90', 1234567890],
    ['R$ 1.234,56', 123456],
    ['R$ 10,00', 1000],
    ['  7,9 ', 790],
    ['1.234', 123400],
    ['10.50', 1050],
    ['1.5', 150],
    ['-5,00', -500],
    ['-0', 0],
  ])('interpreta %j como %i centavos', (input, expected) => {
    expect(parseBRL(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '-', '10,555', '1,2,3', '10,', '1.23.4', '12a'])(
    'recusa %j',
    (input) => {
      expect(parseBRL(input)).toBeNull()
    },
  )
})
```

- [ ] **Step 2: Rodar os testes e confirmar a falha**

Run: `npx vitest run lib/finance/money.test.ts`
Expected: FAIL com "Failed to resolve import './money'".

- [ ] **Step 3: Implementar**

`lib/finance/money.ts`:
```ts
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Formata um valor inteiro em centavos como moeda brasileira (ex.: 123456 → "R$ 1.234,56"). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

const WITH_COMMA = /^(\d{1,3}(?:\.\d{3})+|\d*),(\d{1,2})$/
const THOUSANDS_ONLY = /^\d{1,3}(?:\.\d{3})+$/
const DOT_DECIMAL = /^(\d+)\.(\d{1,2})$/
const INTEGER = /^\d+$/

/**
 * Converte o texto digitado pelo usuário em centavos.
 * Aceita "R$", vírgula decimal, ponto de milhar e, sem vírgula, ponto decimal com 1–2 casas.
 * Retorna null para entradas inválidas.
 */
export function parseBRL(input: string): number | null {
  let value = input.replace(/R\$/gi, '').replace(/[\s ]/g, '')
  let negative = false
  if (value.startsWith('-')) {
    negative = true
    value = value.slice(1)
  }
  if (value === '') return null

  let integerPart: string
  let fractionPart: string
  let match: RegExpExecArray | null

  if ((match = WITH_COMMA.exec(value))) {
    integerPart = match[1].replace(/\./g, '')
    fractionPart = match[2]
  } else if (THOUSANDS_ONLY.test(value)) {
    integerPart = value.replace(/\./g, '')
    fractionPart = ''
  } else if ((match = DOT_DECIMAL.exec(value))) {
    integerPart = match[1]
    fractionPart = match[2]
  } else if (INTEGER.test(value)) {
    integerPart = value
    fractionPart = ''
  } else {
    return null
  }

  const cents = Number(integerPart || '0') * 100 + Number(fractionPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative && cents !== 0 ? -cents : cents
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/finance/money.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add lib/finance
git commit -m "feat(finance): formatBRL e parseBRL em centavos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Datas e mês de referência (`lib/dates.ts`)

**Files:**
- Create: `lib/dates.ts`
- Test: `lib/dates.test.ts`

**Interfaces:**
- Consumes: `date-fns`, `date-fns/locale`
- Produces:
  - `type YearMonth = { year: number; month: number }` (month 1–12)
  - `TIME_ZONE = 'America/Sao_Paulo'`
  - `currentYearMonth(now?: Date): YearMonth`
  - `parseYearMonth(value: string | null | undefined): YearMonth | null`
  - `resolveYearMonth(value: string | string[] | undefined, now?: Date): YearMonth`
  - `shiftYearMonth(ym: YearMonth, delta: number): YearMonth`
  - `formatYearMonthParam(ym: YearMonth): string` (`"2026-10"`)
  - `formatYearMonthLabel(ym: YearMonth): string` (`"Outubro 2026"`)
  - `formatDateBR(value: string | Date): string` (`"10/10/2026"`, no fuso de SP)

- [ ] **Step 1: Escrever os testes que devem falhar**

`lib/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  currentYearMonth,
  formatDateBR,
  formatYearMonthLabel,
  formatYearMonthParam,
  parseYearMonth,
  resolveYearMonth,
  shiftYearMonth,
} from './dates'

describe('currentYearMonth', () => {
  it('usa o fuso de São Paulo na virada do mês', () => {
    // 02:00 UTC de 01/11 = 23:00 de 31/10 em São Paulo
    expect(currentYearMonth(new Date('2026-11-01T02:00:00Z'))).toEqual({ year: 2026, month: 10 })
    // 03:00 UTC de 01/11 = 00:00 de 01/11 em São Paulo
    expect(currentYearMonth(new Date('2026-11-01T03:00:00Z'))).toEqual({ year: 2026, month: 11 })
  })
})

describe('parseYearMonth', () => {
  it('aceita AAAA-MM válido', () => {
    expect(parseYearMonth('2026-10')).toEqual({ year: 2026, month: 10 })
    expect(parseYearMonth('2027-01')).toEqual({ year: 2027, month: 1 })
  })

  it.each(['abc', '2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', '1999-12', '', null, undefined])(
    'recusa %j',
    (value) => {
      expect(parseYearMonth(value)).toBeNull()
    },
  )
})

describe('resolveYearMonth', () => {
  const now = new Date('2026-10-15T12:00:00Z')

  it('usa o parâmetro quando válido', () => {
    expect(resolveYearMonth('2026-03', now)).toEqual({ year: 2026, month: 3 })
  })

  it('usa o primeiro valor quando o parâmetro se repete', () => {
    expect(resolveYearMonth(['2026-03', '2026-04'], now)).toEqual({ year: 2026, month: 3 })
  })

  it('cai no mês atual quando ausente ou inválido', () => {
    expect(resolveYearMonth(undefined, now)).toEqual({ year: 2026, month: 10 })
    expect(resolveYearMonth('lixo', now)).toEqual({ year: 2026, month: 10 })
  })
})

describe('shiftYearMonth', () => {
  it('avança e volta atravessando o ano', () => {
    expect(shiftYearMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftYearMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftYearMonth({ year: 2026, month: 10 }, 13)).toEqual({ year: 2027, month: 11 })
    expect(shiftYearMonth({ year: 2026, month: 10 }, -22)).toEqual({ year: 2024, month: 12 })
  })
})

describe('formatação', () => {
  it('gera o parâmetro da URL com zero à esquerda', () => {
    expect(formatYearMonthParam({ year: 2026, month: 3 })).toBe('2026-03')
  })

  it('gera o rótulo em português com inicial maiúscula', () => {
    expect(formatYearMonthLabel({ year: 2026, month: 10 })).toBe('Outubro 2026')
    expect(formatYearMonthLabel({ year: 2026, month: 3 })).toBe('Março 2026')
  })

  it('formata datas como dd/mm/aaaa no fuso de São Paulo', () => {
    // 02:30 UTC de 11/10 = 23:30 de 10/10 em São Paulo
    expect(formatDateBR('2026-10-11T02:30:00Z')).toBe('10/10/2026')
    expect(formatDateBR(new Date('2026-01-05T15:00:00Z'))).toBe('05/01/2026')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar a falha**

Run: `npx vitest run lib/dates.test.ts`
Expected: FAIL com "Failed to resolve import './dates'".

- [ ] **Step 3: Implementar**

`lib/dates.ts`:
```ts
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/dates.test.ts
git commit -m "feat: utilitários de mês e data no fuso de São Paulo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Schemas de validação (`lib/validation/`)

**Files:**
- Create: `lib/validation/auth.ts`, `lib/validation/household.ts`
- Test: `lib/validation/auth.test.ts`, `lib/validation/household.test.ts`

**Interfaces:**
- Consumes: `zod` 4
- Produces:
  - `loginSchema` → `{ email: string; password: string }`; `type LoginInput = z.input<typeof loginSchema>`
  - `displayNameSchema` → `{ displayName: string }`; `type DisplayNameInput`
  - `householdNameSchema` → `{ name: string }`; `type HouseholdNameInput`
  - `inviteCodeSchema` → `{ code: string }` (normalizado); `type InviteCodeInput = z.input<...>`, `type InviteCodeOutput = z.output<...>`
  - `normalizeInviteCode(value: string): string`, `INVITE_CODE_REGEX`, `MAX_HOUSEHOLD_MEMBERS = 2`

- [ ] **Step 1: Escrever os testes que devem falhar**

`lib/validation/auth.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { loginSchema } from './auth'

describe('loginSchema', () => {
  it('normaliza o e-mail', () => {
    const result = loginSchema.parse({ email: '  Gustavo@Exemplo.com ', password: 'segredo' })
    expect(result.email).toBe('gustavo@exemplo.com')
  })

  it('recusa e-mail inválido com mensagem em português', () => {
    const result = loginSchema.safeParse({ email: 'nao-e-email', password: 'x' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Informe um e-mail válido.')
  })

  it('exige a senha', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Informe a senha.')
  })
})
```

`lib/validation/household.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { displayNameSchema, householdNameSchema, inviteCodeSchema, normalizeInviteCode } from './household'

describe('displayNameSchema', () => {
  it('remove espaços nas pontas', () => {
    expect(displayNameSchema.parse({ displayName: '  Gustavo  ' }).displayName).toBe('Gustavo')
  })

  it('recusa nome só com espaços', () => {
    const result = displayNameSchema.safeParse({ displayName: '    ' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Informe seu nome.')
  })

  it('recusa nome com mais de 60 caracteres', () => {
    const result = displayNameSchema.safeParse({ displayName: 'a'.repeat(61) })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Use no máximo 60 caracteres.')
  })
})

describe('householdNameSchema', () => {
  it('remove espaços nas pontas', () => {
    expect(householdNameSchema.parse({ name: ' Casa do Gustavo e da Paula ' }).name).toBe('Casa do Gustavo e da Paula')
  })

  it('recusa vazio e acima de 80 caracteres', () => {
    expect(householdNameSchema.safeParse({ name: '  ' }).error?.issues[0].message).toBe('Informe o nome da casa.')
    expect(householdNameSchema.safeParse({ name: 'a'.repeat(81) }).error?.issues[0].message).toBe(
      'Use no máximo 80 caracteres.',
    )
  })
})

describe('inviteCodeSchema', () => {
  it('normaliza minúsculas, espaços e hífen', () => {
    expect(normalizeInviteCode(' abc-23k ')).toBe('ABC23K')
    expect(inviteCodeSchema.parse({ code: ' abc-23k ' }).code).toBe('ABC23K')
    expect(inviteCodeSchema.parse({ code: 'abc 23k' }).code).toBe('ABC23K')
  })

  it.each(['abc23', 'ABC23KK', 'ABCD10', 'ABCDEO', 'ABCDEI', 'ABCDEL', ''])('recusa %j', (code) => {
    const result = inviteCodeSchema.safeParse({ code })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('O código tem 6 caracteres, entre letras e números.')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar a falha**

Run: `npx vitest run lib/validation`
Expected: FAIL com "Failed to resolve import './auth'" e "./household".

- [ ] **Step 3: Implementar**

`lib/validation/auth.ts`:
```ts
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: 'Informe um e-mail válido.' })),
  password: z.string().min(1, { error: 'Informe a senha.' }),
})

export type LoginInput = z.input<typeof loginSchema>
```

`lib/validation/household.ts`:
```ts
import { z } from 'zod'

export const MAX_HOUSEHOLD_MEMBERS = 2

/** Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L). Igual ao da função SQL create_invite. */
export const INVITE_CODE_REGEX = /^[A-HJKMNP-Z2-9]{6}$/

export function normalizeInviteCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: 'Informe seu nome.' })
    .max(60, { error: 'Use no máximo 60 caracteres.' }),
})

export const householdNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Informe o nome da casa.' })
    .max(80, { error: 'Use no máximo 80 caracteres.' }),
})

export const inviteCodeSchema = z.object({
  code: z
    .string()
    .transform(normalizeInviteCode)
    .pipe(z.string().regex(INVITE_CODE_REGEX, { error: 'O código tem 6 caracteres, entre letras e números.' })),
})

export type DisplayNameInput = z.input<typeof displayNameSchema>
export type HouseholdNameInput = z.input<typeof householdNameSchema>
export type InviteCodeInput = z.input<typeof inviteCodeSchema>
export type InviteCodeOutput = z.output<typeof inviteCodeSchema>
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/validation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validation
git commit -m "feat: schemas zod de login, nomes e código de convite" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tradução de erros e resultado de actions

**Files:**
- Create: `lib/supabase/errors.ts`, `lib/action-result.ts`
- Test: `lib/supabase/errors.test.ts`, `lib/action-result.test.ts`

**Interfaces:**
- Consumes: `zod`
- Produces:
  - `translateError(error: { code?: string | null; message?: string | null } | null | undefined): string`
  - `GENERIC_ERROR: string`
  - `type ActionFailure = { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }`
  - `type ActionResult<T = null> = { ok: true; data: T } | ActionFailure`
  - `invalidInput(error: z.ZodError): ActionFailure`

Códigos de erro lançados pelas RPCs (definidos no Task 8): `NOT_AUTHENTICATED`, `NO_HOUSEHOLD`, `ALREADY_MEMBER`, `INVALID_NAME`, `INVITE_NOT_FOUND`, `INVITE_USED`, `INVITE_EXPIRED`, `HOUSEHOLD_FULL`. No supabase-js, eles chegam como `{ code: 'P0001', message: 'INVITE_USED' }`. Erros de Auth chegam com `code` (ex.: `invalid_credentials`).

- [ ] **Step 1: Escrever os testes que devem falhar**

`lib/supabase/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { GENERIC_ERROR, translateError } from './errors'

describe('translateError', () => {
  it('traduz erros do Supabase Auth pelo code', () => {
    expect(translateError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'E-mail ou senha incorretos.',
    )
  })

  it('traduz erros das RPCs pela message', () => {
    expect(translateError({ code: 'P0001', message: 'INVITE_USED' })).toBe('Este código já foi usado.')
    expect(translateError({ code: 'P0001', message: 'HOUSEHOLD_FULL' })).toBe('Esta casa já tem 2 membros.')
    expect(translateError({ message: 'ALREADY_MEMBER' })).toBe('Você já faz parte de uma casa.')
  })

  it('usa a mensagem genérica para erros desconhecidos ou ausentes', () => {
    expect(translateError({ code: '42P01', message: 'relation does not exist' })).toBe(GENERIC_ERROR)
    expect(translateError(null)).toBe(GENERIC_ERROR)
    expect(translateError(undefined)).toBe(GENERIC_ERROR)
  })
})
```

`lib/action-result.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { invalidInput } from './action-result'

describe('invalidInput', () => {
  it('converte erros do zod em erros por campo', () => {
    const schema = z.object({ name: z.string().min(1, { error: 'Informe o nome.' }) })
    const parsed = schema.safeParse({ name: '' })
    if (parsed.success) throw new Error('deveria falhar')

    expect(invalidInput(parsed.error)).toEqual({
      ok: false,
      error: 'Verifique os campos destacados.',
      fieldErrors: { name: ['Informe o nome.'] },
    })
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar a falha**

Run: `npx vitest run lib/supabase/errors.test.ts lib/action-result.test.ts`
Expected: FAIL com "Failed to resolve import".

- [ ] **Step 3: Implementar**

`lib/supabase/errors.ts`:
```ts
export const GENERIC_ERROR = 'Algo deu errado. Tente novamente.'

const MESSAGES: Record<string, string> = {
  // Supabase Auth
  invalid_credentials: 'E-mail ou senha incorretos.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  user_banned: 'Este usuário está bloqueado.',
  // RPCs (supabase/migrations/*_fundacao.sql)
  NOT_AUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
  NO_HOUSEHOLD: 'Você ainda não faz parte de uma casa.',
  ALREADY_MEMBER: 'Você já faz parte de uma casa.',
  INVALID_NAME: 'Nome inválido.',
  INVITE_NOT_FOUND: 'Código de convite não encontrado.',
  INVITE_USED: 'Este código já foi usado.',
  INVITE_EXPIRED: 'Este código expirou. Peça um novo.',
  HOUSEHOLD_FULL: 'Esta casa já tem 2 membros.',
}

/** Traduz erros do Supabase (Auth, PostgREST ou RPC) para uma mensagem em pt-BR. */
export function translateError(error: { code?: string | null; message?: string | null } | null | undefined): string {
  if (!error) return GENERIC_ERROR
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]
  if (error.message && MESSAGES[error.message]) return MESSAGES[error.message]
  return GENERIC_ERROR
}
```

`lib/action-result.ts`:
```ts
import { z } from 'zod'

export type ActionFailure = {
  ok: false
  error: string
  fieldErrors?: Record<string, string[] | undefined>
}

export type ActionResult<T = null> = { ok: true; data: T } | ActionFailure

export function invalidInput(error: z.ZodError): ActionFailure {
  return {
    ok: false,
    error: 'Verifique os campos destacados.',
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS em todos os arquivos (money, dates, validation, errors, action-result).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/errors.ts lib/supabase/errors.test.ts lib/action-result.ts lib/action-result.test.ts
git commit -m "feat: tradução de erros para pt-BR e tipo ActionResult" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tema escuro, shadcn e layout raiz

**Files:**
- Create: `components/ui/*` (via shadcn), `components/form/field.tsx`, `lib/forms.ts`
- Modify: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `components/ui/input.tsx`
- Delete: SVGs de exemplo em `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`)

**Interfaces:**
- Consumes: `ActionFailure` (Task 5)
- Produces:
  - Componentes shadcn: `Button`, `Input`, `Label`, `Card*`, `Sheet*`, `Dialog*`, `Badge`, `Separator`, `Toaster`, além do helper `cn` de `@/lib/utils`
  - Utilitários Tailwind: `bg-surface`, `bg-surface-2`, `text-income`, `text-expense`, `text-warning`
  - `Field({ id, label, error, children })`
  - `applyActionErrors(form: { setError: UseFormSetError<T> }, failure: ActionFailure): void`

- [ ] **Step 1: Inicializar o shadcn e adicionar os componentes**

Run:
```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card sheet dialog badge separator sonner -y
```
Expected: cria `components.json`, `lib/utils.ts` e `components/ui/*.tsx`, e altera `app/globals.css`. Se perguntar a biblioteca base, escolha **Radix**.

- [ ] **Step 2: Substituir os tokens de cor em `app/globals.css`**

Mantenha as linhas `@import` geradas no topo pelo shadcn (ex.: `@import "tailwindcss";`, `@import "tw-animate-css";` e, se existir, `@import "shadcn/tailwind.css";`). Substitua **todo o resto** do arquivo por:

```css
@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  /* Tokens próprios do CD */
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-income: var(--income);
  --color-expense: var(--expense);
  --color-warning: var(--warning);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  color-scheme: dark;
  --radius: 0.625rem;

  /* Paleta do PRD (seção 9.1) */
  --background: #0b0f14;
  --surface: #131a22;
  --surface-2: #1b2430;
  --border: #263241;
  --text: #e6edf3;
  --text-muted: #8b98a5;
  --primary: #3b82f6;
  --income: #22c55e;
  --expense: #ef4444;
  --warning: #f59e0b;

  /* Mapeamento para as variáveis do shadcn */
  --foreground: var(--text);
  --card: var(--surface);
  --card-foreground: var(--text);
  --popover: var(--surface);
  --popover-foreground: var(--text);
  /* Texto escuro sobre o azul: contraste 5,2:1 (branco daria 3,7:1 e reprovaria no AA) */
  --primary-foreground: #0b0f14;
  --secondary: var(--surface-2);
  --secondary-foreground: var(--text);
  --muted: var(--surface-2);
  --muted-foreground: var(--text-muted);
  --accent: var(--surface-2);
  --accent-foreground: var(--text);
  --destructive: var(--expense);
  --input: var(--border);
  --ring: var(--primary);
  --chart-1: #3b82f6;
  --chart-2: #22c55e;
  --chart-3: #f59e0b;
  --chart-4: #a855f7;
  --chart-5: #ef4444;
  --sidebar: var(--surface);
  --sidebar-foreground: var(--text);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: #0b0f14;
  --sidebar-accent: var(--surface-2);
  --sidebar-accent-foreground: var(--text);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--primary);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

- [ ] **Step 3: Dar fundo `surface-2` ao Input**

Em `components/ui/input.tsx`, na string de classes do `<input>`, troque `bg-transparent` por `bg-surface-2` e **remova** `dark:bg-input/30`. Nenhuma outra mudança.

- [ ] **Step 4: Reescrever `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'CD — Controle de Danos', template: '%s · CD' },
  description: 'Finanças da casa',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0f14',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        {children}
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Página temporária para conferir o tema (o Task 10 a substitui)**

`app/page.tsx`:
```tsx
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">CD — Controle de Danos</h1>
      <p className="text-muted-foreground">Tema escuro carregado.</p>
      <p className="tabular-nums">
        <span className="text-income">+ R$ 1.000,00</span> · <span className="text-expense">− R$ 250,00</span>
      </p>
      <Button>Botão primário</Button>
    </main>
  )
}
```

Apague `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg` e `public/window.svg`.

- [ ] **Step 6: Criar `components/form/field.tsx`**

```tsx
import { Label } from '@/components/ui/label'

type FieldProps = {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}

/** Label + controle + mensagem de erro. O controle deve usar aria-describedby={`${id}-error`} quando houver erro. */
export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-expense">
          {error}
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 7: Criar `lib/forms.ts`**

```ts
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'
import type { ActionFailure } from '@/lib/action-result'

/** Aplica os erros retornados por uma Server Action nos campos do formulário e mostra um toast. */
export function applyActionErrors<T extends FieldValues>(
  form: { setError: UseFormSetError<T> },
  failure: ActionFailure,
): void {
  for (const [field, messages] of Object.entries(failure.fieldErrors ?? {})) {
    const message = messages?.[0]
    if (message) form.setError(field as Path<T>, { message })
  }
  toast.error(failure.error)
}
```

- [ ] **Step 8: Verificar**

Run: `npm run lint && npm run build`
Expected: ambos passam.

Run: `npm run dev`. Abra http://localhost:3000. Expected: fundo #0B0F14, texto claro, botão azul com texto escuro, valores verde e vermelho com sinal. Pare o servidor.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): tema escuro do PRD com shadcn e layout raiz pt-BR" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Projeto Supabase (pré-requisitos do usuário + vínculo do CLI)

**Files:**
- Create: `supabase/config.toml` (gerado), `.env.local`, `.env.test.local` (ambos fora do git)

**Interfaces:**
- Consumes: nada
- Produces: CLI vinculado ao projeto remoto (`supabase link`), `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `.env.test.local` com as mesmas duas e mais `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 1: PARAR e pedir ao usuário (checkpoint humano)**

Peça ao usuário, em pt-BR, que:
1. Crie um projeto em https://supabase.com/dashboard (região São Paulo, `sa-east-1`) e guarde a senha do banco.
2. Em **Authentication → Sign In / Providers**, desligue **"Allow new users to sign up"**.
3. Em **Project Settings → API Keys**, envie a **URL do projeto**, a **anon key** (ou publishable key) e a **service_role key** (ou secret key).
4. Rode no terminal, dentro de `gusfer/`: `npx supabase login` e depois `npx supabase link --project-ref <ref>`. O `<ref>` é o trecho `xxxx` de `https://xxxx.supabase.co`. O comando é interativo e pode pedir a senha do banco.

Ainda **não** peça para criar os usuários do Gustavo e da Paula; isso vem no fim do Task 8.

Não continue até receber os dados e a confirmação de que o `link` funcionou.

- [ ] **Step 2: Inicializar a pasta `supabase/` (se o link ainda não criou)**

Run: `ls supabase/config.toml || npx supabase init`
Expected: `supabase/config.toml` existe. Se o `init` perguntar sobre configurações do VS Code ou do IntelliJ, responda não.

- [ ] **Step 3: Criar os arquivos de ambiente**

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

`.env.test.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Run: `git status --short`
Expected: nenhum dos dois arquivos aparece (o `.env*` do `.gitignore` os cobre).

- [ ] **Step 4: Confirmar o vínculo**

Run: `npx supabase migration list`
Expected: tabela com as colunas Local/Remote vazias, sem erro de autenticação.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/.gitignore
git commit -m "chore(supabase): inicializa e vincula o projeto" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Se o CLI não gerar `supabase/.gitignore`, faça o commit só do `config.toml`.)

---

### Task 8: Migration da fundação com testes de RLS

**Files:**
- Create: `vitest.rls.config.ts`, `tests/rls/household.rls.test.ts`, `supabase/migrations/20261004120000_fundacao.sql`, `lib/supabase/database.types.ts` (gerado)

**Interfaces:**
- Consumes: `.env.test.local` (Task 7)
- Produces (Postgres, schema `public`):
  - Tabelas: `households(id, name, created_by, created_at, updated_at)`, `household_members(household_id, user_id, role, created_at)`, `household_invites(id, household_id, code, expires_at, used_at, used_by, created_by, created_at, updated_at)`, `profiles(user_id, display_name, avatar_url, created_at, updated_at)`
  - RPCs: `create_household(p_name text) → uuid`, `create_invite() → table(code text, expires_at timestamptz)`, `redeem_invite(p_code text) → uuid`
  - Helpers: `is_household_member(hid uuid) → boolean`, `shares_household_with(other uuid) → boolean`, `set_updated_at()`
  - Erros: `NOT_AUTHENTICATED`, `NO_HOUSEHOLD`, `ALREADY_MEMBER`, `INVALID_NAME`, `INVITE_NOT_FOUND`, `INVITE_USED`, `INVITE_EXPIRED`, `HOUSEHOLD_FULL`
  - TS: `Database` em `lib/supabase/database.types.ts`

- [ ] **Step 1: Criar `vitest.rls.config.ts`**

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vitest/config'

function loadTestEnv(): Record<string, string> {
  try {
    return parseEnv(readFileSync('.env.test.local', 'utf8')) as Record<string, string>
  } catch {
    throw new Error('Crie .env.test.local com NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY')
  }
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    env: loadTestEnv(),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
```

- [ ] **Step 2: Escrever os testes de integração**

`tests/rls/household.rls.test.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Defina ${name} em .env.test.local`)
  return value
}

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

// Cliente administrativo: só para criar e limpar dados de teste. Nunca usado pelo app.
const admin = createClient(url, serviceKey, noSession)

type TestUser = { id: string; client: SupabaseClient }

const createdUserIds: string[] = []
const createdHouseholdIds: string[] = []

async function newUser(label: string): Promise<TestUser> {
  const email = `rls-${label}-${crypto.randomUUID()}@example.com`
  const password = `Senha-${crypto.randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  createdUserIds.push(data.user.id)

  const client = createClient(url, anonKey, noSession)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, client }
}

async function createHousehold(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.client.rpc('create_household', { p_name: name })
  if (error) throw error
  createdHouseholdIds.push(data as string)
  return data as string
}

async function createInvite(user: TestUser): Promise<string> {
  const { data, error } = await user.client.rpc('create_invite')
  if (error) throw error
  return (data as { code: string }[])[0].code
}

describe('casa compartilhada: RLS e convites', () => {
  let a: TestUser // dono da casa A
  let b: TestUser // entra na casa A pelo convite
  let c: TestUser // dono da casa C
  let d: TestUser // sem casa
  let householdA: string
  let codeA: string

  beforeAll(async () => {
    ;[a, b, c, d] = await Promise.all([newUser('a'), newUser('b'), newUser('c'), newUser('d')])
  })

  afterAll(async () => {
    if (createdHouseholdIds.length > 0) {
      await admin.from('households').delete().in('id', createdHouseholdIds)
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id)
    }
  })

  it('cria o perfil automaticamente para novos usuários', async () => {
    const { data, error } = await a.client.from('profiles').select('user_id, display_name').eq('user_id', a.id)
    expect(error).toBeNull()
    expect(data).toEqual([{ user_id: a.id, display_name: null }])
  })

  it('A cria a casa e gera um convite válido', async () => {
    householdA = await createHousehold(a, 'Casa RLS A')
    codeA = await createInvite(a)
    expect(codeA).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)

    const { data } = await a.client.from('household_members').select('user_id, role').eq('household_id', householdA)
    expect(data).toEqual([{ user_id: a.id, role: 'owner' }])
  })

  it('B, de fora da casa, não lê nada da casa de A', async () => {
    const households = await b.client.from('households').select('id').eq('id', householdA)
    const members = await b.client.from('household_members').select('user_id').eq('household_id', householdA)
    const invites = await b.client.from('household_invites').select('code').eq('household_id', householdA)
    const profiles = await b.client.from('profiles').select('user_id').eq('user_id', a.id)

    for (const result of [households, members, invites, profiles]) {
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    }
  })

  it('B não consegue se inserir na casa nem renomeá-la diretamente', async () => {
    const insert = await b.client
      .from('household_members')
      .insert({ household_id: householdA, user_id: b.id, role: 'member' })
    expect(insert.error).not.toBeNull()

    await b.client.from('households').update({ name: 'Invadida' }).eq('id', householdA)
    const { data } = await admin.from('households').select('name').eq('id', householdA).single()
    expect(data?.name).toBe('Casa RLS A')
  })

  it('B resgata o código digitado em minúsculas e com espaço e passa a ver a casa', async () => {
    const messy = ` ${codeA.slice(0, 3).toLowerCase()} ${codeA.slice(3).toLowerCase()} `
    const { data, error } = await b.client.rpc('redeem_invite', { p_code: messy })
    expect(error).toBeNull()
    expect(data).toBe(householdA)

    const households = await b.client.from('households').select('id, name').eq('id', householdA)
    expect(households.data).toEqual([{ id: householdA, name: 'Casa RLS A' }])

    const members = await b.client.from('household_members').select('user_id').eq('household_id', householdA)
    expect(members.data).toHaveLength(2)

    const profiles = await b.client.from('profiles').select('user_id').eq('user_id', a.id)
    expect(profiles.data).toHaveLength(1)
  })

  it('um código já usado não funciona de novo', async () => {
    const { error } = await d.client.rpc('redeem_invite', { p_code: codeA })
    expect(error?.message).toBe('INVITE_USED')
  })

  it('casa cheia não gera novo convite', async () => {
    const { error } = await a.client.rpc('create_invite')
    expect(error?.message).toBe('HOUSEHOLD_FULL')
  })

  it('quem já tem casa não cria outra nem entra em outra', async () => {
    await createHousehold(c, 'Casa RLS C')

    const again = await c.client.rpc('create_household', { p_name: 'Outra casa' })
    expect(again.error?.message).toBe('ALREADY_MEMBER')

    const codeC = await createInvite(c)
    const join = await b.client.rpc('redeem_invite', { p_code: codeC })
    expect(join.error?.message).toBe('ALREADY_MEMBER')
  })

  it('gerar um novo convite invalida o anterior', async () => {
    const first = await createInvite(c)
    await createInvite(c)
    const { error } = await d.client.rpc('redeem_invite', { p_code: first })
    expect(error?.message).toBe('INVITE_EXPIRED')
  })

  it('código expirado é recusado', async () => {
    const code = await createInvite(c)
    await admin
      .from('household_invites')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('code', code)
    const { error } = await d.client.rpc('redeem_invite', { p_code: code })
    expect(error?.message).toBe('INVITE_EXPIRED')
  })

  it('código inexistente é recusado', async () => {
    const { error } = await d.client.rpc('redeem_invite', { p_code: '222222' })
    expect(error?.message).toBe('INVITE_NOT_FOUND')
  })

  it('nome de casa vazio é recusado pelo banco', async () => {
    const { error } = await d.client.rpc('create_household', { p_name: '   ' })
    expect(error?.message).toBe('INVALID_NAME')
  })

  it('o cadastro público está desligado', async () => {
    const anon = createClient(url, anonKey, noSession)
    const { data, error } = await anon.auth.signUp({
      email: `rls-signup-${crypto.randomUUID()}@example.com`,
      password: 'Senha-forte-12345',
    })
    if (data.user) createdUserIds.push(data.user.id)
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `npm run test:rls`
Expected: FAIL. O teste de perfil falha com erro de relação inexistente (`relation "public.profiles" does not exist` ou "Could not find the table"). O teste de cadastro desligado já deve passar, se o usuário fez o Task 7 Step 1.2.

- [ ] **Step 4: Escrever a migration**

`supabase/migrations/20261004120000_fundacao.sql`:
```sql
-- Fase 1 — Fundação: casas, membros, convites e perfis.

-- =====================================================================
-- Utilitários
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- Tabelas
-- =====================================================================

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_invites_household_id_idx on public.household_invites (household_id);

create trigger household_invites_set_updated_at
  before update on public.household_invites
  for each row execute function public.set_updated_at();

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Perfil automático para cada usuário do Auth
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuários criados antes desta migration
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- =====================================================================
-- Helpers de RLS (security definer evita recursão nas policies)
-- =====================================================================

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.shares_household_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;

-- =====================================================================
-- RPCs
-- =====================================================================

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

  -- Serializa chamadas do mesmo usuário (evita duas casas num duplo clique)
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if exists (select 1 from public.household_members m where m.user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.households (name, created_by)
  values (v_name, v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_uid, 'owner');

  return v_household_id;
end;
$$;

create or replace function public.create_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_code text;
  v_expires_at timestamptz := now() + interval '7 days';
  v_bytes bytea;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select m.household_id into v_household_id
  from public.household_members m
  where m.user_id = v_uid
  limit 1;

  if v_household_id is null then
    raise exception 'NO_HOUSEHOLD';
  end if;

  -- Trava a casa: serializa convites e resgates da mesma casa
  perform 1 from public.households h where h.id = v_household_id for update;

  if (select count(*) from public.household_members m where m.household_id = v_household_id) >= 2 then
    raise exception 'HOUSEHOLD_FULL';
  end if;

  -- Só um convite ativo por casa
  update public.household_invites i
     set expires_at = now()
   where i.household_id = v_household_id
     and i.used_at is null
     and i.expires_at > now();

  loop
    -- gen_random_uuid() usa gerador criptográfico; os 6 primeiros bytes são aleatórios
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for k in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, k) % length(v_alphabet)), 1);
    end loop;

    begin
      insert into public.household_invites (household_id, code, expires_at, created_by)
      values (v_household_id, v_code, v_expires_at, v_uid);
      exit;
    exception when unique_violation then
      -- colisão de código: tenta outro
    end;
  end loop;

  return query select v_code, v_expires_at;
end;
$$;

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_household_id uuid;
  v_invite public.household_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if exists (select 1 from public.household_members m where m.user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  select i.household_id into v_household_id
  from public.household_invites i
  where i.code = v_code;

  if v_household_id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  -- Mesma ordem de travas do create_invite (casa, depois convite) para evitar deadlock
  perform 1 from public.households h where h.id = v_household_id for update;

  select * into v_invite
  from public.household_invites i
  where i.code = v_code
  for update;

  if v_invite.used_at is not null then
    raise exception 'INVITE_USED';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'INVITE_EXPIRED';
  end if;
  if (select count(*) from public.household_members m where m.household_id = v_household_id) >= 2 then
    raise exception 'HOUSEHOLD_FULL';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_uid, 'member');

  update public.household_invites i
     set used_at = now(), used_by = v_uid
   where i.id = v_invite.id;

  return v_household_id;
end;
$$;

-- =====================================================================
-- Permissões
-- =====================================================================

revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.shares_household_with(uuid) from public, anon;
revoke all on function public.create_household(text) from public, anon;
revoke all on function public.create_invite() from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;

revoke all on public.households, public.household_members, public.household_invites, public.profiles from anon;

-- Escrita só pelas RPCs; update apenas nas colunas editáveis
revoke insert, update, delete on public.households, public.household_members, public.household_invites, public.profiles
  from authenticated;
grant update (name) on public.households to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.profiles enable row level security;

create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy household_members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

create policy household_invites_select on public.household_invites
  for select to authenticated
  using (public.is_household_member(household_id));

create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.shares_household_with(user_id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 5: Aplicar no projeto remoto**

Run: `npx supabase db push --yes`
Expected: "Applying migration 20261004120000_fundacao.sql..." e "Finished supabase db push." Se der erro de SQL, confira com `npx supabase migration list` se a migration ficou registrada no remoto. Se não ficou, corrija o arquivo e rode de novo. Se ficou parcialmente aplicada, PARE e avise o usuário antes de qualquer limpeza no banco.

- [ ] **Step 6: Rodar os testes de RLS e confirmar que passam**

Run: `npm run test:rls`
Expected: PASS nos 13 testes.

- [ ] **Step 7: Gerar os tipos do banco**

Run: `mkdir -p lib/supabase && npm run db:types`
Expected: `lib/supabase/database.types.ts` contém `export type Database` e as funções `create_household`, `create_invite` e `redeem_invite`. Confira com `grep -c "redeem_invite" lib/supabase/database.types.ts` (resultado ≥ 1) e confirme que o arquivo começa com texto legível (UTF-8).

- [ ] **Step 8: Commit**

```bash
git add vitest.rls.config.ts tests/rls supabase/migrations lib/supabase/database.types.ts
git commit -m "feat(db): casas, membros, convites e perfis com RLS e testes de integração" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Pedir ao usuário que crie os dois usuários reais**

Avise o usuário: em **Authentication → Users → Add user → Create new user**, criar o usuário do Gustavo e o da Paula, com e-mail e senha e **"Auto Confirm User" marcado**. O trigger cria os perfis automaticamente. Esses usuários serão usados no Task 13.

---

### Task 9: Clientes Supabase, proxy e tela de login

**Files:**
- Create: `lib/supabase/env.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/proxy.ts`, `proxy.ts`, `lib/auth.ts`, `lib/actions/auth.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `Database` (Task 8), `loginSchema`/`LoginInput` (Task 4), `translateError` (Task 5), `ActionResult`/`invalidInput` (Task 5), `Field` e `applyActionErrors` (Task 6)
- Produces:
  - `createClient(): Promise<SupabaseClient<Database>>` em `@/lib/supabase/server`
  - `createBrowserSupabase(): SupabaseClient<Database>` em `@/lib/supabase/client`
  - `getCurrentUser(): Promise<User | null>` em `@/lib/auth` (cacheado por requisição)
  - `signIn(input: unknown): Promise<ActionResult>` e `signOut(): Promise<void>` em `@/lib/actions/auth`
  - Rotas: `/login` pública; o resto exige sessão

- [ ] **Step 1: `lib/supabase/env.ts`**

```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (veja .env.example)')
}

export const supabaseEnv = { url, anonKey }
```

- [ ] **Step 2: `lib/supabase/server.ts`**

```ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { supabaseEnv } from './env'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Chamado a partir de um Server Component: o proxy.ts já renova a sessão.
        }
      },
    },
  })
}
```

- [ ] **Step 3: `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { supabaseEnv } from './env'

export function createBrowserSupabase() {
  return createBrowserClient<Database>(supabaseEnv.url, supabaseEnv.anonKey)
}
```

- [ ] **Step 4: `lib/supabase/proxy.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'
import { supabaseEnv } from './env'

const PUBLIC_PATHS = new Set(['/login'])

/** Renova a sessão do Supabase e aplica os redirecionamentos de autenticação. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Não coloque código entre createServerClient e getClaims: isso pode deslogar usuários aleatoriamente.
  const { data } = await supabase.auth.getClaims()
  const isLoggedIn = Boolean(data?.claims)
  const isPublic = PUBLIC_PATHS.has(request.nextUrl.pathname)

  if (!isLoggedIn && !isPublic) return redirectKeepingCookies(request, response, '/login')
  if (isLoggedIn && isPublic) return redirectKeepingCookies(request, response, '/inicio')

  return response
}

function redirectKeepingCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  const redirect = NextResponse.redirect(url)
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}
```

- [ ] **Step 5: `proxy.ts` (raiz do projeto)**

```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
```

- [ ] **Step 6: `lib/auth.ts`**

```ts
import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** Usuário autenticado da requisição atual (validado no servidor do Supabase), ou null. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
})
```

- [ ] **Step 7: `lib/actions/auth.ts`**

```ts
'use server'

import { redirect } from 'next/navigation'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validation/auth'

export async function signIn(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, error: translateError(error) }

  return { ok: true, data: null }
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 8: Tela de login**

`app/(auth)/login/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Entrar' }

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">CD — Controle de Danos</CardTitle>
          <CardDescription>Entre com seu e-mail e senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  )
}
```

`app/(auth)/login/login-form.tsx`:
```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn } from '@/lib/actions/auth'
import { applyActionErrors } from '@/lib/forms'
import { loginSchema, type LoginInput } from '@/lib/validation/auth'

export function LoginForm() {
  const router = useRouter()
  const [navigating, setNavigating] = useState(false)
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState
  const busy = isSubmitting || navigating

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await signIn(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    setNavigating(true)
    router.replace('/inicio')
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...form.register('email')}
        />
      </Field>
      <Field id="password" label="Senha" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...form.register('password')}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 9: Verificar**

Run: `npm run lint && npm run build`
Expected: ambos passam. A saída do build lista `ƒ Proxy`.

Run (com `npm run dev` rodando em outro terminal, em background):
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/inicio
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```
Expected: o primeiro retorna `307 http://localhost:3000/login`; o segundo, `200`.

No navegador, entre em http://localhost:3000/login com o usuário do Gustavo (criado no Task 8 Step 9). Expected: senha errada mostra o toast "E-mail ou senha incorretos."; senha certa redireciona para `/inicio` (que dá 404 até o Task 10, o que é esperado). Pare o servidor.

- [ ] **Step 10: Commit**

```bash
git add lib/supabase lib/auth.ts lib/actions/auth.ts proxy.ts "app/(auth)"
git commit -m "feat(auth): clientes Supabase, proxy de sessão e tela de login" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: AppShell (navegação responsiva, seletor de mês e telas placeholder)

**Files:**
- Create: `lib/household.ts`, `components/layout/nav-items.ts`, `components/layout/bottom-nav.tsx`, `components/layout/sidebar.tsx`, `components/layout/quick-add.tsx`, `components/layout/month-selector.tsx`, `components/layout/page-header.tsx`, `components/layout/placeholder-page.tsx`, `app/(app)/layout.tsx`, 8 páginas em `app/(app)/*/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `createClient` e `getCurrentUser` (Task 9); `YearMonth`, `resolveYearMonth`, `shiftYearMonth`, `formatYearMonthParam` e `formatYearMonthLabel` (Task 3); `cn` e os componentes shadcn (Task 6)
- Produces:
  - `getCurrentHousehold(): Promise<CurrentHousehold | null>` com `CurrentHousehold = { id: string; name: string; role: HouseholdRole }`
  - `getHouseholdMembers(householdId: string): Promise<HouseholdMember[]>` com `HouseholdMember = { userId: string; role: HouseholdRole; displayName: string | null }`
  - `getActiveInvite(householdId: string): Promise<ActiveInvite | null>` com `ActiveInvite = { code: string; expiresAt: string }`
  - `type HouseholdRole = 'owner' | 'member'`
  - `PageHeader({ title, ym?, basePath? })`, `MonthSelector({ ym, basePath })`
  - `isActive(pathname: string, href: string): boolean`

- [ ] **Step 1: `lib/household.ts`**

```ts
import 'server-only'
import { cache } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type HouseholdRole = 'owner' | 'member'
export type CurrentHousehold = { id: string; name: string; role: HouseholdRole }
export type HouseholdMember = { userId: string; role: HouseholdRole; displayName: string | null }
export type ActiveInvite = { code: string; expiresAt: string }

/** Casa do usuário logado (no MVP, no máximo uma), ou null. */
export const getCurrentHousehold = cache(async (): Promise<CurrentHousehold | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('household_members')
    .select('role, households!inner(id, name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return { id: data.households.id, name: data.households.name, role: data.role as HouseholdRole }
})

export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  const supabase = await createClient()
  const { data: members, error } = await supabase
    .from('household_members')
    .select('user_id, role')
    .eq('household_id', householdId)
    .order('created_at')
  if (error) throw error

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .in(
      'user_id',
      members.map((member) => member.user_id),
    )
  if (profilesError) throw profilesError

  const names = new Map(profiles.map((profile) => [profile.user_id, profile.display_name]))
  return members.map((member) => ({
    userId: member.user_id,
    role: member.role as HouseholdRole,
    displayName: names.get(member.user_id) ?? null,
  }))
}

export async function getActiveInvite(householdId: string): Promise<ActiveInvite | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('household_invites')
    .select('code, expires_at')
    .eq('household_id', householdId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { code: data.code, expiresAt: data.expires_at } : null
}
```

- [ ] **Step 2: `components/layout/nav-items.ts`**

Os nomes de ícones abaixo são os canônicos do lucide-react 1.x. Se algum não existir na versão instalada, o `tsc` acusa e você troca pelo equivalente.

```ts
import {
  Building2,
  ChartColumn,
  CreditCard,
  House,
  Layers,
  PiggyBank,
  ReceiptText,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV = {
  inicio: { href: '/inicio', label: 'Início', icon: House },
  lancamentos: { href: '/lancamentos', label: 'Lançamentos', icon: ReceiptText },
  cartoes: { href: '/cartoes', label: 'Cartões', icon: CreditCard },
  parcelas: { href: '/parcelas', label: 'Parcelas', icon: Layers },
  contas: { href: '/contas', label: 'Contas', icon: Wallet },
  imovel: { href: '/imovel', label: 'Imóvel', icon: Building2 },
  relatorios: { href: '/relatorios', label: 'Relatórios', icon: ChartColumn },
  orcamento: { href: '/orcamento', label: 'Orçamento', icon: PiggyBank },
  configuracoes: { href: '/configuracoes', label: 'Configurações', icon: Settings },
} satisfies Record<string, NavItem>

/** Itens do sheet "Mais" no celular (PRD 9.2). */
export const MORE_NAV: NavItem[] = [NAV.parcelas, NAV.contas, NAV.imovel, NAV.relatorios, NAV.orcamento, NAV.configuracoes]

/** Todos os itens, na ordem do menu lateral do desktop. */
export const ALL_NAV: NavItem[] = [NAV.inicio, NAV.lancamentos, NAV.cartoes, ...MORE_NAV]

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
```

- [ ] **Step 3: `components/layout/quick-add.tsx`**

```tsx
'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const TITLE = 'Novo lançamento'
const DESCRIPTION = 'O formulário de lançamento chega na próxima fase. Em breve!'

/** Botão "+" central da barra inferior (celular): abre um bottom sheet. */
export function QuickAddSheetButton() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon" className="size-12 rounded-full shadow-lg" aria-label={TITLE}>
          <Plus className="size-6" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{TITLE}</SheetTitle>
          <SheetDescription>{DESCRIPTION}</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}

/** Botão "Novo lançamento" do menu lateral (desktop): abre um modal. */
export function QuickAddDialogButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Plus className="size-4" aria-hidden />
          {TITLE}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: `components/layout/bottom-nav.tsx`**

```tsx
'use client'

import { Ellipsis } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { isActive, MORE_NAV, NAV, type NavItem } from './nav-items'
import { QuickAddSheetButton } from './quick-add'

function itemClass(active: boolean) {
  return cn(
    'flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] transition-colors',
    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
  )
}

function BottomNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
      <item.icon className="size-5" aria-hidden />
      <span>{item.label}</span>
    </Link>
  )
}

function MoreSheet({ pathname }: { pathname: string }) {
  const active = MORE_NAV.some((item) => isActive(pathname, item.href))
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className={itemClass(active)}>
          <Ellipsis className="size-5" aria-hidden />
          <span>Mais</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>Mais</SheetTitle>
          <SheetDescription className="sr-only">Outras telas do app</SheetDescription>
        </SheetHeader>
        <ul className="grid grid-cols-3 gap-2 px-4">
          {MORE_NAV.map((item) => {
            const itemActive = isActive(pathname, item.href)
            return (
              <li key={item.href}>
                <SheetClose asChild>
                  <Link
                    href={item.href}
                    aria-current={itemActive ? 'page' : undefined}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg p-3 text-center text-xs transition-colors',
                      itemActive ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:bg-surface-2',
                    )}
                  >
                    <item.icon className="size-6" aria-hidden />
                    {item.label}
                  </Link>
                </SheetClose>
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}

/** Barra inferior fixa do celular (< 1024px). */
export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
        <li>
          <BottomNavLink item={NAV.inicio} pathname={pathname} />
        </li>
        <li>
          <BottomNavLink item={NAV.lancamentos} pathname={pathname} />
        </li>
        <li className="flex items-center justify-center">
          <QuickAddSheetButton />
        </li>
        <li>
          <BottomNavLink item={NAV.cartoes} pathname={pathname} />
        </li>
        <li>
          <MoreSheet pathname={pathname} />
        </li>
      </ul>
    </nav>
  )
}
```

- [ ] **Step 5: `components/layout/sidebar.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ALL_NAV, isActive } from './nav-items'
import { QuickAddDialogButton } from './quick-add'

/** Menu lateral fixo do desktop (≥ 1024px). */
export function Sidebar({ householdName }: { householdName: string }) {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 lg:flex">
      <div>
        <p className="text-lg font-semibold">CD</p>
        <p className="truncate text-sm text-muted-foreground">{householdName}</p>
      </div>
      <QuickAddDialogButton />
      <nav aria-label="Navegação principal">
        <ul className="space-y-1">
          {ALL_NAV.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-surface-2 font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
```

- [ ] **Step 6: Seletor de mês e cabeçalho**

`components/layout/month-selector.tsx`:
```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatYearMonthLabel, formatYearMonthParam, shiftYearMonth, type YearMonth } from '@/lib/dates'

/** "‹ Outubro 2026 ›": o mês fica na URL (?mes=AAAA-MM). */
export function MonthSelector({ ym, basePath }: { ym: YearMonth; basePath: string }) {
  const previous = shiftYearMonth(ym, -1)
  const next = shiftYearMonth(ym, 1)
  return (
    <nav
      aria-label="Selecionar mês"
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-1 sm:justify-start"
    >
      <Button asChild variant="ghost" size="icon">
        <Link
          href={`${basePath}?mes=${formatYearMonthParam(previous)}`}
          aria-label={`Mês anterior: ${formatYearMonthLabel(previous)}`}
        >
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <span className="min-w-36 text-center font-medium">{formatYearMonthLabel(ym)}</span>
      <Button asChild variant="ghost" size="icon">
        <Link
          href={`${basePath}?mes=${formatYearMonthParam(next)}`}
          aria-label={`Próximo mês: ${formatYearMonthLabel(next)}`}
        >
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </nav>
  )
}
```

`components/layout/page-header.tsx`:
```tsx
import type { YearMonth } from '@/lib/dates'
import { MonthSelector } from './month-selector'

type PageHeaderProps = { title: string; ym?: YearMonth; basePath?: string }

export function PageHeader({ title, ym, basePath }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {ym && basePath ? <MonthSelector ym={ym} basePath={basePath} /> : null}
    </header>
  )
}
```

`components/layout/placeholder-page.tsx`:
```tsx
import { resolveYearMonth } from '@/lib/dates'
import { PageHeader } from './page-header'

type PlaceholderPageProps = {
  title: string
  basePath: string
  searchParams: Promise<{ mes?: string | string[] }>
}

/** Tela da Fase 1: título, seletor de mês e aviso de "em breve". */
export async function PlaceholderPage({ title, basePath, searchParams }: PlaceholderPageProps) {
  const { mes } = await searchParams
  return (
    <>
      <PageHeader title={title} ym={resolveYearMonth(mes)} basePath={basePath} />
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
        Disponível em breve.
      </div>
    </>
  )
}
```

- [ ] **Step 7: Layout do app**

`app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Sidebar } from '@/components/layout/sidebar'
import { getCurrentHousehold } from '@/lib/household'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const household = await getCurrentHousehold()
  if (!household) redirect('/bem-vindo')

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar householdName={household.name} />
      <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-10">
        <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 lg:px-8 lg:pt-8">{children}</div>
      </main>
      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 8: As 8 telas placeholder**

`app/(app)/inicio/page.tsx`:
```tsx
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Início' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Início" basePath="/inicio" searchParams={searchParams} />
}
```

`app/(app)/lancamentos/page.tsx`:
```tsx
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Lançamentos' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Lançamentos" basePath="/lancamentos" searchParams={searchParams} />
}
```

`app/(app)/cartoes/page.tsx`:
```tsx
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Cartões' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Cartões" basePath="/cartoes" searchParams={searchParams} />
}
```

`app/(app)/parcelas/page.tsx`:
```tsx
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Parcelas' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Parcelas" basePath="/parcelas" searchParams={searchParams} />
}
```

`app/(app)/contas/page.tsx`:
```tsx
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Contas' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Contas" basePath="/contas" searchParams={searchParams} />
}
```

`app/(app)/imovel/page.tsx`:
```tsx
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Imóvel' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Imóvel" basePath="/imovel" searchParams={searchParams} />
}
```

`app/(app)/relatorios/page.tsx`:
```tsx
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Relatórios' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Relatórios" basePath="/relatorios" searchParams={searchParams} />
}
```

`app/(app)/orcamento/page.tsx`:
```tsx
import { PlaceholderPage } from '@/components/layout/placeholder-page'

export const metadata = { title: 'Orçamento' }

export default function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  return <PlaceholderPage title="Orçamento" basePath="/orcamento" searchParams={searchParams} />
}
```

- [ ] **Step 9: Raiz redireciona para o Início**

`app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/inicio')
}
```

- [ ] **Step 10: Verificar**

Run: `npm test && npm run lint && npm run build`
Expected: tudo passa.

O usuário real ainda não tem casa, então a verificação visual completa fica para o Task 11. Por ora, confirme no navegador: logado, `/inicio` redireciona para `/bem-vindo` (404 até o Task 11).

- [ ] **Step 11: Commit**

```bash
git add lib/household.ts components/layout "app/(app)" app/page.tsx
git commit -m "feat(layout): barra inferior, menu lateral, seletor de mês e telas placeholder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Boas-vindas: nome, criar casa ou entrar com código

**Files:**
- Create: `lib/profile.ts`, `lib/actions/profile.ts`, `lib/actions/household.ts`, `components/profile/display-name-form.tsx`, `app/(onboarding)/bem-vindo/page.tsx`, `app/(onboarding)/bem-vindo/welcome-flow.tsx`, `app/(onboarding)/bem-vindo/create-household-card.tsx`, `app/(onboarding)/bem-vindo/join-household-card.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` (Task 9), `getCurrentHousehold` (Task 10), schemas do Task 4, `ActionResult`/`invalidInput`/`translateError` (Task 5), `Field`/`applyActionErrors` (Task 6)
- Produces:
  - `getMyProfile(): Promise<{ user_id: string; display_name: string | null } | null>`
  - `updateDisplayName(input: unknown): Promise<ActionResult>`
  - `createHousehold(input: unknown): Promise<ActionResult>`
  - `joinHousehold(input: unknown): Promise<ActionResult>`
  - `DisplayNameForm({ defaultValue, submitLabel?, onSaved? })`
  - O Task 12 adiciona `renameHousehold` e `createInvite` ao mesmo `lib/actions/household.ts`

- [ ] **Step 1: `lib/profile.ts`**

```ts
import 'server-only'
import { cache } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const getMyProfile = cache(async () => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  return data
})
```

- [ ] **Step 2: `lib/actions/profile.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { displayNameSchema } from '@/lib/validation/household'

export async function updateDisplayName(input: unknown): Promise<ActionResult> {
  const parsed = displayNameSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: translateError({ message: 'NOT_AUTHENTICATED' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data.displayName })
    .eq('user_id', user.id)
    .select('user_id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}
```

- [ ] **Step 3: `lib/actions/household.ts` (criar e entrar)**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { householdNameSchema, inviteCodeSchema } from '@/lib/validation/household'

export async function createHousehold(input: unknown): Promise<ActionResult> {
  const parsed = householdNameSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_household', { p_name: parsed.data.name })
  if (error) return { ok: false, error: translateError(error) }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

export async function joinHousehold(input: unknown): Promise<ActionResult> {
  const parsed = inviteCodeSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.rpc('redeem_invite', { p_code: parsed.data.code })
  if (error) return { ok: false, error: translateError(error) }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}
```

- [ ] **Step 4: `components/profile/display-name-form.tsx`**

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateDisplayName } from '@/lib/actions/profile'
import { applyActionErrors } from '@/lib/forms'
import { displayNameSchema, type DisplayNameInput } from '@/lib/validation/household'

type DisplayNameFormProps = {
  defaultValue: string
  submitLabel?: string
  onSaved?: (displayName: string) => void
}

export function DisplayNameForm({ defaultValue, submitLabel = 'Salvar', onSaved }: DisplayNameFormProps) {
  const router = useRouter()
  const form = useForm<DisplayNameInput>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { displayName: defaultValue },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateDisplayName(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success('Nome salvo.')
    router.refresh()
    onSaved?.(values.displayName)
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="display-name" label="Seu nome" error={errors.displayName?.message}>
        <Input
          id="display-name"
          autoComplete="given-name"
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={errors.displayName ? 'display-name-error' : undefined}
          {...form.register('displayName')}
        />
      </Field>
      <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : submitLabel}
      </Button>
    </form>
  )
}
```

- [ ] **Step 5: Cartões de criar e de entrar**

`app/(onboarding)/bem-vindo/create-household-card.tsx`:
```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createHousehold } from '@/lib/actions/household'
import { applyActionErrors } from '@/lib/forms'
import { householdNameSchema, type HouseholdNameInput } from '@/lib/validation/household'

export function CreateHouseholdCard({ suggestedName }: { suggestedName: string }) {
  const router = useRouter()
  const [navigating, setNavigating] = useState(false)
  const form = useForm<HouseholdNameInput>({
    resolver: zodResolver(householdNameSchema),
    defaultValues: { name: suggestedName },
  })
  const { errors, isSubmitting } = form.formState
  const busy = isSubmitting || navigating

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createHousehold(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    setNavigating(true)
    router.replace('/inicio')
    router.refresh()
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar nossa casa</CardTitle>
        <CardDescription>Você será o dono(a) e poderá convidar seu par em Configurações.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="household-name" label="Nome da casa" error={errors.name?.message}>
            <Input
              id="household-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'household-name-error' : undefined}
              {...form.register('name')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Criando…' : 'Criar casa'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

`app/(onboarding)/bem-vindo/join-household-card.tsx`:
```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { joinHousehold } from '@/lib/actions/household'
import { applyActionErrors } from '@/lib/forms'
import { inviteCodeSchema, type InviteCodeInput, type InviteCodeOutput } from '@/lib/validation/household'

export function JoinHouseholdCard() {
  const router = useRouter()
  const [navigating, setNavigating] = useState(false)
  const form = useForm<InviteCodeInput, unknown, InviteCodeOutput>({
    resolver: zodResolver(inviteCodeSchema),
    defaultValues: { code: '' },
  })
  const { errors, isSubmitting } = form.formState
  const busy = isSubmitting || navigating

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await joinHousehold(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    setNavigating(true)
    router.replace('/inicio')
    router.refresh()
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenho um código de convite</CardTitle>
        <CardDescription>Peça o código de 6 caracteres a quem criou a casa.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="invite-code" label="Código" error={errors.code?.message}>
            <Input
              id="invite-code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              className="font-mono uppercase tracking-[0.3em]"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? 'invite-code-error' : undefined}
              {...form.register('code')}
            />
          </Field>
          <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar na casa'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Fluxo e página**

`app/(onboarding)/bem-vindo/welcome-flow.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { DisplayNameForm } from '@/components/profile/display-name-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateHouseholdCard } from './create-household-card'
import { JoinHouseholdCard } from './join-household-card'

export function WelcomeFlow({ initialName }: { initialName: string | null }) {
  const [name, setName] = useState(initialName ?? '')
  const [editingName, setEditingName] = useState(!initialName)

  if (editingName) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Como você quer ser chamado(a)?</CardTitle>
        </CardHeader>
        <CardContent>
          <DisplayNameForm
            defaultValue={name}
            submitLabel="Continuar"
            onSaved={(saved) => {
              setName(saved)
              setEditingName(false)
            }}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Olá, <span className="font-medium text-foreground">{name}</span>!{' '}
        <button type="button" className="underline underline-offset-4" onClick={() => setEditingName(true)}>
          Alterar nome
        </button>
      </p>
      <CreateHouseholdCard suggestedName={`Casa de ${name}`} />
      <JoinHouseholdCard />
    </div>
  )
}
```

`app/(onboarding)/bem-vindo/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentHousehold } from '@/lib/household'
import { getMyProfile } from '@/lib/profile'
import { WelcomeFlow } from './welcome-flow'

export const metadata: Metadata = { title: 'Bem-vindo' }

export default async function WelcomePage() {
  if (await getCurrentHousehold()) redirect('/inicio')
  const profile = await getMyProfile()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Bem-vindo ao CD</h1>
        <p className="text-muted-foreground">Vamos configurar a casa de vocês.</p>
      </div>
      <WelcomeFlow initialName={profile?.display_name ?? null} />
    </main>
  )
}
```

- [ ] **Step 7: Verificar**

Run: `npm test && npm run lint && npm run build`
Expected: tudo passa.

Com `npm run dev`, logado como Gustavo:
1. `/inicio` redireciona para `/bem-vindo`, que pede o nome. Tente salvar só espaços: aparece "Informe seu nome.". Salve "Gustavo".
2. Aparece "Olá, Gustavo!" com os dois cartões. O nome sugerido da casa é "Casa de Gustavo".
3. No cartão de convite, digite `abc` e envie: aparece a mensagem de 6 caracteres. Digite `222222`: aparece o toast "Código de convite não encontrado."
4. Crie a casa: você vai para `/inicio`. No celular (DevTools, 360px), a barra inferior aparece com o "+" central e o "Mais" abrindo o sheet. No desktop (1440px), aparece o menu lateral com o nome da casa.
5. O seletor de mês avança e volta e atualiza `?mes=` na URL. `/inicio?mes=lixo` mostra o mês atual.
6. Acessar `/bem-vindo` de novo redireciona para `/inicio`.

- [ ] **Step 8: Commit**

```bash
git add lib/profile.ts lib/actions components/profile "app/(onboarding)"
git commit -m "feat(onboarding): nome do usuário, criar casa e entrar com código" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Configurações: casa, perfil, membros, convite e sair

**Files:**
- Create: `app/(app)/configuracoes/page.tsx`, `app/(app)/configuracoes/household-name-form.tsx`, `app/(app)/configuracoes/members-list.tsx`, `app/(app)/configuracoes/invite-card.tsx`
- Modify: `lib/actions/household.ts` (adiciona `renameHousehold` e `createInvite`)

**Interfaces:**
- Consumes: `getCurrentUser` (Task 9); `getCurrentHousehold`, `getHouseholdMembers`, `getActiveInvite`, `HouseholdMember` e `ActiveInvite` (Task 10); `getMyProfile` e `DisplayNameForm` (Task 11); `signOut` (Task 9); `formatDateBR` (Task 3); `MAX_HOUSEHOLD_MEMBERS` e `householdNameSchema` (Task 4)
- Produces:
  - `renameHousehold(input: unknown): Promise<ActionResult>`
  - `createInvite(): Promise<ActionResult<ActiveInvite>>`

- [ ] **Step 1: Adicionar as actions em `lib/actions/household.ts`**

Ajuste os imports do topo do arquivo para:
```ts
import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentHousehold, type ActiveInvite } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { householdNameSchema, inviteCodeSchema } from '@/lib/validation/household'
```

Adicione ao fim do arquivo:
```ts
export async function renameHousehold(input: unknown): Promise<ActionResult> {
  const parsed = householdNameSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('households')
    .update({ name: parsed.data.name })
    .eq('id', household.id)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

export async function createInvite(): Promise<ActionResult<ActiveInvite>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_invite')
  if (error) return { ok: false, error: translateError(error) }

  const row = data?.[0]
  if (!row) return { ok: false, error: GENERIC_ERROR }

  revalidatePath('/configuracoes')
  return { ok: true, data: { code: row.code, expiresAt: row.expires_at } }
}
```

- [ ] **Step 2: `household-name-form.tsx`**

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renameHousehold } from '@/lib/actions/household'
import { applyActionErrors } from '@/lib/forms'
import { householdNameSchema, type HouseholdNameInput } from '@/lib/validation/household'

export function HouseholdNameForm({ defaultValue }: { defaultValue: string }) {
  const router = useRouter()
  const form = useForm<HouseholdNameInput>({
    resolver: zodResolver(householdNameSchema),
    defaultValues: { name: defaultValue },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await renameHousehold(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success('Nome da casa salvo.')
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="settings-household-name" label="Nome da casa" error={errors.name?.message}>
        <Input
          id="settings-household-name"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'settings-household-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>
      <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: `members-list.tsx`**

```tsx
import { Badge } from '@/components/ui/badge'
import type { HouseholdMember } from '@/lib/household'

export function MembersList({ members, currentUserId }: { members: HouseholdMember[]; currentUserId: string }) {
  return (
    <ul className="divide-y divide-border">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center justify-between gap-3 py-3">
          <span className="min-w-0 truncate">
            {member.displayName ?? 'Sem nome'}
            {member.userId === currentUserId ? <span className="text-muted-foreground"> (você)</span> : null}
          </span>
          <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
            {member.role === 'owner' ? 'Dono(a)' : 'Membro'}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: `invite-card.tsx`**

```tsx
'use client'

import { Copy, RefreshCw } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createInvite } from '@/lib/actions/household'
import { formatDateBR } from '@/lib/dates'
import type { ActiveInvite } from '@/lib/household'

export function InviteCard({ invite }: { invite: ActiveInvite | null }) {
  const [current, setCurrent] = useState(invite)
  const [pending, startTransition] = useTransition()

  function generate() {
    startTransition(async () => {
      const result = await createInvite()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCurrent(result.data)
      toast.success('Código gerado.')
    })
  }

  async function copy() {
    if (!current) return
    try {
      await navigator.clipboard.writeText(current.code)
      toast.success('Código copiado.')
    } catch {
      toast.error('Não foi possível copiar. Copie o código manualmente.')
    }
  }

  if (!current) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Gere um código e envie para seu par. Ele vale por 7 dias e pode ser usado uma vez.
        </p>
        <Button onClick={generate} disabled={pending}>
          {pending ? 'Gerando…' : 'Gerar código'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-3xl font-semibold tracking-[0.3em]" aria-label={`Código ${current.code.split('').join(' ')}`}>
        {current.code}
      </p>
      <p className="text-sm text-muted-foreground">Válido até {formatDateBR(current.expiresAt)}.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>
          <Copy className="size-4" aria-hidden />
          Copiar
        </Button>
        <Button variant="outline" onClick={generate} disabled={pending}>
          <RefreshCw className="size-4" aria-hidden />
          {pending ? 'Gerando…' : 'Gerar novo código'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: `page.tsx`**

```tsx
import { LogOut } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { DisplayNameForm } from '@/components/profile/display-name-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/lib/actions/auth'
import { getCurrentUser } from '@/lib/auth'
import { getActiveInvite, getCurrentHousehold, getHouseholdMembers } from '@/lib/household'
import { getMyProfile } from '@/lib/profile'
import { MAX_HOUSEHOLD_MEMBERS } from '@/lib/validation/household'
import { HouseholdNameForm } from './household-name-form'
import { InviteCard } from './invite-card'
import { MembersList } from './members-list'

export const metadata: Metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  const [user, household] = await Promise.all([getCurrentUser(), getCurrentHousehold()])
  if (!user || !household) redirect('/bem-vindo')

  const [members, invite, profile] = await Promise.all([
    getHouseholdMembers(household.id),
    getActiveInvite(household.id),
    getMyProfile(),
  ])
  const canInvite = members.length < MAX_HOUSEHOLD_MEMBERS

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Casa</CardTitle>
          </CardHeader>
          <CardContent>
            <HouseholdNameForm defaultValue={household.name} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seu perfil</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <DisplayNameForm defaultValue={profile?.display_name ?? ''} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Membros</CardTitle>
            <CardDescription>
              {members.length} de {MAX_HOUSEHOLD_MEMBERS}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MembersList members={members} currentUserId={user.id} />
          </CardContent>
        </Card>

        {canInvite ? (
          <Card>
            <CardHeader>
              <CardTitle>Convidar</CardTitle>
            </CardHeader>
            <CardContent>
              <InviteCard invite={invite} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Sessão</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                <LogOut className="size-4" aria-hidden />
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Verificar**

Run: `npm test && npm run lint && npm run build`
Expected: tudo passa.

Com `npm run dev`, logado como Gustavo (que já tem casa):
1. Em `/configuracoes`, renomeie a casa para "Casa do Gustavo e da Paula": aparece um toast e o menu lateral atualiza o nome.
2. Altere o próprio nome: aparece um toast.
3. Clique em "Gerar código": aparecem o código, "Válido até dd/mm/aaaa" (7 dias à frente) e o botão "Copiar". Recarregue a página: o mesmo código continua ativo.
4. Abra uma janela anônima, entre como Paula, informe o nome, use o código digitado em minúsculas e caia em `/inicio`.
5. De volta à janela do Gustavo, recarregue: os membros aparecem como "2 de 2" e o cartão "Convidar" some.
6. Clique em "Sair": você volta para `/login`.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/household.ts "app/(app)/configuracoes"
git commit -m "feat(configuracoes): nome da casa e do perfil, membros, convite e sair" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: README, verificação final e parada para revisão

**Files:**
- Create: `README.md` (substitui o gerado pelo create-next-app)

**Interfaces:**
- Consumes: tudo acima
- Produces: documentação de setup e o checklist de deploy

- [ ] **Step 1: Escrever o `README.md`**

````markdown
# CD — Controle de Danos

App de finanças do casal (Gustavo e Paula). PRD em [docs/PRD.md](docs/PRD.md); specs e planos por fase em [docs/superpowers/](docs/superpowers/).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 + shadcn/ui · Supabase (Postgres, Auth, RLS) · Vitest · Vercel.

## Rodando localmente

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha com a URL e a anon key do projeto Supabase.
3. `npm run dev` e abra http://localhost:3000

## Usuários

Não há cadastro pelo app. Crie os usuários no painel do Supabase em **Authentication → Users → Add user**, com **"Auto Confirm User"** marcado. O cadastro público fica desligado em **Authentication → Sign In / Providers → "Allow new users to sign up"**.

No primeiro acesso, cada um informa o nome. O primeiro cria a casa e gera um código de convite em **Configurações**; o segundo entra com esse código.

## Banco de dados

- Migrations em `supabase/migrations/`. Aplicar: `npm run db:push` (requer `npx supabase login` e `npx supabase link --project-ref <ref>`).
- Tipos TypeScript: `npm run db:types` (gera `lib/supabase/database.types.ts`). Rode depois de cada migration.

## Testes

- `npm test`: regras puras em `lib/` (sem banco).
- `npm run test:rls`: integração contra o projeto Supabase. Precisa de `.env.test.local` com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Cria e apaga usuários de teste. A service_role key **nunca** vai para o app nem para a Vercel.

## Deploy (Vercel)

1. Crie um repositório no GitHub e faça o push deste projeto.
2. Na Vercel, importe o repositório.
3. Defina as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Faça o deploy. Como não há fluxos por e-mail, não é preciso configurar Site URL nem Redirect URLs no Supabase.
````

- [ ] **Step 2: Rodar toda a verificação automatizada**

Run: `npm test && npm run test:rls && npm run lint && npm run build`
Expected: os quatro passam. Copie o resumo de cada um para o relatório.

- [ ] **Step 3: Verificar a ausência de rolagem horizontal**

Com `npm run dev`, peça ao usuário para conferir no DevTools (modo dispositivo), em 360px e em 1440px: `/login`, `/bem-vindo` (com um usuário sem casa, se houver), `/inicio`, `/configuracoes` e o sheet "Mais". Expected: nada vaza horizontalmente em 360px; em 1440px, o menu lateral aparece e o conteúdo fica limitado a 1280px.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README com setup, usuários, banco, testes e deploy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: PARAR para revisão da Fase 1**

Apresente ao usuário, em pt-BR:
- os critérios de aceite da spec (seção 11), cada um marcado com a evidência (saída de teste ou passo manual feito);
- o que ficou pendente com ele: deploy na Vercel (checklist do README) e criação do repositório no GitHub;
- uma pergunta: pode seguir para o brainstorming da Fase 2?

Não comece a Fase 2 sem aprovação.
