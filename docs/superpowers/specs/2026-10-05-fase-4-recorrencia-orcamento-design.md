# Fase 4 — Recorrência e orçamento: design

Data: 05/10/2026 · Referência geral: [docs/PRD.md](../../PRD.md) (seções 5.3, 5.6, 7, 8.5, 8.6, 9.2) · Fase anterior: [Fase 3](2026-10-04-fase-3-cartoes-faturas-parcelas-design.md)

## Objetivo

Parar de lançar à mão o que se repete (salário, aluguel, contas fixas, assinaturas no cartão) e ver o "previsto" de cada mês já preenchido; e definir um limite mensal por categoria de despesa, com alerta antes de estourar.

## Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Onde criar uma recorrência | No **formulário rápido**, com a linha "Repetir" (semanal, mensal, anual, "Até" opcional). A tela **Recorrências** (em *Mais* / menu lateral) lista, edita e encerra as séries; não cria. |
| Editar/excluir um lançamento da série | Pergunta **"Só este"** ou **"Este e os próximos"**, como nas parcelas. "Este e os próximos" altera a série dali em diante; lançamentos já pagos nunca mudam. |
| Recorrência no cartão e o limite | Gera 12 meses como qualquer série; lançamento de recorrência no cartão com **data futura não ocupa o limite** (passa a ocupar quando a data chega). Parcelas continuam ocupando o limite inteiro. |
| O que conta no orçamento | **Realizado + previsto**: barra em dois tons e alerta (80% / 100%) sobre a soma. Compra no cartão conta na data da compra. |
| "Repetir" no orçamento | Limite com `repeats` vale do mês dele em diante até mudar. Mudar pergunta **"Só este mês"** ou **"A partir deste mês"**. Nada é criado antecipadamente. |
| Mecanismo de geração | **Ao abrir o app**, no servidor: regras em TypeScript (`lib/finance/recurrence.ts`, reaproveitando a regra de fatura da Fase 3) e gravação por RPC atômico, com índice único contra duplicatas. Sem pg_cron e sem lançamentos virtuais. |
| Orçamento e subcategorias | Só categorias de despesa de **primeiro nível**; gastos de subcategorias somam no limite da mãe. |
| Tipos que repetem | Receita, despesa e transferência. Não se repete compra parcelada (parcelas > 1) nem pagamento de fatura. No cartão, só despesa. |
| Série que começa no passado | Gera também as ocorrências entre a data de início e hoje, como pendentes (aparecem como atrasadas no mês delas). |
| Excluir uma série | Não existe; a série é **encerrada** (o histórico pago continua ligado a ela). Encerradas aparecem numa seção recolhível. |
| Arquivar conta, cartão ou categoria | Recusado enquanto houver recorrência **ativa** usando o item ("Encerre as recorrências que usam … antes de arquivar"). |

## 1. Banco de dados

Migration nova em `supabase/migrations/`. Tabelas novas seguem o padrão das fases anteriores: colunas comuns (`id`, `household_id not null references households on delete cascade`, `created_by default auth.uid()`, `created_at`, `updated_at` com trigger `set_updated_at`), RLS habilitado com a policy `for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))` e `revoke all ... from anon`.

### 1.1 `recurrences`

| Coluna | Tipo / regra |
|---|---|
| `type` | `text`, `income`, `expense` ou `transfer` |
| `description` | `text`, 1 a 120 caracteres (após `btrim`) |
| `amount_cents` | `bigint > 0` |
| `category_id` | `uuid references categories` (NO ACTION) |
| `account_id` | `uuid references accounts` (NO ACTION) |
| `destination_account_id` | `uuid references accounts` (NO ACTION) |
| `credit_card_id` | `uuid references credit_cards` (NO ACTION) |
| `frequency` | `text`, `weekly`, `monthly` ou `yearly` |
| `start_date` | `date not null` — âncora da série (dia do mês / dia da semana / dia do ano) |
| `end_date` | `date`, nula ou `>= start_date` |
| `generated_until` | `date not null` — todas as ocorrências com data ≤ este dia já foram geradas |
| `notes` | `text`, até 500 caracteres |

- Check `recurrences_shape`:
  - `income`/`expense`: `category_id` não nulo, `destination_account_id` nulo e **exatamente um** entre `account_id` e `credit_card_id`; `credit_card_id` não nulo ⇒ `type = 'expense'`.
  - `transfer`: `category_id` e `credit_card_id` nulos; `account_id` e `destination_account_id` não nulos e diferentes.
- Trigger `recurrences_check_refs` (security definer, `search_path = ''`): conta, conta destino, cartão e categoria da mesma casa (`INVALID_ACCOUNT`, `INVALID_CARD`, `INVALID_CATEGORY`) e `kind` da categoria igual ao `type` (`CATEGORY_KIND_MISMATCH`).
- Índices: `(household_id)`, `(account_id)`, `(destination_account_id)`, `(credit_card_id)`, `(category_id)`.
- **Ativa** = `end_date` nula ou `end_date >= hoje`.

### 1.2 `transactions` (alterações)

- Colunas novas:
  - `recurrence_id uuid references recurrences on delete set null`;
  - `occurrence_date date` — a data prevista na série; não muda quando o lançamento é editado "só este".
- Check `transactions_recurrence_shape`: `recurrence_id` não nulo ⇒ `occurrence_date` não nulo, `installment_plan_id` nulo e `type <> 'invoice_payment'`.
- Índice único parcial `(recurrence_id, occurrence_date) where recurrence_id is not null` — impede ocorrências duplicadas quando os dois abrem o app ao mesmo tempo.
- Índice `(recurrence_id)`.
- `transactions_check_refs` passa a validar `recurrence_id` da mesma casa (`INVALID_RECURRENCE`).
- Todo lançamento ligado a uma série (inclusive o primeiro, salvo pelo formulário) grava `source = 'recurrence'`.

### 1.3 `budgets`

| Coluna | Tipo / regra |
|---|---|
| `category_id` | `uuid not null references categories on delete cascade` |
| `month` | `date not null`, dia 1 (check `extract(day from month) = 1`) |
| `amount_cents` | `bigint >= 0` — 0 significa "sem orçamento" |
| `repeats` | `boolean not null default false` |

- Unique `(category_id, month)`; índice `(household_id)`.
- Trigger `budgets_check_refs`: categoria da mesma casa, `kind = 'expense'` e `parent_id` nulo (`INVALID_BUDGET_CATEGORY`).
- **Limite efetivo de uma categoria no mês M**: a linha de M, se existir; senão, a linha mais recente com `month < M` e `repeats = true`; senão, sem limite. Valor efetivo 0 = sem limite.

### 1.4 RPCs (security invoker — o RLS continua valendo)

As linhas de lançamento seguem o formato de `p_rows` da Fase 3: lançamentos no cartão trazem as colunas do ciclo (`closing_month`, `closing_date`, `due_date`, `reference_month`) e o RPC resolve a fatura com `ensure_invoice`.

- **`create_recurrence(p_recurrence jsonb, p_rows jsonb) returns uuid`**: numa transação, insere a série e todas as ocorrências (a primeira com o status escolhido no formulário, as demais `pending`); devolve o id da série.
- **`generate_recurrence_occurrences(p_recurrence_id uuid, p_rows jsonb, p_generated_until date)`**: insere as ocorrências com `on conflict (recurrence_id, occurrence_date) do nothing` e grava `generated_until`.
- **`apply_recurrence_change(p_recurrence_id uuid, p_patch jsonb, p_delete_ids uuid[], p_rows jsonb, p_generated_until date)`**: numa transação, atualiza os campos da série vindos em `p_patch` (inclusive `end_date`), apaga os lançamentos de `p_delete_ids` (só se forem da série) e insere `p_rows`. Se `p_patch` deixar `end_date < start_date`, apaga a série (os lançamentos restantes ficam com `recurrence_id` nulo).
- **`restore_recurrence(p_recurrence jsonb, p_rows jsonb)`**: reinsere a série (upsert com o mesmo id e campos) e as linhas com os mesmos ids — o "Desfazer" de "excluir este e os próximos".
- **`restore_transactions`** (Fase 3, recriado): passa a reinserir também `recurrence_id` e `occurrence_date`, para o "Desfazer" de "excluir só este" manter o lançamento na série.
- **`apply_budget_change(p_category_id uuid, p_month date, p_amount_cents bigint, p_repeats boolean, p_delete_months date[])`**: upsert da linha `(categoria, mês)` e remoção das linhas da categoria nos meses de `p_delete_months`, numa transação.

`grant execute` para `authenticated`; `revoke` de `anon` e `public`.

## 2. Regras de negócio (`lib/finance/`, funções puras com testes)

### 2.1 `lib/finance/recurrence.ts`

- **`occurrenceDates(series, from, until): string[]`** — datas da série no intervalo `[from, until]`, nunca depois de `end_date`.
  - Mensal: `addMonthsClamped(start_date, k)`; anual: `addMonthsClamped(start_date, 12k)` — sempre a partir da âncora (série no dia 31 cai em 28/02 e volta a 31/03; anual em 29/02/2028 cai em 28/02/2029).
  - Semanal: `start_date + 7k` dias.
- **`generationWindow(generatedUntil, endDate, today): { from, until } | null`** — de `generatedUntil + 1 dia` até `min(addMonthsClamped(today, 12), endDate)`; `null` se não falta nada.
- **`buildOccurrences(series, dates, savedInvoices): OccurrenceRow[]`** — lançamentos `pending` com `recurrence_id`, `occurrence_date` = `date` e `source = 'recurrence'`. No cartão, cada data passa por `resolveCycleForDate` (Fase 3), que respeita faturas já fechadas.
- **`occurrencesToReplace(seriesTransactions, fromDate, today): string[]`** — ids das ocorrências com `occurrence_date >= fromDate` cujo `effectiveStatus` é `pending`. Pagas ficam.
- **`seriesChange(series, occurrence, patch, mode)`** — monta `p_patch`, `p_delete_ids`, `p_rows` e `p_generated_until` para:
  - **editar "este e os próximos"**: aplica `patch` à série; se a data foi alterada, a nova data vira `start_date`; regenera de `occurrence.occurrence_date` até o horizonte (ou `end_date`).
  - **excluir "este e os próximos"**: `end_date = occurrence.occurrence_date − 1 dia`; apaga as não realizadas a partir dela; nenhuma linha nova.
  - **editar pela tela Recorrências**: igual a "este e os próximos" a partir da **próxima data** (primeira ocorrência não realizada, ou a data informada); mudar frequência ou próxima data faz da próxima data a nova `start_date`.
  - **encerrar**: `end_date = hoje`; apaga as não realizadas com data > hoje.
- **`describeSchedule(series)`** — texto de apoio: "Todo dia 10", "Toda segunda-feira", "Todo ano em 15/03", com ", até dd/mm/aaaa" ou ", sem data final".

### 2.2 `lib/finance/budget.ts`

- **`effectiveBudget(rows, categoryId, month): number | null`** — regra da seção 1.3.
- **`budgetChange(rows, categoryId, month, amountCents, mode: 'only' | 'from')`** → `{ upsert: { month, amountCents, repeats }, deleteMonths: string[] }`:
  - `only`: grava M com `repeats = false`; nada a apagar.
  - `from`: grava M com `repeats = true`; apaga as linhas com `repeats = true` e mês > M (exceções de um mês só ficam).
  - "Remover limite" é a mesma chamada com `amountCents = 0`.
- **`categorySpending(transactions, categories, month, today): Map<categoryId, { realizedCents, plannedCents }>`** — despesas do mês por categoria de primeiro nível (subcategoria soma na mãe), separadas por `effectiveStatus`. Receitas, transferências e pagamentos de fatura ficam de fora.
- **`budgetProgress(limitCents, realizedCents, plannedCents)`** → `{ realizedRatio, plannedRatio, ratio, level }`, com `ratio = (realizado + previsto) / limite` e `level` pelo `usageLevel` existente (ok < 80% ≤ atenção < 100% ≤ estourado).
- **`sortBudgetRows`** — com limite primeiro, por `ratio` decrescente; sem limite depois, por gasto decrescente.

### 2.3 `lib/finance/card.ts` (ajuste)

- `cardUsage(limitCents, invoices, futureRecurringCents = 0)` — `usedCents` desconta `futureRecurringCents` (soma das despesas do cartão com `recurrence_id` e data > hoje).

## 3. Server Actions e consultas

### 3.1 Geração ao abrir o app — `lib/recurrences-sync.ts`

- `syncRecurrences(today)`, chamado no layout `app/(app)/layout.tsx` (servidor) a cada carregamento.
- Uma consulta busca as séries com `generated_until < horizonte` e (`end_date` nula ou `end_date > generated_until`). Para cada uma: `generationWindow` → `occurrenceDates` → (cartão: faturas salvas) → `buildOccurrences` → `generate_recurrence_occurrences`.
- Erro numa série é registrado no log e não impede o app de abrir; a próxima carga tenta de novo sem duplicar.

### 3.2 Lançamentos (`lib/actions/transactions.ts` e `card-transactions.ts`, ampliados)

- Criar com `repeat: { frequency, endDate? }` → `create_recurrence` (primeira ocorrência + geradas até o horizonte); sem `repeat`, o fluxo atual.
- Atualizar/excluir com `scope: 'one' | 'following'` quando o lançamento tem `recurrence_id`:
  - `one`: update/delete atuais (delete com "Desfazer" pelo `restore_transactions`).
  - `following`: `seriesChange` + `apply_recurrence_change`; exclusão devolve o snapshot `{ recurrence, rows }` para o "Desfazer" (`restore_recurrence`).

### 3.3 `lib/actions/recurrences.ts`

- `updateRecurrence(id, input)` e `endRecurrence(id)` (seção 2.1).

### 3.4 `lib/actions/budgets.ts`

- `setBudget({ categoryId, month, amountCents, mode })` → `budgetChange` + `apply_budget_change`.

### 3.5 Arquivar

- `archiveAccount`, `archiveCard` e `archiveCategory` recusam quando existe recorrência ativa usando o item, com mensagem em pt-BR.

### 3.6 Consultas (server-only)

- `lib/recurrences.ts`: séries ativas e encerradas com a próxima data (primeira ocorrência não realizada) e o nome da conta/cartão/categoria.
- `lib/budgets.ts`: orçamentos da casa até o mês, categorias de despesa e despesas do mês → linhas da tela.
- `lib/cards.ts`: soma de `futureRecurringCents` por cartão para `cardUsage`.

Validação: `lib/validation/recurrence.ts` (bloco `repeat`, edição da série; `repeat` recusado com parcelas > 1, em transferência no cartão e em pagamento de fatura; `endDate >= data`) e `lib/validation/budget.ts`. Erros dos triggers mapeados no mapeador existente.

## 4. Telas

### 4.1 Formulário rápido (botão "+")

- Depois da data: **Repetir** com chips **Não · Semanal · Mensal · Anual**. Escolhida a frequência, aparece **Até** (data opcional) e o texto de `describeSchedule`.
- Some em pagamento de fatura e quando Parcelas > 1; no cartão, só para despesa.
- Editando um lançamento de série: um aviso "Mensal · Aluguel" no topo, sem os campos de repetição; ao salvar ou excluir, o seletor **"Só este" / "Este e os próximos"** (o mesmo das parcelas).

### 4.2 Recorrências (`/recorrencias`)

- Novo item no menu (*Mais* no celular, menu lateral no desktop), perto de Parcelas, com ícone de repetir.
- **Ativas**: cards com descrição, valor, `describeSchedule`, conta/cartão (ou "Conta → Conta") e próxima data.
- **Encerradas**: seção recolhível no fim.
- Tocar abre o modal de edição: descrição, valor, categoria, conta/cartão, frequência, próxima data e "Até"; botão **Encerrar** com confirmação.
- Vazio: explicação curta e botão "Novo lançamento" (abre o formulário rápido).

### 4.3 Orçamento (`/orcamento`)

- Seletor de mês "‹ Outubro 2026 ›" e resumo: total orçado, realizado e previsto.
- Uma linha por categoria de despesa de primeiro nível não arquivada:
  - com limite: barra em dois tons (realizado cheio, previsto claro), "R$ 900 gastos + R$ 400 previstos de R$ 1.500" e selo **Atenção** (≥ 80%) ou **Estourado** (≥ 100%) — nunca só pela cor;
  - sem limite: gasto do mês e botão **Definir limite**.
- Ordem de `sortBudgetRows`. Uma coluna no celular, duas a partir de 1024px.
- Modal: valor, **"A partir deste mês"** (padrão) ou **"Só este mês"**, e **Remover limite** (mesma escolha).

### 4.4 Ajustes nas telas existentes

- Lançamentos, extrato da conta e fatura: ícone de repetir ao lado da descrição dos lançamentos de série.
- `/cartoes` e `/cartoes/[id]`: uso do limite com `futureRecurringCents`.
- `/orcamento` substitui a página placeholder.

### 4.5 Regras de interface

Mesmas das fases anteriores: mobile-first sem rolagem horizontal em 360px, desktop até 1280px, valores com `tabular-nums` à direita, status e alertas nunca só pela cor, textos em pt-BR, datas dd/mm/aaaa.

## 5. Testes

**Unitários (`npm test`):**
- `occurrenceDates`: mensal no dia 31 (fevereiro normal e bissexto, volta a 31), anual em 29/02, semanal, `end_date` no meio da janela, série começando no passado, intervalo vazio.
- `generationWindow`: em dia, atrasada, encerrada, `end_date` antes do horizonte.
- `buildOccurrences`: conta (pendente, `occurrence_date`), cartão (fatura certa pela regra 8.2, inclusive fatura já fechada pelas datas salvas), transferência.
- `occurrencesToReplace` e `seriesChange`: preserva pagas; editar com e sem mudança de data (âncora); excluir a partir do meio e a partir da primeira (`end_date < start_date`); editar pela tela com mudança de frequência; encerrar.
- `describeSchedule`.
- `effectiveBudget`, `budgetChange` (só este mês, a partir deste mês, exceção preservada, remover limite), `categorySpending` (subcategoria na mãe, cartão pela data, pendente como previsto, transferência e pagamento de fatura fora), `budgetProgress` (79%, 80%, 100%, limite 0), `sortBudgetRows`.
- `cardUsage` com `futureRecurringCents`.
- Schemas zod de `repeat`, edição da série e orçamento.

**Integração (`npm run test:rls`):**
1. Isolamento entre casas de `recurrences`, `budgets` e dos RPCs novos (leitura e escrita, mesmo com o id).
2. Triggers recusam conta, cartão, categoria e série de outra casa; categoria de receita ou subcategoria no orçamento; tipo incompatível com a categoria.
3. Constraints: série com conta e cartão, receita no cartão, transferência para a mesma conta, `end_date < start_date`, lançamento com `recurrence_id` e parcela.
4. Índice único: gerar a mesma janela duas vezes não duplica.
5. `create_recurrence` e `apply_recurrence_change` são atômicos (uma linha inválida não deixa nada).

**Manual:** criar aluguel mensal (com início no passado), assinatura no cartão e salário; editar "só este" e "este e os próximos"; excluir "este e os próximos" e desfazer; encerrar; orçamento com "só este mês" e "a partir deste mês"; layout em 360px e 1440px.

## 6. Critérios de aceite da Fase 4

1. Lançar "Aluguel R$ 2.000, mensal, dia 10" cria o lançamento de hoje e os pendentes até 12 meses à frente; reabrir o app não duplica nada.
2. Uma série mensal no dia 31 aparece em 28/02 (ou 29/02) e volta a 31/03.
3. Assinatura mensal no cartão cai em cada fatura pela regra 8.2 e só ocupa o limite quando a data chega.
4. Editar "este e os próximos" muda os pendentes daquele em diante e não toca nos pagos; "só este" muda só aquele.
5. Excluir "este e os próximos" encerra a série e o "Desfazer" devolve tudo.
6. Encerrar uma série pela tela Recorrências apaga os pendentes futuros e a move para "Encerradas".
7. Orçamento de Mercado R$ 1.500 com R$ 900 realizados e R$ 400 previstos mostra 87% com selo "Atenção"; acima de 100%, "Estourado".
8. Limite definido "a partir de outubro" vale em novembro e dezembro; uma alteração "só dezembro" não muda janeiro.
9. Gasto numa subcategoria conta no orçamento da categoria-mãe.
10. Sem rolagem horizontal em 360px; aproveita a largura em 1440px.
11. `npm test`, `npm run test:rls`, `npm run lint` e `npm run build` passam.

## Fora do escopo da Fase 4

Card de orçamento, faturas abertas e comprometimento futuro no dashboard; relatórios (Fase 5); gastos do imóvel (Fase 6); skeletons e revisão de acessibilidade completa (Fase 7); notificações de vencimento e lembretes (futuro); pendências conhecidas da Fase 3 (edição de compra antiga após adiantar o fechamento; troca de cartão de fatura/plano por chamada direta à API).
