# Fase 5 — Dashboard e relatórios: design

Data: 05/10/2026 · Referência geral: [docs/PRD.md](../../PRD.md) (seções 5.1, 5.7, 7, 8.5, 9) · Fase anterior: [Fase 4](2026-10-05-fase-4-recorrencia-orcamento-design.md)

## Objetivo

Ver em uma tela como está o mês (o que entrou, o que saiu, o que ainda vai sair, as faturas a pagar e o orçamento) e, em outra, entender a evolução ao longo do tempo: onde o dinheiro vai, comparado ao período anterior, e quanto cada cartão consome. Exportar os lançamentos para planilha.

## Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Realizado x previsto | Cards e gráficos mostram **os dois, separados**: o pago em destaque e o previsto à parte (texto "previsto" nos cards; tom mais claro, empilhado, nos gráficos). Coerente com o resumo de Lançamentos e com o orçamento da Fase 4. |
| Período dos relatórios | Atalhos **Mês · Trimestre · Semestre · Ano · 12 meses** relativos ao mês do seletor, na URL (`?periodo=`). Comparação com o período anterior de mesmo tamanho; "Ano" compara com o mesmo trecho do ano anterior. |
| Exportação CSV | Botão **"Exportar CSV" na tela Lançamentos**, exportando exatamente o que está na tela (mês, filtros, busca). Relatórios tem só um link para Lançamentos. |
| Comprometimento futuro | **Parcelas + recorrências no cartão** (assinaturas), por mês de vencimento da fatura, 6 meses a partir do mês atual (hoje), com total e a divisão "parcelas · assinaturas". |
| Como calcular | **Buscar os lançamentos do período e agregar em funções puras** em `lib/finance`, reaproveitando `effectiveStatus`, a regra 8.5 e a soma de subcategorias na mãe. Sem views novas (desvio consciente das views `v_monthly_summary` / `v_category_spending` citadas no PRD 7: evitariam duplicar a regra de status do cartão em SQL). |

## 1. Banco de dados

Sem migration. O índice `transactions (household_id, date)` já cobre as consultas por período; as consultas usam tabelas e views existentes (`transactions`, `categories`, `accounts`/`v_account_balances`, `credit_cards`, `card_invoices`/`v_invoice_totals`, `budgets`), todas já sob RLS. Nenhum teste de RLS novo.

## 2. Regras de negócio (`lib/finance/`, funções puras com testes)

Regras comuns a todas as funções abaixo:

- Transferência e pagamento de fatura **não** são receita nem despesa (PRD 8.5).
- Status: o salvo para lançamentos em conta; para compras no cartão, pela data (`effectiveStatus`, Fase 3): data até hoje = realizado, depois = previsto.
- Despesa conta na data do lançamento (parcela k = data da compra + k−1 meses, já gravada assim).
- Estorno no cartão é `type = 'income'` com `credit_card_id`: conta como receita nos totais gerais (como em Lançamentos hoje) e **abate** o gasto do cartão em `cardMonthly`.
- Subcategoria soma na categoria-mãe; lançamento sem categoria entra em "Sem categoria".

### 2.1 `lib/finance/periods.ts`

- `REPORT_PERIODS = ['mes', 'trimestre', 'semestre', 'ano', '12m']` com rótulos "Mês", "Trimestre", "Semestre", "Ano", "12 meses".
- `parsePeriod(value)`: valor inválido ou ausente → `'mes'`.
- `periodRange(period, ym)` → `{ start: YearMonth; end: YearMonth }` (inclusivos):
  - `mes`: só `ym`; `trimestre`: `ym` e os 2 anteriores; `semestre`: `ym` e os 5 anteriores; `12m`: `ym` e os 11 anteriores; `ano`: janeiro do ano de `ym` até `ym`.
- `previousRange(period, ym)`: mesmo tamanho imediatamente antes; para `ano`, janeiro até o mesmo mês do ano anterior.
- `periodLabel(range)`: "out/2026" ou "ago–out/2026" ou "nov/2025–out/2026".

### 2.2 `lib/finance/reports.ts`

Entrada: linhas mínimas `{ type, status, date, amountCents, categoryId, accountId, creditCardId }` já com o status efetivo aplicado.

- `monthlySeries(rows, months: YearMonth[])` → por mês: `{ ym, income: { paid, pending }, expense: { paid, pending }, balancePaid, balanceProjected }` (mesma regra de `summarizeMonth`; meses sem lançamento saem zerados).
- `categoryTotals(rows, categories)` → `Map<parentId | 'none', { paid, pending }>` só de despesas.
- `compareCategories(current, previous, categories)` → linhas `{ categoryId, name, color, totalCents, pendingCents, previousCents, change }` onde `change` é `{ kind: 'pct', value }` (arredondado a inteiro), `{ kind: 'new' }` (anterior = 0 e atual > 0) ou `{ kind: 'gone' }` (atual = 0 e anterior > 0); categorias zeradas nos dois períodos ficam fora; ordem: maior `totalCents`, empate pelo nome. Total geral com a mesma estrutura.
- `topSlices(lines, n = 5)` → as `n` maiores e uma fatia "Outras" com a soma do resto (omitida se vazia); fatias com valor ≤ 0 não entram.
- `cardMonthly(rows, cards, months)` → por mês e cartão: compras (despesas) menos estornos, realizado + previsto somados; cartão sem movimento no período inteiro fica fora (inclusive arquivado).

### 2.3 `lib/finance/commitment.ts`

- `futureCommitment(rows, months)` com linhas `{ amountCents, referenceMonth, kind: 'installment' | 'recurrence' }` → por mês: `{ ym, installmentsCents, recurrencesCents, totalCents }`, sempre os 6 meses (zerados quando vazios). `maxTotal` para a barrinha proporcional.

### 2.4 `lib/finance/csv.ts`

- `transactionsCsv(rows, lookups)` → string com BOM (`\uFEFF`), separador `;`, quebra de linha `\r\n`.
- Cabeçalho: `Data;Descrição;Tipo;Categoria;Conta/Cartão;Status;Valor`.
- Data `dd/mm/aaaa`; tipo "Receita", "Despesa", "Transferência", "Pagamento de fatura"; categoria "Mãe › Sub" para subcategoria; conta/cartão pelo nome ("Itaú → Nubank" em transferência; pagamento de fatura "Itaú → Cartão Nubank"); status "Pago"/"Pendente" (efetivo); valor com vírgula decimal e sem separador de milhar; despesa negativa (`-1234,56`), receita (inclusive estorno no cartão) positiva, transferência e pagamento de fatura sem sinal.
- Descrição de parcela como na tela ("Geladeira (3/10)").
- Campo com `;`, `"`, `\r` ou `\n` vai entre aspas, com `"` duplicada. Campo de texto que começa com `=`, `+`, `-`, `@`, tab ou `\r` recebe `'` na frente (proteção contra fórmula no Excel).

## 3. Consultas e rota (server-only)

- `lib/dashboard.ts` — `getDashboard(ym, today)`, em paralelo:
  1. lançamentos de `ym − 5` até o fim de `ym`, colunas mínimas, paginados (`fetchAllPages`);
  2. contas ativas com saldo (`listAccounts`);
  3. cartões com faturas (`listCards` + faturas fechadas não pagas por cartão, de `v_invoice_totals`);
  4. orçamento do mês (`getBudgetMonth`);
  5. comprometimento: despesas de cartão com `installment_plan_id` ou `recurrence_id` cuja fatura tem `reference_month` entre o mês atual e +5, excluindo faturas já quitadas (pago ≥ total).
- `lib/reports.ts` — `getReports(ym, period, today)`: uma busca de lançamentos cobrindo do início do período anterior (ou de `ym − 11`, o que vier antes) até o fim de `ym` (máx. 24 meses), mais categorias e cartões (inclusive arquivados).
- `app/(app)/lancamentos/exportar/route.ts` — `GET` com os mesmos parâmetros de `/lancamentos` (`parseTransactionsQuery`), mesmas consultas (`listMonthTransactions` / `searchTransactions`) e status efetivo; resposta `text/csv; charset=utf-8` com `Content-Disposition: attachment; filename="lancamentos-2026-10.csv"` (ou `lancamentos-busca.csv`). Usa a sessão do usuário (RLS vale); sem sessão → 401. Erro na consulta → 500 com texto curto. Antes de escrever, conferir o guia de Route Handlers em `node_modules/next/dist/docs/`.
- `app/(app)/error.tsx` — tela de erro simples ("Não foi possível carregar esta tela" + "Tentar de novo"), já que hoje não existe nenhuma.

## 4. Telas

Gráficos com **Recharts** (dependência nova, versão estável atual), em componentes de cliente que recebem números prontos do servidor. Cada gráfico tem alternativa em texto (legenda ou tabela). Cores: tokens `--income`, `--expense`, `--primary` e a cor de cada categoria/cartão; previsto no mesmo tom com opacidade reduzida. Valores com `tabular-nums`; receita e despesa nunca só pela cor (sinal +/− ou rótulo).

### 4.1 Início (`/inicio`)

Seletor de mês no topo. Desktop: largura máxima do layout e grade de 3 colunas; celular: uma coluna.

- **Cards** (2×2 no celular, 4 em linha no desktop): Receitas, Despesas, Saldo do mês (mesmo formato do resumo de Lançamentos, reaproveitando o componente) e **Saldo das contas** (soma do saldo atual das contas ativas, rótulo "hoje", independente do seletor).
- **Despesas por categoria** (rosca): mês selecionado, realizado + previsto, `topSlices(5)`; legenda com nome, valor e %; cada item da legenda é link para `/lancamentos?mes=…&categoria=…` (exceto "Outras" e "Sem categoria"). Vazio: "Nenhuma despesa neste mês."
- **Receitas x despesas** (barras agrupadas, 6 meses terminando no selecionado): realizado sólido + previsto claro empilhado em cada barra; tooltip com os valores.
- **Faturas**: por cartão ativo, a fatura do ciclo de hoje (valor parcial, "fecha dd/mm", "vence dd/mm"), link para a fatura; faturas fechadas não quitadas aparecem antes, com selo "Fechada" ou "Vencida" (vencimento passado). Independente do seletor. Vazio: "Nenhum cartão cadastrado."
- **Comprometimento futuro**: 6 meses a partir do mês atual; por mês, total, barrinha proporcional ao maior mês e "parcelas R$ X · assinaturas R$ Y". Vazio: "Nada comprometido nos próximos 6 meses."
- **Orçamento**: as 5 linhas de maior proporção do mês selecionado (mesma barra e selos da tela Orçamento), link "Ver orçamento". Sem limites: "Defina limites em Orçamento."

### 4.2 Relatórios (`/relatorios`)

Seletor de mês no topo (preserva `?periodo`). Três blocos empilhados.

1. **Despesas por categoria**: atalhos de período (links com `aria-current`), rótulo dos dois intervalos ("ago–out/2026 x mai–jul/2026"); lista de `compareCategories` com bolinha da cor, total, "inclui R$ X previsto" quando houver, anterior e variação com ▲/▼ e sinal ("+12%", "−8%", "novo" quando não havia gasto antes, "—" quando zerou); linha de total. Vazio: "Nenhuma despesa no período."
2. **Evolução mensal** (12 meses terminando no selecionado, independente do atalho): barras de receitas e despesas (previsto claro) e linha do saldo do mês; abaixo, tabela mês a mês (Receitas, Despesas, Saldo), no celular recolhida em "Ver tabela".
3. **Gastos por cartão** (12 meses): barras empilhadas por cartão, na cor dele, e tabela mês × cartão com total. Vazio: "Nenhum gasto no cartão nos últimos 12 meses."

Rodapé: link "Exportar lançamentos (CSV)" para `/lancamentos`.

### 4.3 Lançamentos (ajuste)

Botão **"Exportar CSV"** na barra de filtros: link de download para `/lancamentos/exportar` com os parâmetros atuais (mês, filtros e busca).

## 5. Testes

**Unitários (`npm test`):**

- `periods`: cada atalho em outubro; trimestre e semestre atravessando a virada de ano (fevereiro); `ano` em janeiro (1 mês x janeiro anterior) e em outubro; `12m`; valor inválido; rótulos.
- `monthlySeries`: transferência e pagamento de fatura fora; pendente como previsto; meses vazios zerados; estorno como receita.
- `categoryTotals`/`compareCategories`: subcategoria (inclusive arquivada) na mãe; sem categoria; "novo", "gone", percentuais e arredondamento; ordem; zeradas fora.
- `topSlices`: menos de 5, exatamente 5, mais de 5 com "Outras".
- `cardMonthly`: estorno abate; mês negativo; cartão arquivado com gasto aparece, sem gasto não.
- `futureCommitment`: separação parcelas/assinaturas, meses zerados, `maxTotal`.
- `transactionsCsv`: BOM e cabeçalho; `;`, aspas e quebra de linha na descrição; descrição começando com `=` e `-`; transferência e pagamento de fatura; parcela; sinais e vírgula decimal; subcategoria "Mãe › Sub".

**Manual:** Início e Relatórios com dados das Fases 2–4 em 360px e 1440px; trocar mês e período; abrir o CSV no Excel.

## 6. Critérios de aceite da Fase 5

1. Os cards do Início batem com o resumo de Lançamentos do mesmo mês (receitas, despesas, saldo, realizado e previsto).
2. O saldo das contas no Início é a soma dos saldos da tela Contas (contas ativas).
3. A rosca mostra no máximo 6 fatias (5 + "Outras"), soma subcategorias na mãe e tocar numa categoria abre Lançamentos filtrado.
4. Pagamento de fatura e transferência não aparecem como despesa em nenhum gráfico.
5. O comprometimento futuro de uma compra de R$ 1.200 em 12x e uma assinatura de R$ 40 mostra R$ 140 por mês nos próximos 6 meses (R$ 100 parcelas · R$ 40 assinaturas), e some do mês cuja fatura foi quitada.
6. O orçamento no Início mostra as mesmas porcentagens e selos da tela Orçamento.
7. Em Relatórios, "Trimestre" com outubro compara ago–out com mai–jul; "Ano" em outubro compara jan–out/2026 com jan–out/2025.
8. Um estorno no cartão abate o gasto do cartão no mês.
9. "Exportar CSV" em Lançamentos baixa exatamente as linhas da tela, e o arquivo abre no Excel com acentos, colunas e valores corretos.
10. Sem rolagem horizontal em 360px; dashboard em 3 colunas em 1440px.
11. `npm test`, `npm run test:rls`, `npm run lint` e `npm run build` passam.

## Fora do escopo da Fase 5

Card do imóvel no dashboard e gastos do imóvel (Fase 6); skeletons, estados vazios caprichados e revisão de acessibilidade completa (Fase 7); importação de extratos (futuro); exportação em outros formatos (PDF, OFX); relatórios por conta ou por pessoa; metas de economia.
