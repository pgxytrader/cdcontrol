# Fase 6 — Imóvel: design

Data: 05/10/2026 · Referência geral: [docs/PRD.md](../../PRD.md) (seções 5.1, 6, 7, 8.2, 8.7, 9) · Fase anterior: [Fase 5](2026-10-05-fase-5-dashboard-relatorios-design.md)

## Objetivo

Controlar tudo que se paga na compra do imóvel na planta — do sinal às chaves e depois delas — comparando previsto com realizado, vendo quanto já foi de correção INCC e taxa de obra, e levando para as finanças do casal só o que sai das contas (recursos próprios), sem lançamento duplicado.

## Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Dados do financiamento (valor, prazo, SAC/Price, juros) | **Só guardados e exibidos** no cadastro. Parcelas do banco entram como gastos comuns (à mão ou pelo gerador); não há simulação de amortização. |
| Sincronia gasto ↔ lançamento | **O gasto do imóvel manda.** O lançamento ligado é só leitura em Lançamentos ("Editar no Imóvel"); editar o gasto atualiza o lançamento; desmarcar o pagamento ou excluir o gasto apaga o lançamento (com "Desfazer"); excluir o lançamento volta o gasto para previsto, após confirmação. |
| Gerador do plano de pagamento | **Gera gastos soltos**, com prévia e "Desfazer" logo após. Blocos opcionais: mensais, intermediárias (a cada 6 ou 12 meses) e chaves. Reajuste INCC entra pelo valor pago, não regera o plano. |
| Como gravar | Tabelas do PRD, regras em TypeScript (`lib/finance/property*.ts`) e gravação **atômica por RPC** (`security invoker`); fatura do cartão resolvida em TypeScript pela regra 8.2. Bloqueio do lançamento ligado por **trigger** no banco. |
| Gastos previstos nas finanças | Gastos do imóvel **não pagos não aparecem** em Lançamentos nem como previsto no Início/Orçamento; só viram lançamento ao serem pagos com recursos próprios (PRD 6.5: separados do dia a dia). |

## 1. Banco de dados

Migration nova em `supabase/migrations/`. Tabelas novas seguem o padrão das fases anteriores: `id uuid pk default gen_random_uuid()`, `household_id uuid not null references households on delete cascade`, `created_by uuid default auth.uid()`, `created_at`, `updated_at` com trigger `set_updated_at`, RLS habilitado com a policy `for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))` e `revoke all ... from anon`. Valores em centavos (`bigint`, sufixo `_cents`).

### 1.1 `properties`

- `name text not null` (1–80), `developer text`, `unit text`, `address text` (até 200 cada), `purchase_price_cents bigint not null check (>= 0)`, `contract_date date`, `expected_delivery_date date`, `phase text not null default 'pre_keys' check (phase in ('pre_keys','post_keys'))`.
- Financiamento (todos opcionais): `bank text`, `financed_amount_cents bigint check (>= 0)`, `term_months int check (between 1 and 600)`, `amortization_system text check (in ('sac','price'))`, `annual_interest_rate numeric(6,4) check (between 0 and 100)` (percentual ao ano, ex.: 9.5).
- Imóvel principal = o mais antigo (`created_at`); havendo outros, a tela escolhe por `?imovel=<id>`.

### 1.2 `property_expense_types`

- `name text not null` (1–60), `typical_phase text not null check (in ('signing','construction','delivery','financing','post_keys','any'))`, `sort_order int not null`, `is_default boolean not null default false`, `system_key text`, `archived boolean not null default false`.
- `unique (household_id, system_key)` (parcial: `where system_key is not null`). `system_key` não muda ao editar o nome; só os tipos padrão têm.
- Seed (função `seed_property_expense_types(p_household_id)`, `security definer`, `search_path=''`), chamada em `create_household` e, na migration, para as casas existentes. Lista e chaves (ordem = PRD 6.2):

| sort | Nome | typical_phase | system_key |
|---|---|---|---|
| 1 | Sinal / entrada | signing | `down_payment` |
| 2 | Parcelas mensais à construtora | construction | `monthly` |
| 3 | Parcelas intermediárias (balões) | construction | `intermediate` |
| 4 | Parcela das chaves | delivery | `keys` |
| 5 | Correção INCC | construction | `incc` |
| 6 | Taxa de obra (evolução de obra) | construction | `construction_interest` |
| 7 | Corretagem | signing | `brokerage` |
| 8 | Avaliação do imóvel (banco) | financing | `appraisal` |
| 9 | Taxas bancárias | financing | `bank_fees` |
| 10 | Seguros MIP e DFI | financing | `insurance` |
| 11 | ITBI | financing | `itbi` |
| 12 | Registro em cartório | financing | `registry` |
| 13 | Escritura / certidões | financing | `deed` |
| 14 | Despachante / assessoria | financing | `dispatcher` |
| 15 | Parcelas do financiamento | post_keys | `financing_installment` |
| 16 | Condomínio e fundo de reserva | post_keys | `condo` |
| 17 | IPTU | post_keys | `iptu` |
| 18 | Ligações (água, luz, gás) | delivery | `utilities` |
| 19 | Vistoria de entrega | delivery | `inspection` |
| 20 | Acabamento, móveis planejados, mudança | post_keys | `finishing` |
| 21 | Outros | any | `other` |

- Tipo novo criado pelo usuário: `system_key` nulo, `sort_order` = maior + 1. Tipo padrão ou já usado por um gasto não é excluído, só arquivado (FK `restrict` em `property_expenses.expense_type_id`).

### 1.3 `property_expenses`

- `property_id uuid not null references properties on delete cascade`, `expense_type_id uuid not null references property_expense_types on delete restrict`, `description text not null` (1–120), `payee text` (até 80), `planned_amount_cents bigint not null check (>= 0)`, `due_date date not null`, `status text not null default 'planned' check (in ('planned','paid'))`, `paid_amount_cents bigint check (> 0)`, `paid_date date`, `funding_source text not null default 'own' check (in ('own','fgts','financing'))`, `transaction_id uuid unique references transactions on delete set null`, `notes text` (até 500).
- Checks: `status = 'paid'` ⇔ `paid_amount_cents` e `paid_date` não nulos; `transaction_id` não nulo só com `status = 'paid'` e `funding_source = 'own'`.
- Índice `(property_id, due_date)`; índices em `expense_type_id` e `transaction_id`.
- "Atrasado" é calculado (não salvo).

### 1.4 Triggers

- **Mesma casa** (`security definer`, `search_path=''`): `property_expenses` só referencia imóvel e tipo da mesma casa; o lançamento ligado também é da mesma casa e tem `source = 'property'`.
- **Bloqueio do lançamento ligado** (`before update on transactions`): se `old.source = 'property'` e algum de `type, amount_cents, date, status, account_id, credit_card_id, invoice_id, category_id, destination_account_id, source` mudou, recusa com `PROPERTY_LOCKED` — exceto quando `current_setting('app.property_sync', true) = 'on'` (ligado com `set_config(..., true)` só dentro dos RPCs abaixo). Descrição e observação continuam editáveis.
- **Excluir o lançamento** (`before delete on transactions`, `old.source = 'property'`): o gasto ligado volta para previsto (`status = 'planned'`, `paid_amount_cents`, `paid_date` e `transaction_id` nulos). Vale para qualquer caminho de exclusão.

### 1.5 RPCs (`security invoker`, `search_path=''`, atômicos)

- `create_property_expenses(p_property_id uuid, p_rows jsonb) returns uuid[]` — insere gastos previstos (gerador e "novo gasto"); `p_rows` traz `id` opcional (para restaurar).
- `pay_property_expense(p_expense_id uuid, p_paid jsonb, p_transaction jsonb) returns uuid` — `p_paid`: `{ paid_amount_cents, paid_date, funding_source }`. Marca pago ou edita um pago. Com `p_transaction` (`{ description, amount_cents, date, status, category_id, account_id | credit_card_id, invoice: {closing_month, closing_date, due_date, reference_month} | null }`): cria (se não há vínculo) ou atualiza o lançamento ligado (`type = 'expense'`, `source = 'property'`; no cartão chama `ensure_invoice`). Sem `p_transaction`: apaga o lançamento ligado, se houver. Devolve o id do lançamento (ou nulo).
- `unpay_property_expense(p_expense_id uuid)` — volta para previsto e apaga o lançamento ligado.
- `delete_property_expenses(p_ids uuid[])` — apaga gastos e lançamentos ligados.
- `restore_property_expenses(p_expenses jsonb, p_transactions jsonb)` — recria lançamentos e gastos com os mesmos ids (Desfazer). Lançamentos de cartão restaurados reaproveitam `invoice_id` salvo (a fatura não é apagada na exclusão).
- `delete_property(p_property_id uuid)` — apaga lançamentos ligados aos gastos do imóvel e o imóvel (gastos em cascata).

Os RPCs que mexem em lançamentos ligam `app.property_sync` só durante a própria transação.

## 2. Regras de negócio (`lib/finance/`, funções puras com testes)

### 2.1 `lib/finance/property.ts`

- `CONSTRUCTOR_KEYS = ['down_payment','monthly','intermediate','keys']`.
- `expenseStatus(expense, today)` → `'paid' | 'overdue' | 'planned'` (previsto com `due_date < today` = atrasado).
- `correctionCents(expense, systemKey)` → para gasto pago de tipo da construtora: `paid − planned` (pode ser negativo); senão 0.
- `propertySummary(property, expenses, typeKeys, today)` → `{ purchasePriceCents, plannedCents (soma dos previstos de todos), paidCents (soma dos pagos), toPayCents (previsto dos não pagos), paidRatio (pago ÷ (pago + a pagar); 0 se ambos 0), inccCents (correções + pagos do tipo incc), constructionInterestCents (pagos do tipo construction_interest), bySource: Record<own|fgts|financing, { paidCents, toPayCents }>, next: expense | null (não pago de vencimento mais antigo, inclusive atrasado; empate pela descrição) }`.
- `totalsByType(expenses, types)` → por tipo com gasto: `{ typeId, name, plannedCents, paidCents, count }`, na ordem de `sort_order`.
- `propertySchedule(expenses, expectedDeliveryDate, today)` → meses (`AAAA-MM`) do primeiro mês com vencimento ou pagamento até o último (ou o mês das chaves, se depois), cada um `{ ym, plannedCents (por due_date), paidCents (por paid_date), isCurrent, isDelivery }`; vazio sem gastos.

### 2.2 `lib/finance/property-plan.ts`

- `buildPaymentPlan(input)` com blocos opcionais `monthly { amountCents, count (1–360), firstDueDate }`, `intermediate { amountCents, count (1–60), firstDueDate, everyMonths: 6 | 12 }`, `keys { amountCents, dueDate }` e `fundingSource` → linhas `{ systemKey, description, plannedAmountCents, dueDate, fundingSource }`.
- Datas: mensais `addMonthsClamped(firstDueDate, k)` (dia 31 → 28/29 em fevereiro, volta a 31); intermediárias `addMonthsClamped(firstDueDate, k * everyMonths)`.
- Descrições: "Parcela mensal 3/36", "Intermediária 2/6", "Parcela das chaves".
- `planPreview(rows)` → por bloco `{ count, firstDate, lastDate, totalCents }` e total geral.

### 2.3 `lib/finance/property-payment.ts`

- `paymentTransaction(input, today, cardContext?)` → lançamento a gravar quando a fonte é `own` e "Lançar nas finanças" está ligado: `description = "Imóvel: <descrição>"` (cortada em 120), `amount = paid`, `date = paid_date`, categoria escolhida (padrão: categoria de despesa padrão "Imóvel"), conta **ou** cartão; na conta, status por `defaultStatus(date, today)`; no cartão, fatura por `resolveCycleForDate` (Fase 3) e status por `effectiveStatus`.

### 2.4 Validação (`lib/validation/property*.ts`, zod)

Imóvel, gasto, pagamento, gerador (ao menos um bloco; valores > 0; datas válidas) e tipo de gasto. Filtros da lista lidos da URL (`?tipo`, `?status=previsto|pago|atrasado`, `?fonte=proprios|fgts|financiamento`, `?de=AAAA-MM`, `?ate=AAAA-MM`); inválido é ignorado.

## 3. Server Actions e consultas

- `lib/property.ts` (server-only): imóveis da casa, imóvel atual (`?imovel` ou o principal), tipos, gastos do imóvel, gasto por id, gasto pelo `transaction_id`.
- `lib/actions/properties.ts`: criar, editar, excluir imóvel (`delete_property`).
- `lib/actions/property-expenses.ts`: criar/editar gasto previsto, gerar plano (devolve ids para Desfazer), pagar/editar pagamento (monta `p_transaction` com `paymentTransaction`; no cartão carrega o contexto com `lib/card-context.ts`), desmarcar pagamento, excluir (devolve snapshot) e restaurar.
- `lib/actions/property-types.ts`: criar, editar (nome, fase típica), arquivar/desarquivar.
- Exclusão de lançamento em Lançamentos: as actions existentes continuam iguais (o trigger volta o gasto para previsto); a tela pede confirmação antes.
- Erros novos em `translateError`: `PROPERTY_LOCKED` ("Este lançamento vem do Imóvel. Edite pelo Imóvel."), tipo em uso, imóvel/gasto de outra casa.
- Todas as actions terminam com `revalidatePath('/', 'layout')`.

## 4. Telas

### 4.1 Imóvel (`/imovel`)

- **Sem imóvel:** "Cadastre o imóvel para acompanhar os gastos" + botão que abre o formulário.
- **Topo:** nome do imóvel, seletor quando houver mais de um, botões "Novo gasto", "Gerar plano", "Editar imóvel".
- **Abas** (links, `?aba=resumo|cronograma|tipos|gastos`, padrão `resumo`):
  1. **Resumo:** cards de valor do imóvel, total previsto, total pago, a pagar, % pago (barra), correção INCC, taxa de obra; tabela/lista por fonte (pago e a pagar); próximo pagamento (descrição, vencimento, valor, selo atrasado); dados do imóvel e do financiamento (fase, banco, valor financiado, prazo, SAC/Price, juros).
  2. **Cronograma:** linha do tempo por mês agrupada por ano: mês, previsto, realizado, barrinha; mês atual destacado; mês das chaves com "Entrega das chaves". Vazio: "Nenhum gasto cadastrado."
  3. **Por tipo:** lista com nome, previsto, pago, quantidade e barra pago/previsto.
  4. **Gastos:** filtros (tipo, status, fonte, de/até) e lista agrupada pelo mês de vencimento: descrição, tipo, favorecido, vencimento, selo (Previsto/Pago/Atrasado — texto, não só cor), previsto e pago, fonte, correção quando houver. Tocar abre o gasto com "Pagar"/"Editar pagamento", "Desmarcar pagamento", "Editar" e "Excluir" (com "Desfazer").
- **Formulário de pagamento:** valor pago (padrão = previsto), data (padrão = hoje), fonte; "Lançar nas finanças" (ligado por padrão, só com recursos próprios); "Pagar com" (conta ou cartão; padrão a última usada pela pessoa, como no formulário rápido); categoria (padrão Imóvel). Mostra "Correção: + R$ X" / "− R$ X" quando o valor difere do previsto numa parcela da construtora.
- **Gerador:** três blocos opcionais, fonte (padrão recursos próprios), prévia e "Gerar"; toast "N gastos criados" com "Desfazer".
- **Formulário do imóvel:** campos do 6.1; "Excluir imóvel" com confirmação mostrando quantos gastos e lançamentos serão apagados.
- Sheet no celular, dialog no desktop (`ResponsiveModal`), como os outros formulários.

### 4.2 Tipos de gasto (Configurações → "Tipos de gasto do imóvel")

Lista na ordem; editar nome e fase típica; "Novo tipo" (entra no fim); arquivar/desarquivar; arquivados numa seção recolhível e fora do seletor do gasto.

### 4.3 Lançamentos, extrato e fatura

Lançamento com `source = 'property'`: ícone de prédio e selo "Imóvel". Tocar abre uma visão só leitura (descrição, valor, data, conta/cartão, categoria) com "Editar no Imóvel" (link para `/imovel?imovel=<id>&aba=gastos&gasto=<id>`, que abre o gasto) e "Excluir" (confirma "Isto volta o gasto do imóvel para previsto." e não tem Desfazer).

### 4.4 Início

Painel "Imóvel" (imóvel principal, só se existir): total pago, total previsto, % pago, próximo pagamento (descrição, data, valor, selo atrasado) e link "Ver imóvel".

## 5. Testes

**Unitários (`npm test`):** `expenseStatus` (hoje, ontem, pago); `correctionCents` (maior, menor, igual, tipo fora da construtora, não pago); `propertySummary` (vazio, fontes, % pago com INCC, próximo com atrasado e empate); `totalsByType` (ordem, tipos sem gasto fora); `propertySchedule` (meses vazios no meio, entrega depois do último gasto, pago em mês diferente do vencimento, virada de ano); `buildPaymentPlan` (mensal no dia 31 atravessando fevereiro bissexto, intermediárias de 6 e 12 meses, só chaves, descrições, bloco ausente); `planPreview`; `paymentTransaction` (conta passada/futura, cartão antes/no dia do fechamento, descrição cortada); schemas zod e leitura dos filtros.

**Integração (`npm run test:rls`):** isolamento entre casas de `properties`, `property_expense_types`, `property_expenses` e dos RPCs; triggers de mesma casa; tipos padrão criados com a casa; bloqueio de update de lançamento `property` fora do RPC (e liberado para descrição); excluir lançamento volta o gasto para previsto; `pay_property_expense` cria/atualiza/remove o lançamento e é atômico (lançamento inválido não deixa o gasto pago); `delete_property_expenses` + `restore_property_expenses` devolvem tudo; `delete_property` apaga lançamentos ligados.

**Manual:** cadastrar imóvel; gerar plano (36 mensais, 6 intermediárias semestrais, chaves) e desfazer; pagar mensal com valor maior (INCC) em conta e em cartão; ver o lançamento em Lançamentos (só leitura) e excluí-lo; pagar com FGTS; resumo, cronograma, por tipo e filtros; card no Início; 360px e 1440px.

## 6. Critérios de aceite da Fase 6

1. Cadastrar o imóvel e ver o Resumo com valor, previsto, pago, a pagar e % pago.
2. Gerar 36 mensais de R$ 1.500 a partir de 10/11/2026, 6 intermediárias semestrais e as chaves cria os gastos previstos com descrições "Parcela mensal k/36"…; "Desfazer" apaga todos.
3. Pagar a mensal de R$ 1.500 com R$ 1.530 em recursos próprios cria **um** lançamento de R$ 1.530 na categoria Imóvel na conta escolhida e mostra R$ 30 de correção INCC no Resumo.
4. Pagar no cartão põe o lançamento na fatura certa (regra 8.2).
5. O lançamento ligado não pode ser editado em Lançamentos (nem pela API); excluí-lo volta o gasto para previsto; desmarcar o pagamento ou excluir o gasto apaga o lançamento.
6. Pagar com FGTS ou financiamento não cria lançamento.
7. Gasto previsto vencido aparece como "Atrasado"; os filtros de tipo, status, fonte e período funcionam e ficam na URL.
8. Cronograma mostra previsto x realizado por mês até a entrega das chaves; Por tipo mostra previsto e pago de cada tipo.
9. Um usuário de outra casa não lê nem altera imóvel, tipos ou gastos (inclusive pelos RPCs).
10. O Início mostra o card do imóvel (pago, previsto, próximo pagamento).
11. Sem rolagem horizontal em 360px; aproveita a largura em 1440px.
12. `npm test`, `npm run test:rls`, `npm run lint` e `npm run build` passam.

## Fora do escopo da Fase 6

Simulação SAC/Price e geração automática das parcelas do financiamento; anexos de contratos e comprovantes (futuro); notificações de vencimento (futuro); reordenar tipos de gasto; gastos previstos do imóvel no fluxo de caixa/orçamento; relatórios do imóvel em Relatórios; skeletons e revisão de acessibilidade completa (Fase 7).
