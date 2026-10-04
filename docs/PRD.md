# PRD — CD (Controle de Danos)

Oct 4, 2026 · @Gustavo e Paula

> Transcrição do PDF original, para referência no repositório.

## 1. Visão geral

O CD (Controle de Danos) é um aplicativo web responsivo para um casal organizar as finanças em conjunto: tudo que entra e sai, cartões de crédito, parcelas futuras, gastos por categoria e os custos da compra de um imóvel na planta.

**Usuários:** duas pessoas (o casal), cada uma com seu próprio login, compartilhando os mesmos dados. Não há divisão de despesas entre os dois: todo dinheiro é do casal.

**Princípios do produto**

- Lançar um gasto deve levar menos de 10 segundos no celular.
- O usuário sempre sabe quanto já está comprometido nos próximos meses (faturas e parcelas).
- Os custos do imóvel ficam separados do dia a dia, mas podem refletir no fluxo de caixa sem lançamento duplicado.
- Idioma pt-BR, moeda BRL (R$), datas no formato dd/mm/aaaa, fuso America/Sao_Paulo.
- Tema escuro único, mobile-first.

## 2. Escopo

O MVP cobre todo o controle manual de finanças e o módulo do imóvel; importação de extratos fica para uma fase futura, mas o modelo de dados já deve prevê-la.

| Funcionalidade | MVP | Futuro |
|---|---|---|
| Login individual + casa compartilhada (convite) | Sim | |
| Contas (corrente, poupança, carteira, investimento) com saldo | Sim | |
| Lançamentos de receita, despesa e transferência | Sim | |
| Lançamentos recorrentes (salário, aluguel, assinaturas) | Sim | |
| Cartões de crédito com faturas automáticas | Sim | |
| Compras parceladas e visão consolidada de parcelas | Sim | |
| Categorias e subcategorias personalizáveis | Sim | |
| Orçamento mensal por categoria | Sim | |
| Dashboard e relatórios | Sim | |
| Módulo Imóvel na planta | Sim | |
| Importação de extrato/fatura (CSV e OFX) | | Sim |
| Anexo de comprovantes (Supabase Storage) | | Sim |
| Notificações de vencimento | | Sim |
| Metas de economia | | Sim |
| Open Finance | | Sim |

## 3. Stack técnica

Next.js com Supabase, deploy na Vercel; o Claude Code deve usar as versões estáveis mais recentes de cada pacote no momento da criação.

| Camada | Escolha | Observação |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) | Server Components e Server Actions para mutações |
| Estilo | Tailwind CSS + shadcn/ui | Tema escuro único |
| Ícones | lucide-react | |
| Gráficos | Recharts | |
| Formulários | react-hook-form + zod | Mesmos schemas zod validam no cliente e no servidor |
| Datas | date-fns com locale pt-BR | |
| Banco e Auth | Supabase (Postgres, Auth, Row Level Security) | Cliente via @supabase/ssr |
| Tipos do banco | Gerados com `supabase gen types typescript` | |
| Migrações | Supabase CLI, pasta `supabase/migrations` | Toda mudança de schema via migration versionada |
| Deploy | Vercel | Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Testes | Vitest para regras de negócio | Prioridade: cálculo de fatura e parcelas |

Estrutura sugerida de pastas: `app/(auth)` para login e cadastro, `app/(app)` para as telas logadas, `lib/finance` para regras de negócio puras (testáveis sem banco), `lib/supabase` para clientes e `components/ui` para o shadcn.

## 4. Autenticação e casa compartilhada

Cada pessoa tem login próprio no Supabase Auth, e todos os dados pertencem a uma "casa" (`household`) da qual os dois são membros.

1. Cadastro e login com e-mail e senha (Supabase Auth). Recuperação de senha por e-mail.
2. No primeiro acesso, o usuário cria a casa (ex.: "Casa da Ana e do Bruno") e vira membro dela.
3. Na tela de configurações, ele gera um código de convite (6 caracteres, válido por 7 dias, uso único).
4. O parceiro se cadastra e informa o código, entrando na mesma casa.
5. Limite de 2 membros por casa no MVP (o schema não impõe esse limite, só a regra da aplicação).

**Segurança (obrigatório)**

- Toda tabela de dados tem a coluna `household_id` e RLS habilitado.
- Política padrão: o usuário só lê e escreve linhas cujo `household_id` está em `household_members` para o seu `auth.uid()`.
- Criar uma função SQL `is_household_member(hid uuid)` com `security definer` e usá-la em todas as policies, evitando recursão.
- Nenhuma chave `service_role` no frontend.
- Cada lançamento registra `created_by` (quem lançou), apenas para histórico; não afeta cálculos.

## 5. Módulos do financeiro

São sete telas principais; todas filtram por mês com um seletor "‹ Outubro 2026 ›" no topo, exceto Configurações.

### 5.1 Dashboard

- Cards do mês: receitas, despesas, saldo do mês (receitas menos despesas) e saldo total das contas.
- Gráfico de rosca: despesas por categoria no mês.
- Gráfico de barras: receitas x despesas dos últimos 6 meses.
- Faturas abertas de cada cartão: valor parcial, data de fechamento e vencimento.
- Comprometimento futuro: total de parcelas a vencer nos próximos 6 meses, mês a mês.
- Orçamento: as 5 categorias mais próximas do limite, com barra de progresso.
- Card resumo do imóvel: total pago, total previsto e próximo pagamento.

### 5.2 Contas

- Tipos: conta corrente, poupança, carteira (dinheiro), investimento.
- Campos: nome, banco/instituição, tipo, saldo inicial, data do saldo inicial, cor, ativa/arquivada.
- Saldo atual = saldo inicial + receitas − despesas ± transferências (só lançamentos com status pago).
- Extrato por conta com saldo acumulado linha a linha.

### 5.3 Lançamentos

- Tipos: receita, despesa, transferência entre contas.
- Campos: descrição, valor, data, categoria, conta **ou** cartão de crédito, status (pago/pendente), observação.
- Despesa no cartão não sai da conta na data da compra; ela entra na fatura. O dinheiro só sai da conta quando a fatura é paga.
- Recorrência: mensal, semanal ou anual, com data final opcional. O sistema gera os lançamentos futuros como pendentes (ver regras na seção 8).
- Lista com busca por descrição e filtros por tipo, categoria, conta, cartão e status.
- Botão flutuante "+" em todas as telas abre o formulário rápido.

### 5.4 Cartões de crédito e faturas

- Campos do cartão: nome (ex.: "Nubank Ana"), bandeira, últimos 4 dígitos, limite, dia de fechamento, dia de vencimento, conta padrão de pagamento, cor.
- Faturas são geradas automaticamente por mês de referência, com status: aberta, fechada, paga.
- Tela da fatura: lista de compras e parcelas, total, limite usado e disponível.
- Pagar fatura: gera uma transferência da conta escolhida para o cartão, aceita pagamento parcial e marca a fatura como paga quando quitada.
- Estorno/crédito na fatura: lançamento negativo que abate o total.

### 5.5 Compras parceladas

- Ao lançar uma despesa no cartão, campo "Parcelas" (1 a 24). Informa-se o valor total; o sistema divide e distribui uma parcela por fatura.
- Permite lançar uma compra já em andamento (ex.: "começou em agosto, estou na parcela 3 de 10").
- Tela "Parcelas": visão consolidada de **todas as parcelas de todos os cartões**, agrupada por mês, com total por mês e por cartão, e filtro por cartão.
- Cada compra parcelada mostra progresso (ex.: 3/10) e o saldo restante.
- Editar ou excluir uma compra parcelada pergunta se afeta só esta parcela ou todas as futuras.

### 5.6 Categorias e orçamento

- Categorias separadas para receita e despesa, com uma subcategoria de nível opcional, ícone e cor.
- Categorias padrão criadas junto com a casa. Despesa: Moradia, Mercado, Alimentação fora, Transporte, Saúde, Educação, Lazer, Assinaturas, Vestuário, Pets, Presentes, Viagem, Imóvel, Outros. Receita: Salário, Freelance, Rendimentos, Reembolso, Outros.
- Orçamento mensal por categoria: valor limite e opção de repetir nos meses seguintes. Alerta visual em 80% e 100%.

### 5.7 Relatórios

- Despesas por categoria em um período, com comparação ao período anterior.
- Evolução mensal de receitas, despesas e saldo (12 meses).
- Gastos por cartão por mês.
- Exportar a lista filtrada de lançamentos em CSV.

## 6. Módulo Imóvel (compra na planta, financiada)

O módulo controla tudo que se paga na compra de um imóvel na planta, do sinal à entrega das chaves e depois dela, comparando o previsto com o realizado.

### 6.1 Cadastro do imóvel

- Empreendimento, construtora, unidade/bloco, endereço.
- Valor de compra, data de assinatura do contrato, previsão de entrega das chaves.
- Financiamento: banco, valor financiado, prazo em meses, sistema de amortização (SAC ou Price), taxa de juros anual.
- Fase atual: pré-chaves (em obra) ou pós-chaves.
- O schema suporta mais de um imóvel por casa; a interface mostra um imóvel principal com seletor se houver outros.

### 6.2 Tipos de gasto (pré-cadastrados e editáveis)

| Tipo | Fase típica | Descrição |
|---|---|---|
| Sinal / entrada | Assinatura | Pagamento inicial à construtora |
| Parcelas mensais à construtora | Obra | Mensais do plano de pagamento |
| Parcelas intermediárias (balões) | Obra | Semestrais ou anuais |
| Parcela das chaves | Entrega | Valor devido na entrega |
| Correção INCC | Obra | Diferença entre valor original e corrigido da parcela |
| Taxa de obra (evolução de obra) | Obra | Juros pagos ao banco durante a construção |
| Corretagem | Assinatura | Comissão da imobiliária, se houver |
| Avaliação do imóvel (banco) | Financiamento | Taxa do laudo de engenharia |
| Taxas bancárias | Financiamento | Análise de crédito, administração, tarifas |
| Seguros MIP e DFI | Financiamento | Embutidos nas parcelas do banco |
| ITBI | Financiamento | Imposto municipal de transmissão |
| Registro em cartório | Financiamento | Registro do contrato na matrícula |
| Escritura / certidões | Financiamento | Certidões, reconhecimento de firma |
| Despachante / assessoria | Financiamento | Serviços de documentação |
| Parcelas do financiamento | Pós-chaves | Amortização + juros ao banco |
| Condomínio e fundo de reserva | Pós-chaves | Inclui taxa de constituição do condomínio |
| IPTU | Pós-chaves | |
| Ligações (água, luz, gás) | Entrega | |
| Vistoria de entrega | Entrega | Engenheiro contratado para a vistoria |
| Acabamento, móveis planejados, mudança | Pós-chaves | |
| Outros | Qualquer | |

### 6.3 Gastos e cronograma

- Cada gasto tem: tipo, descrição, favorecido, valor previsto, valor pago, data de vencimento, data de pagamento, status (previsto, pago, atrasado), fonte do recurso (recursos próprios, FGTS, financiamento), observação.
- Gerador do plano de pagamento: informar valor e quantidade das mensais, intermediárias e chaves, com a data inicial; o sistema cria os gastos previstos.
- Ao pagar uma parcela da construtora, o usuário informa o valor efetivamente pago; a diferença sobre o previsto é exibida como correção (INCC).

### 6.4 Telas

- **Resumo:** valor do imóvel, total previsto, total pago, total a pagar, % pago, total pago em correção INCC, total pago em taxa de obra, total por fonte (próprios, FGTS, financiamento).
- **Cronograma:** gastos por mês com previsto x realizado e linha do tempo até a entrega das chaves.
- **Por tipo:** total previsto e pago por tipo de gasto.
- **Lista de gastos:** com filtros por tipo, status, fonte e período.

### 6.5 Integração com o financeiro

- Ao marcar um gasto como pago com fonte "recursos próprios", o formulário oferece (ligado por padrão) criar a despesa no financeiro: escolhe-se a conta ou cartão, e a categoria é "Imóvel".
- O vínculo é guardado em `property_expenses.transaction_id`. Editar ou excluir um lado atualiza ou pergunta sobre o outro, evitando lançamentos duplicados.
- Gastos com fonte FGTS ou financiamento não geram lançamento em conta, porque o dinheiro não passa pelas contas do casal.

## 7. Modelo de dados (Supabase / Postgres)

São 16 tabelas; valores monetários sempre em centavos (`bigint`, sufixo `_cents`) e IDs em `uuid`.

Colunas comuns a todas as tabelas de dados: `id uuid pk default gen_random_uuid()`, `household_id uuid not null`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz` (trigger de atualização).

| Tabela | Campos principais | Notas |
|---|---|---|
| `households` | name | Sem household_id (é a própria casa) |
| `household_members` | household_id, user_id, display_name, role (owner, member) | PK composta (household_id, user_id) |
| `household_invites` | code, expires_at, used_at, used_by | Code único |
| `accounts` | name, institution, type (checking, savings, cash, investment), initial_balance_cents, initial_balance_date, color, archived | |
| `credit_cards` | name, brand, last_four, limit_cents, closing_day, due_day, default_payment_account_id, color, archived | closing_day e due_day entre 1 e 31 |
| `card_invoices` | credit_card_id, reference_month (date, dia 1), closing_date, due_date, status (open, closed, paid) | Unique (credit_card_id, reference_month) |
| `categories` | name, kind (income, expense), parent_id, icon, color, is_default, archived | Um nível de subcategoria |
| `installment_plans` | credit_card_id, category_id, description, total_amount_cents, installments_count, first_installment_number, purchase_date | Agrupa as parcelas de uma compra |
| `recurrences` | description, type, amount_cents, category_id, account_id, credit_card_id, frequency (weekly, monthly, yearly), start_date, end_date, generated_until | Modelo dos lançamentos recorrentes |
| `transactions` | type (income, expense, transfer, invoice_payment), description, amount_cents, date, status (paid, pending), category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, recurrence_id, source (manual, recurrence, property, import), external_id, notes | Tabela central |
| `budgets` | category_id, month (date, dia 1), amount_cents | Unique (category_id, month) |
| `properties` | name, developer, unit, address, purchase_price_cents, contract_date, expected_delivery_date, phase (pre_keys, post_keys), bank, financed_amount_cents, term_months, amortization_system (sac, price), annual_interest_rate | |
| `property_expense_types` | name, typical_phase, sort_order, is_default | Seed com a lista da seção 6.2 |
| `property_expenses` | property_id, expense_type_id, description, payee, planned_amount_cents, paid_amount_cents, due_date, paid_date, status (planned, paid), funding_source (own, fgts, financing), transaction_id, notes | "Atrasado" é calculado, não salvo |
| `imports` | file_name, file_type (csv, ofx), status, imported_count | Só na fase futura |
| `profiles` | user_id, display_name, avatar_url | Opcional, dados do usuário |

**Constraints importantes em `transactions`**

- `amount_cents > 0`; o sinal vem do `type`.
- Despesa ou receita: exatamente um entre `account_id` e `credit_card_id`.
- Despesa no cartão exige `invoice_id`.
- `transfer` exige `account_id` e `destination_account_id` diferentes.
- `invoice_payment` exige `account_id` e `invoice_id`.
- `external_id` único por casa, para evitar duplicatas na importação futura.

**Views e índices**

- `v_account_balances`: saldo atual por conta.
- `v_invoice_totals`: total, valor pago e saldo de cada fatura.
- `v_monthly_summary`: receitas, despesas e saldo por mês.
- `v_category_spending`: despesas por categoria e mês, comparadas ao orçamento.
- Índices em `(household_id, date)`, `(invoice_id)`, `(installment_plan_id)` e `(property_id, due_date)`.
- Views criadas com `security_invoker = true` para respeitar o RLS.

## 8. Regras de negócio

As regras abaixo devem viver em `lib/finance` como funções puras, cobertas por testes unitários antes das telas.

### 8.1 Valores

- Todo valor é inteiro em centavos no banco e no código; conversão para reais só na exibição (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).
- Campo de valor com máscara de moeda brasileira (vírgula decimal).

### 8.2 Em qual fatura cai uma compra

- Dia de fechamento maior que os dias do mês usa o último dia do mês (ex.: fechamento 31 em fevereiro vira 28 ou 29).
- Compra **antes** do dia de fechamento entra na fatura que fecha naquele mês; compra **no dia ou depois** do fechamento vai para a fatura seguinte.
- Vencimento: se o dia de vencimento for maior que o de fechamento, vence no mesmo mês do fechamento; senão, no mês seguinte.
- `reference_month` da fatura = mês do vencimento (a "fatura de novembro" é a que vence em novembro).
- A fatura é criada sob demanda quando o primeiro lançamento cai nela.
- Alterar o dia de fechamento ou vencimento afeta só faturas ainda não fechadas.
- Exemplo para testes: fechamento dia 3, vencimento dia 10. Compra em 02/10 vai para a fatura que fecha em 03/10 e vence em 10/10. Compra em 03/10 vai para a fatura que fecha em 03/11 e vence em 10/11.

### 8.3 Parcelamento

- Valor da parcela = total dividido pelo número de parcelas (divisão inteira em centavos); o resto dos centavos vai para a primeira parcela. Ex.: R$ 100,00 em 3x = 33,34 + 33,33 + 33,33.
- A parcela 1 cai na fatura da data da compra; a parcela k cai k−1 faturas depois.
- Cada parcela é uma linha em `transactions` ligada ao `installment_plan_id`, com `installment_number` e descrição exibida como "Geladeira (3/10)".
- Compra já em andamento: o usuário informa a parcela atual; o sistema cria só as parcelas da atual em diante.
- Limite usado do cartão = soma de todas as parcelas e compras ainda não pagas (faturas abertas, fechadas e futuras) menos pagamentos.

### 8.4 Status da fatura

- Aberta: hoje é anterior à data de fechamento.
- Fechada: passou do fechamento e o total pago é menor que o total da fatura.
- Paga: soma dos pagamentos (`invoice_payment`) maior ou igual ao total.
- Fechada e com vencimento passado sem pagamento total aparece destacada como "vencida".

### 8.5 O que conta como receita e despesa

- Despesas do mês = despesas em conta + despesas no cartão, pela data do lançamento (para parcelas, a data da parcela = data da compra + k−1 meses).
- Pagamento de fatura **não** é despesa (a despesa já foi contada na compra) e transferências não são receita nem despesa. Isso evita contagem dupla.
- Saldo das contas considera apenas lançamentos com status pago, incluindo pagamentos de fatura.
- Lançamentos pendentes aparecem como "previsto" no mês, separados do realizado.

### 8.6 Recorrência

- Ao abrir o app, uma rotina verifica cada recorrência e gera os lançamentos pendentes até 12 meses à frente (`generated_until`).
- Editar a recorrência altera apenas os lançamentos futuros ainda pendentes.
- Recorrência no cartão (assinaturas) gera o lançamento na fatura correta pela regra 8.2.

### 8.7 Exclusão

- Contas, cartões e categorias com lançamentos não são excluídos, apenas arquivados.
- Excluir uma compra parcelada pergunta: "só esta parcela" ou "esta e as futuras".

## 9. UI/UX

Tema escuro único, desenhado primeiro para celular (360 px) e expandido para desktop (a partir de 1024 px).

### 9.1 Paleta (tokens CSS no `:root`)

| Token | Cor | Uso |
|---|---|---|
| `--background` | #0B0F14 | Fundo da página |
| `--surface` | #131A22 | Cards e painéis |
| `--surface-2` | #1B2430 | Inputs, hover, linhas alternadas |
| `--border` | #263241 | Bordas e divisores |
| `--text` | #E6EDF3 | Texto principal |
| `--text-muted` | #8B98A5 | Texto secundário |
| `--primary` | #3B82F6 | Botões e destaques |
| `--income` | #22C55E | Receitas, valores positivos |
| `--expense` | #EF4444 | Despesas, valores negativos |
| `--warning` | #F59E0B | Orçamento perto do limite, faturas vencendo |

Contraste mínimo WCAG AA. Receita e despesa nunca diferenciadas só pela cor: usar também sinal (+/−) ou ícone.

### 9.2 Navegação

- **Celular:** barra inferior fixa com 5 itens: Início, Lançamentos, botão "+" central, Cartões, Mais (Parcelas, Contas, Imóvel, Relatórios, Orçamento, Configurações). Respeitar a safe area do iPhone.
- **Desktop:** menu lateral fixo com todos os itens, conteúdo com largura máxima de 1280 px e dashboard em grade de 3 colunas.
- Formulário de lançamento: abre como bottom sheet no celular e como modal no desktop.

### 9.3 Detalhes de experiência

- Formulário rápido: valor em destaque com teclado numérico (`inputmode="decimal"`), depois descrição, categoria (chips das mais usadas), conta/cartão e data (padrão hoje).
- Lembrar a última conta/cartão usada por usuário.
- Tabelas viram listas de cards no celular.
- Estados de carregamento com skeleton, estados vazios com chamada para a primeira ação, toasts de confirmação com "desfazer" na exclusão.
- Valores sempre alinhados à direita e com fonte tabular (`font-variant-numeric: tabular-nums`).

## 10. Fases de implementação e critérios de aceite

O Claude Code deve entregar em 7 fases, cada uma funcionando de ponta a ponta antes da próxima, e parar ao fim de cada fase para revisão.

1. **Fundação:** projeto Next.js, Tailwind, shadcn com tema escuro, layout responsivo (barra inferior e menu lateral), cliente Supabase, migrations iniciais com RLS, login, cadastro, criação da casa e convite.
2. **Contas, categorias e lançamentos:** CRUD de contas e categorias (com seed padrão), lançamentos de receita, despesa e transferência, lista com filtros, saldo por conta.
3. **Cartões, faturas e parcelas:** CRUD de cartões, regra de fatura (8.2) com testes, compras parceladas (8.3) com testes, tela da fatura, pagamento de fatura, tela consolidada de parcelas.
4. **Recorrência e orçamento:** recorrências com geração automática, orçamento por categoria com alertas.
5. **Dashboard e relatórios:** todos os cards e gráficos das seções 5.1 e 5.7, exportação CSV.
6. **Imóvel:** cadastro, tipos de gasto (seed), gastos, gerador do plano de pagamento, telas de resumo, cronograma e por tipo, integração com o financeiro.
7. **Polimento:** estados vazios, skeletons, revisão de acessibilidade e testes em celular real.

**Critérios de aceite do MVP**

- [ ] Os dois usuários, logados em aparelhos diferentes, veem e editam os mesmos dados.
- [ ] Um usuário de outra casa não consegue ler nenhum dado (testar consultando direto pela API do Supabase).
- [ ] Compra no cartão um dia antes do fechamento cai na fatura atual; no dia do fechamento, na seguinte.
- [ ] Compra de R$ 100,00 em 3x gera 33,34 + 33,33 + 33,33 em três faturas consecutivas.
- [ ] A tela de parcelas mostra o total comprometido por mês somando todos os cartões.
- [ ] Pagar uma fatura reduz o saldo da conta e não aparece como despesa nos relatórios.
- [ ] Pagar um gasto do imóvel com recursos próprios cria uma única despesa na categoria Imóvel, e excluir um lado trata o outro.
- [ ] Todas as telas funcionam sem rolagem horizontal em 360 px e aproveitam a largura em 1440 px.
- [ ] Testes unitários de fatura, parcelas e saldos passando.

## 11. Premissas e roadmap futuro

Alguns pontos não foram discutidos e seguem um padrão assumido; ajuste antes de enviar ao Claude Code, se preciso.

**Premissas assumidas**

- Compra feita no dia do fechamento vai para a próxima fatura (regra mais comum entre bancos brasileiros).
- O resto dos centavos de uma compra parcelada vai para a primeira parcela.
- Orçamento por categoria faz parte do MVP.
- O app não terá modo claro.
- Um imóvel principal, com o schema já preparado para mais de um.
- Correção do INCC registrada manualmente a cada pagamento, sem cálculo automático pelo índice.

**Roadmap futuro**

- Importação de extratos e faturas em CSV e OFX, com tela de revisão antes de salvar, sugestão de categoria por descrição e deduplicação por `external_id`.
- Anexo de comprovantes e contratos do imóvel no Supabase Storage.
- Notificações de vencimento de fatura e de parcelas do imóvel.
- Metas de economia (ex.: reserva para os móveis planejados).
- Simulador de financiamento pós-chaves (SAC x Price) e cálculo automático do INCC.
- Instalação como PWA no celular.
