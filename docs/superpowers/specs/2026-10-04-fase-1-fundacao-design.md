# Fase 1 — Fundação: design

Data: 04/10/2026 · Referência geral: [docs/PRD.md](../../PRD.md) (seções 3, 4, 9 e 10)

## Objetivo

Entregar o esqueleto funcional do CD: projeto Next.js com tema escuro e layout responsivo, Supabase na nuvem com a base do schema e RLS, e o fluxo de login, criação da casa e convite do parceiro. Nenhuma funcionalidade financeira entra nesta fase; as telas do app existem como placeholders navegáveis.

## Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Supabase | Projeto na nuvem (plano grátis). Sem Docker. Migrations aplicadas com `supabase db push`. |
| Usuários | Desvio do PRD: **sem cadastro pelo app**. Os dois usuários (Gustavo e Paula) são criados pelo painel do Supabase com "Auto Confirm User". O cadastro público fica desligado no Supabase ("Allow new users to sign up" = off), para que ninguém se cadastre pela API. |
| Recuperação de senha | Desvio do PRD: fora do MVP. Troca de senha é feita pelo painel do Supabase. Sem e-mails transacionais. |
| Schema | Incremental: cada fase cria as próprias tabelas. A Fase 1 cria só a base. |
| `display_name` | Desvio do PRD: fica **só** em `profiles`, não em `household_members`. |
| Casas por usuário | Uma casa por usuário no MVP (regra das funções RPC; o schema não impede mais). |
| Rotas | Em português (`/lancamentos`, `/cartoes`, ...). |
| Repositório | Git próprio em `gusfer/`, separado do repositório da pasta-pai. |

## 1. Stack

Versões estáveis em 04/10/2026: Next.js 16.3 (App Router), React 19.3, TypeScript strict, Tailwind CSS 4.3, shadcn 4.21, lucide-react, @supabase/ssr 0.12 + @supabase/supabase-js 2, zod 4, react-hook-form 7, date-fns 4 (locale pt-BR), Vitest 5. Gerenciador: npm. Recharts entra só na Fase 5.

## 2. Estrutura de pastas

```
gusfer/
  app/
    (auth)/login/
    (onboarding)/bem-vindo/  ← seu nome + criar casa OU entrar com código
    (app)/layout.tsx         ← AppShell: BottomNav (mobile) + Sidebar (desktop) + Fab
    (app)/inicio/ lancamentos/ cartoes/ parcelas/ contas/ imovel/
          relatorios/ orcamento/  ← placeholders
    (app)/configuracoes/     ← funcional na Fase 1
  components/ui/             ← shadcn
  components/layout/         ← BottomNav, Sidebar, MoreSheet, MonthSelector, Fab
  lib/supabase/              ← client.ts (browser), server.ts (RSC/actions), proxy.ts (sessão)
  lib/finance/money.ts       ← formatação/parse de BRL em centavos
  lib/validation/            ← schemas zod compartilhados cliente/servidor
  lib/supabase/database.types.ts  ← gerado (npm run db:types)
  supabase/migrations/
  tests/rls/                 ← testes de integração do RLS
  proxy.ts                   ← Next 16: substitui o middleware
```

## 3. Proteção de rotas

- `proxy.ts` renova a sessão do Supabase em toda requisição (padrão do @supabase/ssr) e redireciona para `/login` quem não está autenticado e tenta acessar `(app)` ou `(onboarding)`.
- Usuário autenticado que acessa `(auth)` vai para `/inicio`.
- O layout de `(app)` consulta a casa do usuário; sem casa → redirect para `/bem-vindo`. O layout de `(onboarding)` faz o inverso: com casa → `/inicio`.
- `/` redireciona para `/inicio`.

## 4. Layout e tema

**Celular (< 1024px):** barra inferior fixa com Início, Lançamentos, botão "+" central, Cartões e Mais. "Mais" abre um bottom sheet com Parcelas, Contas, Imóvel, Relatórios, Orçamento e Configurações. A barra usa `padding-bottom: env(safe-area-inset-bottom)` e o viewport tem `viewport-fit=cover`. O conteúdo tem padding inferior suficiente para não ficar escondido sob a barra.

**Desktop (≥ 1024px):** menu lateral fixo com todos os itens (o "+" vira um botão "Novo lançamento" no topo do menu); conteúdo com `max-width: 1280px`.

**Seletor de mês:** componente `MonthSelector` no topo de todas as telas exceto Configurações, mostrando "‹ Outubro 2026 ›". O mês fica na URL (`?mes=2026-10`); sem parâmetro, usa o mês atual no fuso America/Sao_Paulo. Na Fase 1 só navega, sem filtrar dados.

**Botão "+":** abre um sheet (mobile) ou dialog (desktop) com o aviso "Em breve". O formulário real entra na Fase 2.

**Tema:** só escuro, sem alternância. Tokens do PRD 9.1 no `:root`, mapeados para as variáveis do shadcn:

| shadcn | Token PRD |
|---|---|
| `--background` | `--background` #0B0F14 |
| `--card`, `--popover` | `--surface` #131A22 |
| `--muted`, `--accent`, `--secondary` | `--surface-2` #1B2430 |
| `--border`, `--input` | `--border` #263241 (o `Input` do shadcn é ajustado para fundo `surface-2`) |
| `--foreground` | `--text` #E6EDF3 |
| `--muted-foreground` | `--text-muted` #8B98A5 |
| `--primary` | `--primary` #3B82F6 (texto do botão em #0B0F14: contraste 5,2:1; branco daria 3,7:1 e reprovaria no AA) |
| `--destructive` | `--expense` #EF4444 |

Tokens extras expostos ao Tailwind: `income`, `expense`, `warning`, `surface`, `surface-2`. Valores monetários usam `tabular-nums` e ficam alinhados à direita. `<html lang="pt-BR">`.

## 5. Banco de dados

### 5.1 Tabelas

Colunas comuns (onde aplicável): `id uuid pk default gen_random_uuid()`, `created_by uuid default auth.uid() references auth.users`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` com trigger.

| Tabela | Colunas | Notas |
|---|---|---|
| `households` | id, name (1–80 chars), created_by, created_at, updated_at | |
| `household_members` | household_id → households, user_id → auth.users, role (`owner`, `member`), created_at | PK (household_id, user_id); `on delete cascade` em ambos |
| `household_invites` | id, household_id → households, code (unique, 6 chars), expires_at, used_at, used_by → auth.users, created_by, created_at, updated_at | |
| `profiles` | user_id pk → auth.users (`on delete cascade`), display_name (nullable, 1–60 chars quando preenchido), avatar_url, created_at, updated_at | Criado por trigger em `auth.users` insert, com `display_name` vazio (usuários criados pelo painel não têm nome); o nome é preenchido em `/bem-vindo` |

Roles e enums são `text` com `check`, não tipos enum do Postgres (mais fáceis de alterar via migration).

### 5.2 Funções (todas `security definer`, `set search_path = ''`, nomes qualificados com `public.`)

- `set_updated_at()` — trigger `before update`.
- `handle_new_user()` — trigger `after insert on auth.users`, cria o `profiles`. A migration também faz backfill (`insert into profiles select id from auth.users on conflict do nothing`) para usuários criados antes dela.
- `is_household_member(hid uuid) returns boolean` — `stable`; verifica `household_members` para `auth.uid()`.
- `shares_household_with(other uuid) returns boolean` — `stable`; usada na policy de `profiles`.
- `create_household(p_name text) returns uuid` — erro se o usuário já pertence a alguma casa; insere `households` e `household_members` (role `owner`) na mesma transação. Ponto de extensão: a Fase 2 adiciona aqui o seed de categorias.
- `create_invite() returns table(code text, expires_at timestamptz)` — exige ser membro de uma casa; falha com `HOUSEHOLD_FULL` se a casa já tem 2 membros; marca como expirados (`expires_at = now()`) os convites não usados da casa; gera código de 6 caracteres do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sem 0/O, 1/I/L); repete em caso de colisão; validade `now() + interval '7 days'`.
- `redeem_invite(p_code text) returns uuid` — normaliza para maiúsculas e sem espaços; `select ... for update` no convite; falha com mensagens distintas para: código inexistente, já usado, expirado, casa cheia (≥ 2 membros), usuário já tem casa. Em sucesso insere o membro (role `member`), preenche `used_at`/`used_by` e retorna o `household_id`.

`execute` dessas RPCs liberado só para `authenticated`; revogado de `anon` e `public`.

### 5.3 RLS

RLS habilitado em todas as tabelas.

| Tabela | select | insert | update | delete |
|---|---|---|---|---|
| `households` | `is_household_member(id)` | — (via RPC) | `is_household_member(id)` | — |
| `household_members` | `is_household_member(household_id)` | — (via RPC) | — | — |
| `household_invites` | `is_household_member(household_id)` | — (via RPC) | — | — |
| `profiles` | próprio, ou usuário que divide uma casa com `auth.uid()` | — (via trigger) | próprio | — |

**Padrão obrigatório para tabelas das próximas fases:** coluna `household_id uuid not null references households on delete cascade`, RLS habilitado, policy `for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))`.

### 5.4 Tipos

`npm run db:types` → `supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts`. Os clientes Supabase são tipados com `Database`.

## 6. Telas e fluxos

1. **Login** (`/login`): e-mail e senha, sem links de cadastro ou recuperação. Sucesso → `/inicio` (o layout redireciona para `/bem-vindo` se ainda não houver casa).
2. **Boas-vindas** (`/bem-vindo`): primeiro o campo "Como você quer ser chamado(a)?" (preenchido se o perfil já tiver nome); depois dois cartões, "Criar nossa casa" (campo nome, com sugestão "Casa de <seu nome>") e "Tenho um código de convite" (campo de 6 caracteres, maiúsculas automáticas). A ação salva o nome no `profiles` e chama a RPC. Sucesso → `/inicio`.
3. **Configurações** (`/configuracoes`):
   - **Casa:** editar o nome.
   - **Perfil:** editar o próprio nome.
   - **Membros:** lista com nome e papel.
   - **Convite:** visível enquanto a casa tem menos de 2 membros. Mostra o convite ativo (código, botão copiar, "válido até dd/mm/aaaa") ou o botão "Gerar código".
   - **Sair:** `signOut` → `/login`.
4. **Início e demais telas do app:** título da tela, seletor de mês e um estado vazio "Disponível em breve".

## 7. Código: convenções

- Mutações via Server Actions em `lib/actions/` (compartilhadas entre onboarding e configurações). Cada action valida a entrada com o mesmo schema zod do formulário e retorna `{ ok: true } | { ok: false, error: string, fieldErrors? }`.
- Formulários com react-hook-form + `zodResolver`.
- Erros do Supabase Auth e das RPCs traduzidos para pt-BR em `lib/supabase/errors.ts` (ex.: `invalid_credentials` → "E-mail ou senha incorretos"). As RPCs lançam erros com códigos próprios (`INVITE_NOT_FOUND`, `INVITE_USED`, `INVITE_EXPIRED`, `HOUSEHOLD_FULL`, `ALREADY_MEMBER`) mapeados para mensagens.
- Toasts com o componente `sonner` do shadcn.
- `lib/finance/money.ts`: `formatBRL(cents)`, `parseBRL(input) → cents | null`, usando `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`. Entra já na Fase 1 por ser base de todas as outras.
- Variáveis de ambiente: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `.env.local`. `.env.example` versionado; `.env*.local` no `.gitignore`.

## 8. Testes

- **Unitários (`npm test`, Vitest):** `money.ts` (formatação, parse com e sem "R$", vírgula/ponto, valores inválidos, negativos) e os schemas zod (login, nome do usuário, nome da casa, código de convite).
- **Integração RLS (`npm run test:rls`, Vitest com config separada):** roda contra o projeto na nuvem. Como o cadastro público está desligado, cria usuários de teste com e-mails aleatórios via `auth.admin.createUser({ email_confirm: true })` (cliente service_role) e faz login com cada um via `signInWithPassword` (cliente anon, que é o que o teste exercita). Cobre:
  1. A cria uma casa e um convite.
  2. B (sem casa) não lê `households`, `household_members`, `household_invites` nem o `profiles` de A.
  3. B não consegue inserir em `household_members` diretamente.
  4. B resgata o código → passa a ler a casa, os membros e o perfil de A.
  5. O mesmo código falha uma segunda vez (`INVITE_USED`).
  6. Com a casa de A cheia (A + B), A tenta gerar novo convite e é recusado (`HOUSEHOLD_FULL`). (O mesmo check em `redeem_invite` é defesa em profundidade.)
  7. C cria a própria casa; depois tenta criar outra e tenta resgatar um convite, e ambos são recusados (`ALREADY_MEMBER`).
  8. Código expirado é recusado (`INVITE_EXPIRED`): o teste ajusta `expires_at` para o passado usando o cliente service_role.

  9. `signUp` com a anon key é recusado (prova que o cadastro público está desligado).

  A criação e a limpeza (apagar as casas criadas e depois os usuários de teste) usam `SUPABASE_SERVICE_ROLE_KEY` lida **apenas** de `.env.test.local`, que nunca é importado pelo app.
- **Manual:** rodar `npm run dev` e verificar as telas em 360px e 1440px.

## 9. Deploy

O repositório git fica em `gusfer/`. No fim da fase, com ações do usuário:

1. Criar o repositório no GitHub (manual ou via `gh`) e fazer o push.
2. Importar na Vercel e definir `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Como não há fluxos por e-mail, não é preciso configurar Site URL nem Redirect URLs no Supabase.

Esse checklist fica no `README.md`.

## 10. Pré-requisitos do usuário

- Criar o projeto em supabase.com e informar a URL, a anon key e a service_role key (esta só para `.env.test.local`).
- Rodar `npx supabase login` para o CLI poder vincular o projeto (`supabase link`) e aplicar migrations.
- No painel do Supabase (Authentication → Sign In / Providers): desligar "Allow new users to sign up".
- No painel do Supabase (Authentication → Users → Add user → Create new user): criar os usuários do Gustavo e da Paula com "Auto Confirm User" marcado. Isso pode ser feito depois que as migrations forem aplicadas, para o trigger já criar os `profiles`; usuários criados antes ganham o perfil por um backfill na própria migration.

## 11. Critérios de aceite da Fase 1

1. Os dois usuários criados no painel fazem login; um informa o nome, cria a casa e gera o convite; o outro informa o nome e entra com o código; os dois veem a mesma casa e os mesmos membros em Configurações.
2. `npm run test:rls` passa.
3. Todas as telas funcionam sem rolagem horizontal em 360px e usam o espaço em 1440px (menu lateral + conteúdo até 1280px).
4. `npm test`, `npm run lint` e `npm run build` passam sem erros.

## Fora do escopo da Fase 1

Cadastro pelo app e recuperação de senha (desvios do PRD, ver decisões); contas, categorias, lançamentos e qualquer tabela financeira; formulário de lançamento; avatar (a coluna existe, sem upload); sair da casa ou remover membro; deploy automatizado além do checklist.
