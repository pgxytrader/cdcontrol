# Fase 2 — Contas, categorias e lançamentos: design

Data: 04/10/2026 · Referência geral: [docs/PRD.md](../../PRD.md) (seções 5.2, 5.3, 5.6, 7, 8.1, 8.5, 8.7, 9.3) · Fase anterior: [Fase 1](2026-10-04-fase-1-fundacao-design.md)

## Objetivo

Permitir que o casal cadastre contas e categorias, lance receitas, despesas e transferências em menos de 10 segundos no celular, veja a lista do mês com busca e filtros e acompanhe o saldo e o extrato de cada conta.

## Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Status padrão do lançamento | Automático pela data: hoje ou passado → `paid`; futuro → `pending`. O usuário pode trocar antes de salvar. |
| Conta pré-selecionada | A última conta usada **por quem está lançando**, salva em `profiles.last_account_id` (vale em todos os aparelhos). |
| Saldo inicial | Lançamentos com data **anterior** a `initial_balance_date` não entram no saldo. O formulário avisa. |
| Busca | Sem texto: mostra o mês do seletor. Com texto: procura em todo o histórico (até 200 resultados, agrupados por mês). Filtros valem nos dois modos. |
| Cálculo de saldo | View SQL `v_account_balances` (security_invoker) para o saldo atual + funções puras em `lib/finance` para extrato e resumo, com a mesma regra testada dos dois lados. |
| Schema incremental | `transactions` nasce só com as colunas da Fase 2. Cartão, fatura, parcela e recorrência entram por migration nas Fases 3 e 4. |
| Transferência | Uma linha com `account_id` (origem) e `destination_account_id`; sem categoria; não é receita nem despesa (PRD 8.5). |
| Categoria do lançamento | Pode ser categoria ou subcategoria; totais da categoria somam as subcategorias. |
| Gestão de categorias | Em `/configuracoes/categorias` (o menu do PRD 9.2 não tem item próprio). |
| Categorias padrão | Criadas por `create_household` e por backfill para casas existentes; editáveis, arquiváveis e excluíveis como as demais. |

## 1. Banco de dados

Migration nova em `supabase/migrations/`. Todas as tabelas seguem o padrão da Fase 1: colunas comuns (`id`, `household_id not null references households on delete cascade`, `created_by default auth.uid()`, `created_at`, `updated_at` com trigger `set_updated_at`), RLS habilitado e policy `for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))`. `revoke all ... from anon`.

### 1.1 Tabelas

**`accounts`**

| Coluna | Tipo / regra |
|---|---|
| `name` | text, 1–60 caracteres (após trim) |
| `institution` | text nullable, até 60 |
| `type` | text check in (`checking`, `savings`, `cash`, `investment`) |
| `initial_balance_cents` | bigint not null default 0 (pode ser negativo) |
| `initial_balance_date` | date not null |
| `color` | text check `^#[0-9a-f]{6}$` |
| `archived` | boolean not null default false |

**`categories`**

| Coluna | Tipo / regra |
|---|---|
| `name` | text, 1–40 caracteres |
| `kind` | text check in (`income`, `expense`) |
| `parent_id` | uuid nullable references categories on delete restrict |
| `icon` | text not null (nome de ícone da lista fixa, validado no app) |
| `color` | text check `^#[0-9a-f]{6}$` |
| `is_default` | boolean not null default false |
| `archived` | boolean not null default false |

- Unique `(household_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'), lower(name))` — sem nomes repetidos no mesmo nível.
- Trigger `categories_check_parent` (before insert/update): se `parent_id` não é nulo, o pai precisa existir na mesma casa, ter o mesmo `kind` e não ter pai; e uma categoria que já tem filhas não pode virar subcategoria. Erro: `INVALID_PARENT`.

**`transactions`**

| Coluna | Tipo / regra |
|---|---|
| `type` | text check in (`income`, `expense`, `transfer`) |
| `description` | text, 1–120 caracteres |
| `amount_cents` | bigint check `> 0` |
| `date` | date not null |
| `status` | text check in (`paid`, `pending`) |
| `category_id` | uuid nullable references categories on delete restrict |
| `account_id` | uuid not null references accounts on delete restrict |
| `destination_account_id` | uuid nullable references accounts on delete restrict |
| `source` | text not null default `manual` check in (`manual`, `recurrence`, `property`, `import`) |
| `external_id` | text nullable |
| `notes` | text nullable, até 500 |

Checks:
- `type in ('income','expense')` ⇒ `category_id is not null and destination_account_id is null`.
- `type = 'transfer'` ⇒ `category_id is null and destination_account_id is not null and destination_account_id <> account_id`.
- Unique `(household_id, external_id)` onde `external_id is not null`.

Trigger `transactions_check_refs` (before insert/update, security definer, `search_path = ''`): `account_id`, `destination_account_id` e `category_id` precisam pertencer ao mesmo `household_id` do lançamento (erros `INVALID_ACCOUNT`, `INVALID_CATEGORY`); o `kind` da categoria precisa ser igual ao `type` (erro `CATEGORY_KIND_MISMATCH`).

Índices: `transactions (household_id, date)`, `transactions (account_id)`, `transactions (destination_account_id)`, `transactions (category_id)`.

**`profiles`** ganha `last_account_id uuid references accounts on delete set null`, com `grant update (last_account_id)` para `authenticated`.

### 1.2 View `v_account_balances`

`create view ... with (security_invoker = true)`: uma linha por conta com `account_id`, `household_id` e `balance_cents` =
`initial_balance_cents`
\+ soma de `income` pagas com `account_id` = conta
− soma de `expense` pagas com `account_id` = conta
\+ soma de `transfer` pagas com `destination_account_id` = conta
− soma de `transfer` pagas com `account_id` = conta,
considerando só lançamentos com `date >= initial_balance_date`.

### 1.3 Categorias padrão

Função interna `seed_default_categories(hid uuid)` (security definer, sem `execute` para `authenticated`), chamada por `create_household` (que é recriada para incluí-la) e pela migration para cada casa existente (idempotente: não duplica se já existirem categorias padrão na casa).

| Tipo | Nome | Ícone (lucide) | Cor |
|---|---|---|---|
| Despesa | Moradia | `house` | #3b82f6 |
| Despesa | Mercado | `shopping-cart` | #22c55e |
| Despesa | Alimentação fora | `utensils-crossed` | #f97316 |
| Despesa | Transporte | `car` | #eab308 |
| Despesa | Saúde | `heart-pulse` | #ef4444 |
| Despesa | Educação | `graduation-cap` | #a855f7 |
| Despesa | Lazer | `gamepad-2` | #ec4899 |
| Despesa | Assinaturas | `repeat` | #14b8a6 |
| Despesa | Vestuário | `shirt` | #f59e0b |
| Despesa | Pets | `paw-print` | #f97316 |
| Despesa | Presentes | `gift` | #ec4899 |
| Despesa | Viagem | `plane` | #3b82f6 |
| Despesa | Imóvel | `building-2` | #14b8a6 |
| Despesa | Outros | `circle-ellipsis` | #64748b |
| Receita | Salário | `briefcase` | #22c55e |
| Receita | Freelance | `laptop` | #3b82f6 |
| Receita | Rendimentos | `trending-up` | #14b8a6 |
| Receita | Reembolso | `undo-2` | #a855f7 |
| Receita | Outros | `circle-ellipsis` | #64748b |

### 1.4 Exclusão (PRD 8.7)

FKs `on delete restrict`: excluir conta ou categoria com lançamentos (ou categoria com subcategorias) falha com `23503`, traduzido para "Não é possível excluir: há lançamentos ou subcategorias vinculados. Arquive em vez de excluir." A interface oferece **Arquivar** nesses casos. Itens arquivados somem dos seletores mas continuam aparecendo nos lançamentos antigos; arquivar uma categoria-pai esconde também suas filhas dos seletores.

## 2. Regras de negócio (`lib/finance/`, funções puras com testes)

| Função | Contrato |
|---|---|
| `defaultStatus(date: string, today: string): 'paid' \| 'pending'` | `date <= today` → `paid`; senão `pending`. Datas `AAAA-MM-DD`; `today` vem de `todayISO()` (fuso de SP, em `lib/dates.ts`). |
| `accountBalance(account, transactions): number` | Mesma regra da view (seção 1.2). |
| `buildStatement(account, transactions, ym): Statement` | `{ openingCents, rows: { transaction, deltaCents, runningCents \| null }[], closingCents, beforeInitialDate: boolean }`. Abertura = saldo pela regra até o dia anterior ao 1º do mês. Linhas ordenadas por data e `created_at`. Pendentes e lançamentos anteriores ao saldo inicial aparecem com `runningCents = null` e não alteram o acumulado. |
| `summarizeMonth(transactions): MonthSummary` | `{ income: { paid, pending }, expense: { paid, pending }, balancePaid, balanceProjected }`; transferências ignoradas. |
| `maskCurrencyInput(raw: string): { display: string; cents: number }` | Dígitos entram pela direita (`"1234"` → `"12,34"`, 1234); ignora não dígitos, aceita colar `"R$ 1.234,56"`; limite de 11 dígitos. |

Outros utilitários: `todayISO(now?)` e `monthBounds(ym)` (primeiro dia do mês e primeiro dia do mês seguinte, `AAAA-MM-DD`) em `lib/dates.ts`; `rankCategories(categoryIds: string[], limit)` em `lib/categories.ts` (mais frequentes primeiro, empate pela ordem de primeira aparição); listas fixas `CATEGORY_ICONS` (~30 ícones lucide) e `COLOR_PALETTE` (10 cores) em `lib/categories.ts`.

## 3. Server Actions e consultas

Validação com schemas zod em `lib/validation/` (`account.ts`, `category.ts`, `transaction.ts`), compartilhados com os formulários. Retorno `ActionResult` (Fase 1). Erros do banco traduzidos em `lib/supabase/errors.ts` (novos códigos: `INVALID_PARENT`, `INVALID_ACCOUNT`, `INVALID_CATEGORY`, `CATEGORY_KIND_MISMATCH`, `23503`, `23505` → "Já existe uma categoria com esse nome.").

- `lib/actions/accounts.ts`: `createAccount`, `updateAccount`, `setAccountArchived(id, archived)`, `deleteAccount`.
- `lib/actions/categories.ts`: `createCategory`, `updateCategory`, `setCategoryArchived`, `deleteCategory`.
- `lib/actions/transactions.ts`:
  - `createTransaction(input)` — insere e atualiza `profiles.last_account_id` de quem lançou.
  - `updateTransaction(id, input)`.
  - `deleteTransaction(id)` → `ActionResult<TransactionSnapshot>` com a linha apagada.
  - `restoreTransaction(snapshot)` — reinsere com o mesmo `id` (para o "Desfazer").
  - Todas fazem `revalidatePath` de `/lancamentos`, `/contas` e `/inicio`.

Consultas server-only:
- `lib/accounts.ts`: `listAccounts({ includeArchived })` com saldo (join na view), `getAccount(id)`.
- `lib/categories-query.ts`: `listCategories({ kind?, includeArchived })` em árvore; `topCategoryIds(kind, limit = 6)` (lançamentos dos últimos 90 dias + `rankCategories`).
- `lib/transactions.ts`: `listMonthTransactions(ym, filters)`, `searchTransactions(q, filters)` (ilike com `%` e `_` escapados, ordem data desc, limite 200), `listAccountTransactions(accountId)` para o extrato.
- Filtros vêm da URL: `tipo`, `categoria`, `conta`, `status`, `q`, além de `mes`. O filtro `conta` casa com a origem **ou** o destino (transferências aparecem nas duas contas); o filtro `categoria` de uma categoria-mãe inclui as subcategorias. O resumo do mês reflete os filtros ativos.

## 4. Telas

### 4.1 Formulário de lançamento

Componente único `TransactionForm` (criar e editar), aberto pelo "+" (bottom sheet no celular, modal no desktop) e pela lista (editar). Ordem:

1. **Tipo** — controle segmentado Despesa (padrão) / Receita / Transferência.
2. **Valor** — destaque, `autoFocus`, `inputmode="decimal"`, máscara `maskCurrencyInput`.
3. **Descrição.**
4. **Categoria** — chips com as 6 mais usadas do tipo + chip "Todas" que abre a lista completa (subcategorias agrupadas sob a mãe). Oculto na transferência.
5. **Conta** (ou **De** / **Para** na transferência) — pré-selecionada com `last_account_id` se ativa; senão a primeira conta ativa.
6. **Data** — padrão hoje, atalhos "Hoje" e "Ontem".
7. **Status** — segue `defaultStatus` enquanto o usuário não mexer; depois respeita a escolha.
8. **+ Observação** — campo recolhido.

Aviso não bloqueante quando a data é anterior ao saldo inicial da conta: "Este lançamento não afeta o saldo atual desta conta." Ao salvar: fecha e mostra toast "Lançamento salvo". Na edição há botão **Excluir** (com toast "Lançamento excluído" + **Desfazer**). Sem nenhuma conta ativa, o "+" mostra "Cadastre sua primeira conta" com botão para `/contas`.

### 4.2 Lançamentos (`/lancamentos`)

- Topo: seletor de mês (oculto quando há busca) e resumo do mês (receitas, despesas, saldo; realizado e previsto).
- Busca por descrição e botão **Filtros** (sheet no celular, linha no desktop); estado na URL.
- Lista agrupada por dia (ou por mês, na busca), seção **Previsto** acima do realizado. Cada item: ícone e cor da categoria (⇄ para transferência), descrição, conta (ou "Origem → Destino"), valor à direita com `tabular-nums` e sinal **+** (verde) / **−** (vermelho) / sem sinal (transferência).
- Tocar abre a edição. Estado vazio com chamada para o primeiro lançamento.

### 4.3 Contas (`/contas` e `/contas/[id]`)

- `/contas`: saldo total das contas ativas no topo, cards por conta (cor, nome, instituição, ícone do tipo, saldo), **Nova conta** (sheet/modal) e "Mostrar arquivadas".
- `/contas/[id]`: cabeçalho com saldo atual, seletor de mês e extrato (`buildStatement`): saldo de abertura, linhas com saldo acumulado (pendentes marcados "previsto"), saldo final. Ações: editar, arquivar/desarquivar, excluir. Mês anterior à data do saldo inicial mostra "Esta conta começou em dd/mm/aaaa".

### 4.4 Categorias (`/configuracoes/categorias`)

Link a partir de Configurações. Abas Despesa / Receita; lista hierárquica (mãe e filhas indentadas) com ícone e cor; criar categoria ou subcategoria (escolhendo a mãe), editar nome/ícone/cor, arquivar e excluir. Arquivadas em seção recolhida.

### 4.5 Regras de interface

Mobile-first: listas viram cards, sem rolagem horizontal em 360px; desktop até 1280px. Valores sempre com `tabular-nums` à direita; receita/despesa nunca só pela cor (sinal ou ícone). Todos os textos em pt-BR, datas dd/mm/aaaa.

## 5. Testes

**Unitários (`npm test`):** `defaultStatus` (incluindo virada do dia em SP via `todayISO`), `accountBalance` e `buildStatement` (pendentes, transferências nos dois sentidos, lançamentos antes do saldo inicial, saldo inicial negativo, mês sem lançamentos, mês anterior ao saldo inicial), `summarizeMonth` (transferência ignorada), `maskCurrencyInput` (digitar, apagar, colar com "R$", limite), `monthBounds`, `rankCategories`, schemas zod de conta, categoria e lançamento.

**Integração (`npm run test:rls`):**
1. Isolamento de `accounts`, `categories`, `transactions` e `v_account_balances` entre casas (leitura e escrita).
2. Lançamento não aceita conta/categoria de outra casa, mesmo com o id (`INVALID_ACCOUNT`, `INVALID_CATEGORY`).
3. Constraints: valor ≤ 0, transferência para a mesma conta, receita com categoria de despesa (`CATEGORY_KIND_MISMATCH`), subcategoria de subcategoria (`INVALID_PARENT`).
4. A view retorna o mesmo saldo que `accountBalance` para um cenário fixo (com pendente, transferência e lançamento anterior ao saldo inicial).
5. Casa nova nasce com as 19 categorias padrão.
6. Excluir conta com lançamentos é recusado (`23503`).

**Manual:** lançar pelo celular, conferir saldo e extrato, busca e filtros, excluir e desfazer, layout em 360px e 1440px.

## 6. Critérios de aceite da Fase 2

1. Os dois usuários cadastram contas e veem os mesmos saldos.
2. Uma despesa é lançada no celular em menos de 10 segundos, com a conta pré-selecionada.
3. O saldo da conta bate com o extrato, respeitando o saldo inicial e sua data.
4. Transferências alteram o saldo das duas contas e não aparecem como receita nem despesa no resumo do mês.
5. A busca encontra lançamentos de meses anteriores.
6. Contas e categorias com lançamentos só podem ser arquivadas.
7. `npm test`, `npm run test:rls`, `npm run lint` e `npm run build` passam.

## Fora do escopo da Fase 2

Cartões, faturas e parcelas (Fase 3); recorrência e orçamento (Fase 4); dashboard e relatórios, exportação CSV (Fase 5); módulo Imóvel (Fase 6); skeletons e revisão de acessibilidade completa (Fase 7); importação de extratos e anexos (futuro).
