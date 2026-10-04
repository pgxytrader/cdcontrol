# Fase 3 — Cartões, faturas e parcelas: design

Data: 04/10/2026 · Referência geral: [docs/PRD.md](../../PRD.md) (seções 5.3, 5.4, 5.5, 7, 8.2, 8.3, 8.4, 8.5, 8.7, 9.3) · Fase anterior: [Fase 2](2026-10-04-fase-2-contas-categorias-lancamentos-design.md)

## Objetivo

Permitir que o casal cadastre cartões de crédito, lance compras à vista e parceladas (inclusive compras já em andamento) no mesmo formulário rápido, veja cada fatura com total, pagamentos e limite, pague faturas a partir de uma conta e acompanhe todas as parcelas futuras de todos os cartões numa única tela.

## Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Estorno / crédito na fatura | **Receita no cartão** (tipo `income` com `credit_card_id`), com categoria de receita. Abate o total da fatura e conta como receita no resumo do mês. |
| Mudança do dia de fechamento/vencimento | Recalcula as datas das faturas abertas e futuras e **redistribui** as compras delas pela regra 8.2. Faturas já fechadas não mudam. |
| Edição de compra parcelada | "Só esta parcela" ou "esta e as futuras" alteram apenas **descrição, categoria e observação**. Para mudar valor, número de parcelas ou cartão: excluir e lançar de novo. |
| Cartão no formulário rápido | Seletor único **"Pagar com"** com contas e cartões em grupos; cartão + despesa mostra **Parcelas** e "Compra já em andamento?". A última escolha (conta ou cartão) de cada pessoa fica pré-selecionada. |
| Onde vive a regra da fatura | Funções puras em `lib/finance` (fonte da verdade, com testes unitários). Server Actions calculam; RPCs gravam de forma atômica. O banco valida só integridade (mesma casa, fatura do mesmo cartão). |
| Identidade da fatura | Pelo **mês de fechamento** (`closing_month`), não pelo `reference_month`. Evita colisão quando o dia de vencimento muda (ver 1.2). |
| Parcela k | Fica na fatura com `closing_month = first_closing_month + (k−1)` — aritmética de meses, nunca pela data da parcela (evita pular fatura com fechamento em 29/30/31). |
| Compra em andamento | Informa-se o **valor da parcela** e "parcela **X** de **N**"; a data do formulário é a data da parcela atual, que cai na fatura dessa data. Criam-se as parcelas X..N. |
| Status da fatura | Calculado (PRD 8.4), não salvo no banco. |
| Status de lançamentos no cartão | Receitas e despesas no cartão têm status **derivado da data** na leitura (data ≤ hoje → realizado; futura → previsto). O valor salvo em `status` é ignorado nelas; pagamentos de fatura usam o status salvo, como os lançamentos em conta. |

## 1. Banco de dados

Migration nova em `supabase/migrations/`. Tabelas novas seguem o padrão das fases anteriores: colunas comuns (`id`, `household_id not null references households on delete cascade`, `created_by default auth.uid()`, `created_at`, `updated_at` com trigger `set_updated_at`), RLS habilitado com a policy `for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))` e `revoke all ... from anon`.

### 1.1 `credit_cards`

| Coluna | Tipo / regra |
|---|---|
| `name` | text, 1–40 caracteres (após trim) |
| `brand` | text check in (`visa`, `mastercard`, `elo`, `amex`, `hipercard`, `other`) |
| `last_four` | text nullable, check `^[0-9]{4}$` |
| `limit_cents` | bigint not null check `>= 0` |
| `closing_day` | smallint check between 1 and 31 |
| `due_day` | smallint check between 1 and 31 |
| `default_payment_account_id` | uuid nullable references accounts on delete set null |
| `color` | text check `^#[0-9a-f]{6}$` |
| `archived` | boolean not null default false |

Trigger `credit_cards_check_refs`: `default_payment_account_id`, se preenchida, pertence à mesma casa (erro `INVALID_ACCOUNT`).

### 1.2 `card_invoices`

| Coluna | Tipo / regra |
|---|---|
| `credit_card_id` | uuid not null references credit_cards on delete cascade |
| `closing_month` | date not null, dia 1 (check `extract(day from closing_month) = 1`) — identidade do ciclo |
| `closing_date` | date not null, dentro de `closing_month` |
| `due_date` | date not null, check `due_date > closing_date` |
| `reference_month` | date not null, dia 1 do mês de `due_date` — usado na exibição ("fatura de novembro") |

- Unique `(credit_card_id, closing_month)`.
- Sem coluna de status (calculado, seção 2.1). Diferença deliberada do PRD 7.
- Por que `closing_month` e não `reference_month`: se o vencimento passa do dia 2 para o dia 10, uma fatura aberta que fecha em 03/11 passa a vencer em 10/11, o mesmo mês de referência da fatura fechada que fechou em 03/10 e venceu em 02/11. O mês de fechamento nunca colide, e é preservado quando os dias do cartão mudam.
- A fatura é criada sob demanda (PRD 8.2). Uma fatura que fica sem lançamentos continua existindo com total zero.

### 1.3 `installment_plans`

| Coluna | Tipo / regra |
|---|---|
| `credit_card_id` | uuid not null references credit_cards |
| `category_id` | uuid not null references categories |
| `description` | text, 1–120 caracteres |
| `total_amount_cents` | bigint check `> 0` |
| `installments_count` | smallint check between 2 and 24 |
| `first_installment_number` | smallint check `between 1 and installments_count` |
| `purchase_date` | date not null (na compra em andamento, é estimada — seção 2.2) |
| `first_closing_month` | date not null, dia 1 — mês de fechamento da fatura da parcela **1** (mesmo que ela não exista, na compra em andamento) |

Trigger `installment_plans_check_refs`: cartão e categoria da mesma casa; categoria do tipo `expense`.

Compra à vista no cartão (1x) **não** cria plano.

### 1.4 `transactions` (alterações)

- `type` passa a aceitar `invoice_payment`.
- `account_id` passa a ser nullable.
- Colunas novas:
  - `credit_card_id uuid references credit_cards` (NO ACTION — 23503 ao excluir cartão com lançamentos);
  - `invoice_id uuid references card_invoices` (NO ACTION);
  - `installment_plan_id uuid references installment_plans on delete cascade`;
  - `installment_number smallint`.
- O check `transactions_shape` é substituído por:
  - `income`/`expense`: `category_id` não nulo, `destination_account_id` nulo e **exatamente um** entre `account_id` e `credit_card_id`. Com cartão, `invoice_id` obrigatório; com conta, `invoice_id` nulo.
  - `transfer`: como na Fase 2, com `credit_card_id`, `invoice_id` e `installment_plan_id` nulos.
  - `invoice_payment`: `account_id`, `invoice_id` e `credit_card_id` não nulos; `category_id`, `destination_account_id` e `installment_plan_id` nulos.
  - `installment_plan_id` não nulo ⇒ `type = 'expense'`, `credit_card_id` não nulo e `installment_number` não nulo; `installment_plan_id` nulo ⇒ `installment_number` nulo.
- `transactions_check_refs` passa a validar também:
  - `account_id` só quando não nulo;
  - `credit_card_id` da mesma casa (`INVALID_CARD`);
  - `invoice_id` da mesma casa e do mesmo `credit_card_id` (`INVALID_INVOICE`);
  - `installment_plan_id` da mesma casa e do mesmo cartão, com `installment_number` entre 1 e `installments_count` (`INVALID_PLAN`).
- Índices novos: `(credit_card_id)`, `(invoice_id)`, `(installment_plan_id)`.

### 1.5 `profiles`

Coluna nova `last_credit_card_id uuid references credit_cards on delete set null`, com `grant update (last_credit_card_id)` para `authenticated`. Ao lançar, grava-se a conta **ou** o cartão usado e limpa-se o outro, para a pré-seleção saber qual foi o último.

### 1.6 Views (security_invoker = true)

- **`v_account_balances`** (recriada): igual à Fase 2, mais `− amount_cents` de `invoice_payment` pagos com `account_id` = conta (mesma regra de data do saldo inicial). Lançamentos no cartão não afetam contas.
- **`v_invoice_totals`** (nova): por fatura, `invoice_id`, `credit_card_id`, `household_id`, `charges_cents` (soma das `expense`), `credits_cents` (soma das `income`), `total_cents = charges − credits`, `paid_cents` (soma dos `invoice_payment` com status `paid`).

### 1.7 RPCs (security invoker — o RLS continua valendo)

- **`ensure_invoice(p_card_id, p_closing_month, p_closing_date, p_due_date, p_reference_month) returns uuid`**: insere com `on conflict (credit_card_id, closing_month) do nothing` e devolve o id.
- **`create_card_purchase(p_plan jsonb, p_rows jsonb) returns uuid[]`**: numa transação, cria as faturas que faltam (os ciclos vêm em cada linha), insere o plano (se houver) e as linhas; devolve os ids dos lançamentos. Qualquer erro desfaz tudo.
- **`apply_card_schedule(p_card_id, p_closing_day, p_due_day, p_invoices jsonb, p_plans jsonb, p_moves jsonb)`**: numa transação, atualiza os dias do cartão, as datas (`closing_date`, `due_date`, `reference_month`) das faturas do conjunto recalculado, o `first_closing_month` dos planos afetados, cria faturas que faltem e move cada lançamento para a fatura do `closing_month` indicado.
- **`restore_card_transactions(p_plan jsonb, p_rows jsonb)`**: reinsere plano (se veio no snapshot) e linhas com os mesmos ids, para o "Desfazer".

`grant execute` para `authenticated`; `revoke` de `anon` e `public`.

## 2. Regras de negócio (`lib/finance/`, funções puras com testes)

Tipos novos em `lib/finance/types.ts`: `TransactionType` ganha `invoice_payment`; `LedgerTransaction` ganha `creditCardId: string | null`; `CardSchedule = { closingDay: number; dueDay: number }`; `InvoiceCycle = { closingMonth: string; closingDate: string; dueDate: string; referenceMonth: string }` (datas `AAAA-MM-DD`, meses no dia 1).

### 2.1 `lib/finance/invoice.ts`

| Função | Contrato |
|---|---|
| `addMonthsClamped(date, n)` | Soma `n` meses (pode ser negativo); dia inexistente vira o último dia do mês (31/01 + 1 = 28/02 ou 29/02). |
| `cycleForClosingMonth(card, closingMonth)` | Fechamento = `min(closing_day, dias do mês)` em `closingMonth`. Vencimento: se `due_day > closing_day` (dias configurados), no mesmo mês do fechamento; senão, no mês seguinte; com o mesmo ajuste de último dia. `referenceMonth` = mês do vencimento. |
| `cycleForDate(card, date)` | Se `date <` fechamento do mês de `date`, ciclo desse mês; senão, ciclo do mês seguinte. |
| `shiftClosingMonth(closingMonth, k)` | Mês de fechamento + k meses. |
| `invoiceStatus(cycle, totals, today)` | `open` se `today < closingDate`; senão `paid` se `paidCents >= totalCents`; senão `overdue` se `today > dueDate`; senão `closed`. |

Exemplos do PRD (fechamento 3, vencimento 10): compra em 02/10 → fecha 03/10, vence 10/10; compra em 03/10 → fecha 03/11, vence 10/11.

### 2.2 `lib/finance/installments.ts`

| Função | Contrato |
|---|---|
| `splitInstallments(totalCents, n)` | Divisão inteira; o resto dos centavos vai para a parcela 1 (100,00 em 3x = 33,34 + 33,33 + 33,33). |
| `buildCardPurchase(card, input)` | Devolve `{ plan: PlanDraft \| null, rows: RowDraft[] }`, cada linha com `amountCents`, `date`, `installmentNumber \| null` e `cycle`. |

Modos de `buildCardPurchase`:

- **À vista (1x), compra ou estorno:** uma linha, `cycle = cycleForDate(card, date)`, sem plano.
- **Normal (N ≥ 2):** valor total, data da compra. `first_closing_month = cycleForDate(card, data).closingMonth`. Parcela k (1..N): valor de `splitInstallments`, data = `addMonthsClamped(data, k−1)`, ciclo = `cycleForClosingMonth(card, shiftClosingMonth(first_closing_month, k−1))`. `first_installment_number = 1`.
- **Em andamento:** valor da **parcela** `v`, parcela atual X de N (2 ≤ N ≤ 24, 1 ≤ X ≤ N), data `d` da parcela atual. `first_closing_month = shiftClosingMonth(cycleForDate(card, d).closingMonth, −(X−1))`. Parcelas k = X..N: valor `v`, data = `addMonthsClamped(d, k−X)`, ciclo pelo mesmo cálculo da compra normal. Plano: `total_amount_cents = v × N`, `first_installment_number = X`, `purchase_date = addMonthsClamped(d, −(X−1))` (estimada, só exibição).

A descrição salva é a da compra ("Geladeira"); o sufixo "(3/10)" é montado na exibição.

### 2.3 `lib/finance/card.ts`

| Função | Contrato |
|---|---|
| `cardUsage(limitCents, invoiceTotals)` | `used = Σ totalCents − Σ paidCents` em todas as faturas do cartão; `available = limitCents − used`; `ratio = used / limitCents` (0 quando o limite é 0). |
| `rescheduleCard(card, newSchedule, invoices, transactions, plans, today)` | Devolve `{ invoices: InvoiceUpdate[], plans: PlanUpdate[], moves: { transactionId, closingMonth }[] }`. |

Regras de `rescheduleCard`:

1. O **conjunto recalculado** são as faturas abertas antes da mudança (`today < closingDate` com os dias antigos). Cada uma mantém seu `closing_month` e ganha datas por `cycleForClosingMonth(newSchedule, closing_month)`, mesmo que o novo fechamento já tenha passado.
2. Lançamentos dessas faturas são reposicionados: à vista por `cycleForDate(newSchedule, date)`; parcelas por `first_closing_month + (k−1)`, onde planos **normais** recalculam `first_closing_month` a partir de `purchase_date` e planos **em andamento** mantêm o valor (não há data real da compra).
3. Faturas fechadas antes da mudança não mudam e **não recebem** lançamentos. Se o destino for uma delas, o lançamento vai para a fatura de menor `closing_month` do conjunto recalculado.
4. Um destino sem fatura existente gera fatura nova (o RPC cria).

### 2.4 `lib/finance/installments-view.ts`

`groupInstallmentsByMonth(rows)` agrupa parcelas pelo `reference_month` da fatura (o que se paga naquele mês), em ordem crescente. Cada grupo: `totalCents`, `byCard: { cardId, totalCents }[]` e itens com `installmentNumber`, `installmentsCount`, valor e `remainingCents` (soma desta parcela e das seguintes do mesmo plano).

### 2.5 Ajustes nas funções da Fase 2

- `transactionDelta`: `invoice_payment` → `−amount` na conta de origem. Lançamentos com `creditCardId` não afetam contas (`accountId` nulo).
- `summarizeMonth`: ignora `invoice_payment` (e transferências); despesas e estornos no cartão contam pela data.
- `effectiveStatus(tx, today)` (em `lib/finance/status.ts`): para receitas e despesas no cartão (`creditCardId` preenchido e tipo `income`/`expense`), `date <= today` → `paid`, senão `pending`; para os demais, o `status` salvo. Usado no resumo, na lista e no filtro de status. Ao gravar linhas de cartão, `status = defaultStatus(date, today)`.

## 3. Server Actions e consultas

Validação com zod em `lib/validation/`: `card.ts` (cartão), `invoice-payment.ts` e `transaction.ts` ampliado (campo `paymentSource` = `{ kind: 'account' | 'card', id }`, `installments` 1–24, `inProgress` com `currentInstallment`). Retorno `ActionResult`. Erros novos em `lib/supabase/errors.ts`: `INVALID_CARD`, `INVALID_INVOICE`, `INVALID_PLAN`, `23503` de cartão ("Não é possível excluir: há lançamentos neste cartão. Arquive em vez de excluir.").

### 3.1 `lib/actions/cards.ts`

- `createCard`, `setCardArchived(id, archived)`, `deleteCard` (exclui as faturas vazias em cascata; com lançamentos, 23503).
- `updateCard(id, input)`: se `closing_day` e `due_day` não mudaram, update simples. Se mudaram, carrega as faturas abertas com seus lançamentos e planos, roda `rescheduleCard` e grava tudo por `apply_card_schedule` (os demais campos são atualizados antes, num update simples).

### 3.2 `lib/actions/transactions.ts` (ampliado)

- `createTransaction(input)`: com conta, fluxo da Fase 2. Com cartão, `buildCardPurchase` + `create_card_purchase`. Atualiza `last_account_id` ou `last_credit_card_id` de quem lançou.
- `updateTransaction(id, input)`: lançamento no cartão **sem plano** tem edição completa; se cartão ou data mudam, `ensure_invoice` + update (falha no segundo passo deixa no máximo uma fatura vazia). Trocar de conta para cartão ou o contrário também é permitido nesse caso.
- `updateInstallments(transactionId, scope: 'one' | 'future', { description, categoryId, notes })`: atualiza esta parcela ou as de `installment_number >=` a dela; com `'future'` atualiza também o plano.
- `deleteInstallments(transactionId, scope)`: apaga esta parcela ou esta e as futuras; se o plano ficar vazio, apaga o plano. Devolve snapshot `{ plan \| null, rows }`.
- `restoreTransactions(snapshot)`: chama `restore_card_transactions`.
- `deleteTransaction` e `restoreTransaction` da Fase 2 continuam para lançamentos sem plano (inclui pagamentos de fatura).

### 3.3 `lib/actions/invoices.ts`

- `payInvoice(invoiceId, { accountId, amountCents, date })`: insere `invoice_payment` com `credit_card_id` da fatura, `status = defaultStatus(date, today)` e descrição "Pagamento fatura {cartão} ({mmm/aaaa})". Valor acima do que falta gera aviso não bloqueante no formulário ("O excedente fica como crédito na fatura.").
- Editar/excluir pagamento reaproveita `updateTransaction`/`deleteTransaction` (com "Desfazer").

Todas as actions revalidam `/lancamentos`, `/contas`, `/cartoes`, `/parcelas` e `/inicio`.

### 3.4 Consultas (server-only)

- `lib/cards.ts`: `listCards({ includeArchived })` com `cardUsage` (sobre `v_invoice_totals`) e a fatura aberta atual (`cycleForDate(card, hoje)` + totais); `getCard(id)`.
- `lib/invoices.ts`: `listInvoiceMonths(cardId)` (meses de referência existentes, mais o ciclo atual); `getInvoiceView(cardId, referenceMonth)` com ciclo, totais, `invoiceStatus`, lançamentos (compras, parcelas com `installments_count` do plano, estornos) e pagamentos. Se o mês não tem fatura salva, mostra a fatura vazia do ciclo calculado.
- `lib/installments.ts`: `listUpcomingInstallments({ cardId? })` — parcelas cujas faturas têm `reference_month >=` mês atual, com plano e cartão.
- `lib/transactions.ts`: `TRANSACTION_COLUMNS` com as colunas novas e `installment_plans(installments_count)`; filtro `cartao` (lançamentos com esse `credit_card_id`, inclusive pagamentos de fatura); tipo `invoice_payment` no filtro de tipo; filtro de status usando a regra de `effectiveStatus` (para `pending`: `status = 'pending'` fora das receitas/despesas no cartão — inclui pagamentos de fatura — **ou** receita/despesa no cartão com `date > hoje`; análogo para `paid`).

## 4. Telas

### 4.1 Formulário rápido (botão "+")

- **Pagar com**: um seletor com grupos "Contas" e "Cartões" (só ativos; o atual aparece mesmo se arquivado, na edição). Pré-seleção: `last_credit_card_id` ou `last_account_id`, o que estiver preenchido e ativo; senão a primeira conta ativa; senão o primeiro cartão ativo. Transferência continua com **De**/**Para** só de contas.
- Com cartão e **Despesa**:
  - **Parcelas** (1x a 24x, padrão 1x) com prévia "3x de R$ 33,34" (primeira parcela) quando N ≥ 2;
  - link **"Compra já em andamento?"**, que troca o rótulo do valor para **"Valor da parcela"** e mostra "Parcela atual **X** de **N**" (a data passa a ser a da parcela atual);
- Com cartão e **Receita**: o rótulo vira "Estorno / crédito no cartão".
- Com cartão: dica abaixo da data "Cai na fatura de **novembro** (fecha 03/11, vence 10/11)", atualizada pela data (parcela atual, no modo em andamento); o campo **Status** some; o aviso de saldo inicial vale só para contas.
- **Editar parcela**: valor, Pagar com, data e parcelas desabilitados, com a nota "Para mudar valor, parcelas ou cartão, exclua e lance de novo." Ao salvar e ao excluir, pergunta **"Só esta parcela"** ou **"Esta e as futuras"**.
- Sem conta nem cartão ativos, o "+" mostra "Cadastre sua primeira conta ou cartão" com botões para `/contas` e `/cartoes`.

### 4.2 Cartões (`/cartoes`)

- Topo: limite total, usado e disponível dos cartões ativos.
- Cards por cartão: cor, nome, bandeira, "•••• 1234", valor parcial da fatura aberta com fechamento e vencimento, barra de uso do limite com o percentual em texto; cor de alerta (`--warning`) a partir de 80% e `--expense` a partir de 100%.
- **Novo cartão** (sheet no celular, modal no desktop) e "Mostrar arquivados". Estado vazio: "Cadastre seu primeiro cartão".
- Formulário do cartão: nome, bandeira, últimos 4 dígitos, limite (máscara de moeda), dia de fechamento, dia de vencimento, conta padrão de pagamento, cor. Na edição, se os dias mudarem: "Faturas abertas e futuras serão recalculadas; faturas fechadas não mudam."

### 4.3 Fatura (`/cartoes/[id]`)

- Seletor "‹ Fatura de novembro 2026 ›" com o parâmetro `mes` (= `reference_month`); padrão: a fatura do ciclo atual.
- Cabeçalho: selo de status com texto (Aberta, Fechada, Paga, Vencida — vencida em destaque), fechamento e vencimento, **Total**, **Pago**, **Falta pagar**, limite usado e disponível do cartão.
- Lista das compras da fatura por data: parcelas com "(3/10)", estornos com **+** (verde). Seção **Pagamentos** separada.
- **Pagar fatura**: sheet/modal com conta (padrão: conta padrão do cartão), valor (padrão: falta pagar) e data (padrão: hoje).
- Tocar num lançamento abre a edição. Ações do cartão: editar, arquivar/desarquivar, excluir.

### 4.4 Parcelas (`/parcelas`)

- Topo: total comprometido (todas as parcelas futuras) e filtro **Cartão** (`cartao` na URL).
- Grupos por mês de vencimento da fatura, do mês atual em diante: cabeçalho com o total do mês e subtotais por cartão.
- Itens: descrição, cartão, progresso "3/10", valor da parcela e saldo restante da compra. Tocar abre a edição da parcela. Estado vazio: "Nenhuma parcela pela frente".

### 4.5 Ajustes nas telas da Fase 2

- **Lançamentos**: itens no cartão mostram o cartão no lugar da conta e o sufixo "(k/N)" nas parcelas; pagamento de fatura com ícone de cartão, "Conta → Cartão" e sem sinal. Filtros ganham **Cartão** e o tipo "Pagamento de fatura". Status de receitas e despesas no cartão por `effectiveStatus`.
- **Extrato da conta**: pagamento de fatura aparece como saída.
- `/cartoes` e `/parcelas` substituem as páginas placeholder; o menu já tem os itens.

### 4.6 Regras de interface

Mesmas da Fase 2: mobile-first sem rolagem horizontal em 360px, desktop até 1280px, valores com `tabular-nums` à direita, receita/despesa e status nunca só pela cor, textos em pt-BR, datas dd/mm/aaaa.

## 5. Testes

**Unitários (`npm test`):**
- `addMonthsClamped`, `cycleForClosingMonth`, `cycleForDate`: exemplos do PRD; fechamento 31 em fevereiro (ano normal e bissexto); vencimento menor que o fechamento (vence no mês seguinte); compra no dia do fechamento; virada de ano.
- `invoiceStatus`: aberta, fechada, paga, vencida, pagamento parcial, estorno maior que as compras (total ≤ 0 → paga ao fechar).
- `splitInstallments`: 100,00 em 3x, divisão exata, 24x, 0,01 em 2x.
- `buildCardPurchase`: à vista; normal em N faturas consecutivas; compra em 29/01 com fechamento 30 (a parcela 2 não pula fatura); em andamento (X..N, parcela atual na fatura da data, data da compra estimada); estorno.
- `rescheduleCard`: compra muda de ciclo com o novo fechamento; fatura fechada intacta; destino fechado → fatura mais antiga do conjunto recalculado; plano em andamento mantém a âncora; plano normal recalcula.
- `cardUsage`, `groupInstallmentsByMonth` (totais por mês e por cartão, progresso, saldo restante).
- `transactionDelta`/`accountBalance`/`buildStatement` com `invoice_payment`; `summarizeMonth` ignorando `invoice_payment`; `effectiveStatus`.
- Schemas zod de cartão, pagamento de fatura e lançamento ampliado.

**Integração (`npm run test:rls`):**
1. Isolamento entre casas de `credit_cards`, `card_invoices`, `installment_plans`, `v_invoice_totals` e dos RPCs (leitura e escrita, mesmo com o id).
2. Trigger recusa cartão, fatura e plano de outra casa, fatura de outro cartão e plano de outro cartão (`INVALID_CARD`, `INVALID_INVOICE`, `INVALID_PLAN`).
3. Constraints de formato: despesa com conta e cartão, despesa no cartão sem fatura, `invoice_payment` sem conta, parcela com número fora do intervalo.
4. `create_card_purchase` é atômico: uma linha inválida não deixa plano, fatura nova nem lançamento.
5. `v_invoice_totals` e `v_account_balances` (com pagamento de fatura) batem com as funções TypeScript num cenário fixo.
6. Excluir cartão com lançamentos é recusado (`23503`); sem lançamentos, as faturas vazias vão junto.

**Manual:** lançar compra parcelada e em andamento pelo celular, conferir fatura, pagar parcial e total, mudar o dia de fechamento, tela de parcelas, layout em 360px e 1440px.

## 6. Critérios de aceite da Fase 3

1. Compra no cartão um dia antes do fechamento cai na fatura atual; no dia do fechamento, na seguinte.
2. Compra de R$ 100,00 em 3x gera 33,34 + 33,33 + 33,33 em três faturas consecutivas.
3. Compra em andamento "3 de 10, R$ 150,00" cria 8 parcelas e a parcela 3 cai na fatura atual.
4. A tela de parcelas mostra o total comprometido por mês somando todos os cartões.
5. Pagar uma fatura reduz o saldo da conta e não aparece como despesa no resumo; a fatura fica "Paga" quando quitada; pagamento parcial a deixa "Fechada" ou "Vencida".
6. Estorno abate o total da fatura e aparece como receita.
7. Mudar o dia de fechamento redistribui as compras das faturas abertas sem mexer nas fechadas.
8. Cartão com lançamentos só pode ser arquivado.
9. Sem rolagem horizontal em 360px; aproveita a largura em 1440px.
10. `npm test`, `npm run test:rls`, `npm run lint` e `npm run build` passam.

## Fora do escopo da Fase 3

Recorrência (inclusive no cartão) e orçamento (Fase 4); faturas abertas e comprometimento futuro no dashboard, relatórios e gastos por cartão (Fase 5); gastos do imóvel no cartão (Fase 6); skeletons e revisão de acessibilidade completa (Fase 7); importação de faturas (futuro).
