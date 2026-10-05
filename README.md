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

## Funcionalidades (até a Fase 6)

- **Contas** (`/contas`): corrente, poupança, carteira e investimento, com saldo inicial e data. O saldo considera só lançamentos pagos a partir dessa data. Cada conta tem extrato mensal com saldo acumulado.
- **Categorias** (`Configurações → Categorias`): receita e despesa, um nível de subcategoria, ícone e cor. As 19 categorias padrão são criadas com a casa.
- **Lançamentos** (`/lancamentos` e botão "+"): receita, despesa e transferência; status automático pela data; conta pré-selecionada com a última usada por cada pessoa; busca em todo o histórico, filtros na URL e "Desfazer" ao excluir.
- **Cartões** (`/cartoes`): limite, dia de fechamento e de vencimento, conta padrão de pagamento e uso do limite com alerta em 80% e 100%. Mudar os dias recalcula as faturas abertas e futuras e redistribui as compras delas; as fechadas não mudam.
- **Faturas** (`/cartoes/[id]`): criadas automaticamente pelo mês de fechamento (compra no dia do fechamento vai para a seguinte); status calculado (aberta, fechada, paga, vencida). Pagamento total ou parcial a partir de uma conta: sai do saldo, mas não é despesa. Estorno é uma receita no cartão e abate o total.
- **Compras parceladas** (botão "+", "Pagar com" um cartão): 1 a 24 parcelas, com o resto dos centavos na primeira; compra já em andamento ("parcela 3 de 10"); editar ou excluir "só esta parcela" ou "esta e as futuras", com "Desfazer".
- **Parcelas** (`/parcelas`): todas as parcelas futuras de todos os cartões por mês de vencimento, com total por mês e por cartão.
- **Recorrências** (botão "+", "Repetir"): semanal, mensal ou anual, com data final opcional, em conta, transferência ou compra à vista no cartão. O app gera os lançamentos como previstos até 12 meses à frente ao ser aberto; no cartão, cada um cai na fatura certa e só ocupa o limite quando a data chega. Editar ou excluir um lançamento da série pergunta "só este" ou "este e os próximos" (os já pagos nunca mudam), com "Desfazer".
- **Tela Recorrências** (`/recorrencias`): séries ativas com a próxima data, edição (valor, conta/cartão, frequência, próxima data, data final) e encerrar; encerradas ficam numa lista à parte.
- **Orçamento** (`/orcamento`): limite mensal por categoria de despesa (subcategorias somam na mãe), "a partir deste mês" ou "só este mês". A barra mostra realizado e previsto; alerta "Atenção" em 80% e "Estourado" em 100%.
- **Início** (`/inicio`): receitas, despesas e saldo do mês (realizado e previsto), saldo das contas hoje, despesas por categoria (rosca, com link para Lançamentos), receitas x despesas dos últimos 6 meses, faturas abertas e fechadas a pagar, comprometimento futuro (parcelas e assinaturas no cartão nos próximos 6 meses) e as 5 categorias mais perto do limite do orçamento.
- **Relatórios** (`/relatorios`): despesas por categoria no período (Mês, Trimestre, Semestre, Ano ou 12 meses) comparadas com o período anterior; evolução mensal de 12 meses com saldo; gastos por cartão por mês (estornos abatem).
- **Exportar CSV** (`/lancamentos`, botão "Exportar CSV"): baixa as linhas da tela (mês, filtros e busca) em CSV para Excel em português (`;`, vírgula decimal, acentos).
- Contas, categorias e cartões com lançamentos não podem ser excluídos, só arquivados. Conta, cartão ou categoria usados por uma recorrência ativa só são arquivados depois de encerrar a recorrência.
- **Imóvel** (`/imovel`): cadastro do imóvel na planta (construtora, unidade, valor, contrato, previsão das chaves e dados do financiamento); gastos com previsto x pago, vencimento, favorecido e fonte (recursos próprios, FGTS ou financiamento), com "Atrasado" calculado; gerador do plano de pagamento (mensais, intermediárias a cada 6 ou 12 meses e chaves) com prévia e "Desfazer"; abas Resumo (totais, % pago, correção INCC, taxa de obra, por fonte e próximo pagamento), Cronograma (previsto x realizado por mês até as chaves), Por tipo e Gastos (filtros por tipo, status, fonte e período). Pagar com recursos próprios cria um único lançamento na categoria Imóvel (conta ou cartão), só leitura em Lançamentos ("Editar no Imóvel"); FGTS e financiamento não geram lançamento.
- **Tipos de gasto do imóvel** (`Configurações → Tipos de gasto do imóvel`): os 21 tipos padrão do PRD, editáveis, mais os que vocês criarem; tipos em uso só são arquivados.

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
