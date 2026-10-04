# CD — Controle de Danos

App de finanças do casal (Gustavo e Paula). PRD em [docs/PRD.md](docs/PRD.md); specs e planos por fase em [docs/superpowers/](docs/superpowers/).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 + shadcn/ui (Radix) · Supabase (Postgres, Auth, RLS) · Vitest · Vercel.

## Rodando localmente

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha com a URL e a publishable key do projeto Supabase.
3. `npm run dev` e abra http://localhost:3000

> No Windows, se o PowerShell bloquear o `npx`/`npm` ("execução de scripts foi desabilitada"), use `npx.cmd`/`npm.cmd` ou rode `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Usuários

Não há cadastro pelo app. Crie os usuários no painel do Supabase em **Authentication → Users → Add user**, com **"Auto Confirm User"** marcado. O cadastro público fica desligado em **Authentication → Sign In / Providers → "Allow new users to sign up"**.

No primeiro acesso, cada um informa o nome. O primeiro cria a casa e gera um código de convite em **Configurações**; o segundo entra com esse código.

## Funcionalidades (até a Fase 2)

- **Contas** (`/contas`): corrente, poupança, carteira e investimento, com saldo inicial e data. O saldo considera só lançamentos pagos a partir dessa data. Cada conta tem extrato mensal com saldo acumulado.
- **Categorias** (`Configurações → Categorias`): receita e despesa, um nível de subcategoria, ícone e cor. As 19 categorias padrão são criadas com a casa.
- **Lançamentos** (`/lancamentos` e botão "+"): receita, despesa e transferência; status automático pela data; conta pré-selecionada com a última usada por cada pessoa; busca em todo o histórico, filtros na URL e "Desfazer" ao excluir.
- Contas e categorias com lançamentos não podem ser excluídas, só arquivadas.

## Banco de dados

- Migrations em `supabase/migrations/`. Aplicar: `npm run db:push` (requer `npx supabase login` e `npx supabase link --project-ref <ref>`).
- Tipos TypeScript: `npm run db:types` (gera `lib/supabase/database.types.ts`). Rode depois de cada migration.
- Toda tabela nova precisa de `household_id` com RLS habilitado e a policy `public.is_household_member(household_id)`.

## Testes

- `npm test`: regras puras em `lib/` (sem banco).
- `npm run test:rls`: integração contra o projeto Supabase. Precisa de `.env.test.local` com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (a secret key). Cria e apaga usuários de teste. A secret key **nunca** vai para o app nem para a Vercel.

## Deploy (Vercel)

1. Crie um repositório no GitHub e faça o push deste projeto.
2. Na Vercel, importe o repositório.
3. Defina as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Faça o deploy. Como não há fluxos por e-mail, não é preciso configurar Site URL nem Redirect URLs no Supabase.
