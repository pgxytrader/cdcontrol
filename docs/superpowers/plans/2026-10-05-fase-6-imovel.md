# Fase 6 — Imóvel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo Imóvel completo: cadastro do imóvel, tipos de gasto (seed), gastos com previsto x pago, gerador do plano de pagamento, telas Resumo/Cronograma/Por tipo/Gastos, integração com Lançamentos (um lançamento por gasto pago com recursos próprios, só leitura em Lançamentos) e card no Início.

**Architecture:** Três tabelas novas com RLS (`properties`, `property_expense_types`, `property_expenses`), triggers que protegem o lançamento ligado e RPCs atômicos (`security invoker`) para criar, pagar, desmarcar, excluir e restaurar. Toda regra (status, INCC, resumo, cronograma, gerador, lançamento do pagamento) é função pura em `lib/finance/property*.ts`; a fatura do cartão é resolvida em TypeScript pela regra 8.2 (Fase 3).

**Tech Stack:** Next.js 16.3 (App Router; `searchParams` e `params` são Promise), React 19, TypeScript strict, Tailwind 4, Supabase (Postgres + RLS + RPC), zod 4, Vitest 5.

**Spec:** [docs/superpowers/specs/2026-10-05-fase-6-imovel-design.md](../specs/2026-10-05-fase-6-imovel-design.md)

## Global Constraints

- Valores sempre inteiros em centavos (`bigint`, sufixo `_cents`); formatação só na exibição (`formatBRL`, `formatSignedBRL`).
- Tabelas novas: `household_id ... references households on delete cascade`, `created_by default auth.uid()`, `created_at`, `updated_at` com trigger `set_updated_at`, RLS `for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))`, `revoke all ... from anon`, `revoke truncate, references, trigger ... from authenticated`.
- Triggers de validação: `security definer`, `set search_path = ''`, `revoke all on function ... from public, anon, authenticated`. RPCs: `security invoker`, `set search_path = ''`, `revoke all ... from public, anon` + `grant execute ... to authenticated`.
- Lançamento ligado a um gasto: `type = 'expense'`, `source = 'property'`, `status = 'paid'`, descrição `"Imóvel: <descrição>"` (máx. 120). Só os RPCs mudam tipo, valor, data, status, conta, cartão, categoria, destino ou source dele (`app.property_sync`); descrição, observação e `invoice_id` continuam editáveis.
- Data de pagamento nunca futura (`paid_date <= hoje`, hoje = `todayISO()`, fuso America/Sao_Paulo).
- FGTS e financiamento nunca geram lançamento.
- Textos em pt-BR. Status sempre em texto ("Previsto", "Pago", "Atrasado"), nunca só cor. Valores com `tabular-nums`.
- Formulários abrem em `ResponsiveModal` (sheet no celular, dialog no desktop). Sem rolagem horizontal em 360px.
- Server Actions terminam com `revalidatePath('/', 'layout')` e devolvem `ActionResult` (`lib/action-result.ts`); erros do banco passam por `translateError`.
- Next 16: ler `node_modules/next/dist/docs/` antes de usar uma API que você não viu neste repo (ex.: `params` de rota dinâmica é Promise).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos: `npm test`, `npm run test:rls`, `npm run lint`, `npm run build`, `npx tsc --noEmit`, `yes | npm run db:push`, `npm run db:types`.

## Review Focus

1. **Trocar a fonte de um gasto pago de "recursos próprios" para FGTS** deve apagar o lançamento ligado (e não deixar lançamento órfão). Teste RLS em Task 1 (`pay_property_expense` sem `p_transaction` apaga o lançamento).
2. **Mudar os dias de um cartão** que tem lançamento do imóvel não pode quebrar: `invoice_id` fica fora do bloqueio. Teste RLS em Task 1 (update só de `invoice_id` passa).
3. **Imóvel sem nenhum gasto**: Resumo zerado com `paidRatio = 0`, cronograma vazio, por tipo vazio — nada de divisão por zero. Testes em Task 2.
4. **Gerador com 1º vencimento no dia 31** e intermediárias anuais atravessando fevereiro de ano bissexto: datas presas ao último dia e voltando a 31. Testes em Task 3.
5. **Pagamento com data futura** é recusado com mensagem no campo. Teste em Task 4 (`paymentSchema` com `today`).

---

### Task 1: Banco — tabelas, seed, triggers e RPCs do imóvel

**Files:**
- Create: `supabase/migrations/20261006120000_imovel.sql`
- Modify: `lib/supabase/database.types.ts` (regerado)
- Test: `tests/rls/property.rls.test.ts`

**Interfaces:**
- Produces (SQL, usados pelas Tasks 5–10):
  - tabelas `properties`, `property_expense_types`, `property_expenses` (colunas da spec 1.1–1.3);
  - `create_property_expenses(p_property_id uuid, p_rows jsonb) returns uuid[]` — linhas `{ expense_type_id, description, payee, planned_amount_cents, due_date, funding_source, notes }`;
  - `pay_property_expense(p_expense_id uuid, p_paid jsonb, p_transaction jsonb) returns uuid` — `p_paid { paid_amount_cents, paid_date, funding_source }`; `p_transaction { description, amount_cents, date, status, category_id, account_id, credit_card_id, closing_month, closing_date, due_date, reference_month }` ou `null`;
  - `unpay_property_expense(p_expense_id uuid) returns void`;
  - `delete_property_expenses(p_ids uuid[]) returns void`;
  - `restore_property_expenses(p_expenses jsonb, p_transactions jsonb) returns void`;
  - `delete_property(p_property_id uuid) returns void`;
  - erros `INVALID_PROPERTY`, `INVALID_EXPENSE`, `INVALID_EXPENSE_TYPE`, `INVALID_TRANSACTION`, `PROPERTY_LOCKED`, `INVALID_INPUT`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20261006120000_imovel.sql
-- Fase 6 — Imóvel.

-- =====================================================================
-- Imóveis
-- =====================================================================

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  developer text check (developer is null or char_length(developer) <= 200),
  unit text check (unit is null or char_length(unit) <= 200),
  address text check (address is null or char_length(address) <= 200),
  purchase_price_cents bigint not null check (purchase_price_cents >= 0),
  contract_date date,
  expected_delivery_date date,
  phase text not null default 'pre_keys' check (phase in ('pre_keys', 'post_keys')),
  bank text check (bank is null or char_length(bank) <= 80),
  financed_amount_cents bigint check (financed_amount_cents is null or financed_amount_cents >= 0),
  term_months integer check (term_months is null or term_months between 1 and 600),
  amortization_system text check (amortization_system is null or amortization_system in ('sac', 'price')),
  annual_interest_rate numeric(6, 4) check (annual_interest_rate is null or annual_interest_rate between 0 and 100),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_household_id_idx on public.properties (household_id);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Tipos de gasto (seed por casa; system_key fixa para as regras)
-- =====================================================================

create table public.property_expense_types (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  typical_phase text not null check (typical_phase in ('signing', 'construction', 'delivery', 'financing', 'post_keys', 'any')),
  sort_order integer not null,
  is_default boolean not null default false,
  system_key text,
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_expense_types_household_id_idx on public.property_expense_types (household_id);
create unique index property_expense_types_system_key_idx
  on public.property_expense_types (household_id, system_key)
  where system_key is not null;

create trigger property_expense_types_set_updated_at
  before update on public.property_expense_types
  for each row execute function public.set_updated_at();

create or replace function public.seed_property_expense_types(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.property_expense_types (household_id, name, typical_phase, sort_order, is_default, system_key)
  values
    (p_household_id, 'Sinal / entrada', 'signing', 1, true, 'down_payment'),
    (p_household_id, 'Parcelas mensais à construtora', 'construction', 2, true, 'monthly'),
    (p_household_id, 'Parcelas intermediárias (balões)', 'construction', 3, true, 'intermediate'),
    (p_household_id, 'Parcela das chaves', 'delivery', 4, true, 'keys'),
    (p_household_id, 'Correção INCC', 'construction', 5, true, 'incc'),
    (p_household_id, 'Taxa de obra (evolução de obra)', 'construction', 6, true, 'construction_interest'),
    (p_household_id, 'Corretagem', 'signing', 7, true, 'brokerage'),
    (p_household_id, 'Avaliação do imóvel (banco)', 'financing', 8, true, 'appraisal'),
    (p_household_id, 'Taxas bancárias', 'financing', 9, true, 'bank_fees'),
    (p_household_id, 'Seguros MIP e DFI', 'financing', 10, true, 'insurance'),
    (p_household_id, 'ITBI', 'financing', 11, true, 'itbi'),
    (p_household_id, 'Registro em cartório', 'financing', 12, true, 'registry'),
    (p_household_id, 'Escritura / certidões', 'financing', 13, true, 'deed'),
    (p_household_id, 'Despachante / assessoria', 'financing', 14, true, 'dispatcher'),
    (p_household_id, 'Parcelas do financiamento', 'post_keys', 15, true, 'financing_installment'),
    (p_household_id, 'Condomínio e fundo de reserva', 'post_keys', 16, true, 'condo'),
    (p_household_id, 'IPTU', 'post_keys', 17, true, 'iptu'),
    (p_household_id, 'Ligações (água, luz, gás)', 'delivery', 18, true, 'utilities'),
    (p_household_id, 'Vistoria de entrega', 'delivery', 19, true, 'inspection'),
    (p_household_id, 'Acabamento, móveis planejados, mudança', 'post_keys', 20, true, 'finishing'),
    (p_household_id, 'Outros', 'any', 21, true, 'other')
  on conflict (household_id, system_key) where system_key is not null do nothing;
end;
$$;

-- create_household (Fase 2) passa a criar também os tipos de gasto do imóvel
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

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if exists (select 1 from public.household_members m where m.user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.households (name, created_by)
  values (v_name, v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_uid, 'owner');

  perform public.seed_default_categories(v_household_id);
  perform public.seed_property_expense_types(v_household_id);

  return v_household_id;
end;
$$;

-- Casas que já existem
select public.seed_property_expense_types(h.id) from public.households h;

-- =====================================================================
-- Gastos do imóvel
-- =====================================================================

create table public.property_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  expense_type_id uuid not null references public.property_expense_types (id) on delete restrict,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  payee text check (payee is null or char_length(payee) <= 80),
  planned_amount_cents bigint not null check (planned_amount_cents >= 0),
  due_date date not null,
  status text not null default 'planned' check (status in ('planned', 'paid')),
  paid_amount_cents bigint check (paid_amount_cents is null or paid_amount_cents > 0),
  paid_date date,
  funding_source text not null default 'own' check (funding_source in ('own', 'fgts', 'financing')),
  transaction_id uuid unique references public.transactions (id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_expenses_paid check (
    (status = 'paid' and paid_amount_cents is not null and paid_date is not null)
    or (status = 'planned' and paid_amount_cents is null and paid_date is null)
  ),
  constraint property_expenses_transaction check (
    transaction_id is null or (status = 'paid' and funding_source = 'own')
  )
);

create index property_expenses_household_id_idx on public.property_expenses (household_id);
create index property_expenses_property_due_idx on public.property_expenses (property_id, due_date);
create index property_expenses_expense_type_id_idx on public.property_expenses (expense_type_id);

create trigger property_expenses_set_updated_at
  before update on public.property_expenses
  for each row execute function public.set_updated_at();

create or replace function public.property_expenses_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.properties p where p.id = new.property_id and p.household_id = new.household_id
  ) then
    raise exception 'INVALID_PROPERTY';
  end if;

  if not exists (
    select 1 from public.property_expense_types t where t.id = new.expense_type_id and t.household_id = new.household_id
  ) then
    raise exception 'INVALID_EXPENSE_TYPE';
  end if;

  if new.transaction_id is not null and not exists (
    select 1 from public.transactions t
    where t.id = new.transaction_id and t.household_id = new.household_id and t.source = 'property'
  ) then
    raise exception 'INVALID_TRANSACTION';
  end if;

  return new;
end;
$$;

create trigger property_expenses_check_refs
  before insert or update on public.property_expenses
  for each row execute function public.property_expenses_check_refs();

-- =====================================================================
-- Lançamento ligado: só os RPCs do imóvel mudam o que vem do gasto
-- =====================================================================

create or replace function public.transactions_property_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.property_sync', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.source = 'property' then
      raise exception 'PROPERTY_LOCKED';
    end if;
    return new;
  end if;

  -- invoice_id fica de fora: mudar os dias do cartão (Fase 3) move lançamentos entre faturas
  if (old.source = 'property' or new.source = 'property') and (
    new.type is distinct from old.type
    or new.amount_cents is distinct from old.amount_cents
    or new.date is distinct from old.date
    or new.status is distinct from old.status
    or new.account_id is distinct from old.account_id
    or new.credit_card_id is distinct from old.credit_card_id
    or new.category_id is distinct from old.category_id
    or new.destination_account_id is distinct from old.destination_account_id
    or new.source is distinct from old.source
  ) then
    raise exception 'PROPERTY_LOCKED';
  end if;

  return new;
end;
$$;

create trigger transactions_property_guard
  before insert or update on public.transactions
  for each row execute function public.transactions_property_guard();

-- Excluir o lançamento (por qualquer caminho) volta o gasto ligado para previsto
create or replace function public.transactions_property_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.source = 'property' then
    update public.property_expenses e
    set status = 'planned', paid_amount_cents = null, paid_date = null, transaction_id = null
    where e.transaction_id = old.id;
  end if;
  return old;
end;
$$;

create trigger transactions_property_unlink
  before delete on public.transactions
  for each row execute function public.transactions_property_unlink();

-- =====================================================================
-- RPCs (security invoker: o RLS vale para quem chama)
-- =====================================================================

-- Gastos previstos (gerador e "novo gasto"), numa transação
create or replace function public.create_property_expenses(p_property_id uuid, p_rows jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_ids uuid[];
begin
  select p.household_id into v_household_id from public.properties p where p.id = p_property_id;
  if not found then
    raise exception 'INVALID_PROPERTY';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 500 then
    raise exception 'INVALID_INPUT';
  end if;

  with inserted as (
    insert into public.property_expenses (
      household_id, property_id, expense_type_id, description, payee,
      planned_amount_cents, due_date, funding_source, notes
    )
    select
      v_household_id,
      p_property_id,
      (x.value ->> 'expense_type_id')::uuid,
      x.value ->> 'description',
      x.value ->> 'payee',
      (x.value ->> 'planned_amount_cents')::bigint,
      (x.value ->> 'due_date')::date,
      coalesce(x.value ->> 'funding_source', 'own'),
      x.value ->> 'notes'
    from jsonb_array_elements(p_rows) as x
    returning id
  )
  select coalesce(array_agg(inserted.id), '{}') into v_ids from inserted;

  return v_ids;
end;
$$;

-- Pagar (ou editar um pagamento). Com p_transaction cria/atualiza o lançamento ligado;
-- sem p_transaction apaga o lançamento ligado, se houver.
create or replace function public.pay_property_expense(p_expense_id uuid, p_paid jsonb, p_transaction jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expense public.property_expenses%rowtype;
  v_tx uuid;
  v_card uuid;
  v_invoice uuid;
  v_source text := coalesce(p_paid ->> 'funding_source', '');
begin
  select * into v_expense from public.property_expenses e where e.id = p_expense_id for update;
  if not found then
    raise exception 'INVALID_EXPENSE';
  end if;

  perform set_config('app.property_sync', 'on', true);
  v_tx := v_expense.transaction_id;

  if p_transaction is null or jsonb_typeof(p_transaction) <> 'object' then
    update public.property_expenses e
    set status = 'paid',
        paid_amount_cents = (p_paid ->> 'paid_amount_cents')::bigint,
        paid_date = (p_paid ->> 'paid_date')::date,
        funding_source = v_source,
        transaction_id = null
    where e.id = p_expense_id;

    if v_tx is not null then
      delete from public.transactions t where t.id = v_tx;
    end if;

    perform set_config('app.property_sync', 'off', true);
    return null;
  end if;

  if v_source <> 'own' then
    raise exception 'INVALID_INPUT';
  end if;

  v_card := (p_transaction ->> 'credit_card_id')::uuid;
  if v_card is not null then
    v_invoice := public.ensure_invoice(
      v_card,
      (p_transaction ->> 'closing_month')::date,
      (p_transaction ->> 'closing_date')::date,
      (p_transaction ->> 'due_date')::date,
      (p_transaction ->> 'reference_month')::date
    );
  end if;

  if v_tx is null then
    insert into public.transactions (
      household_id, type, description, amount_cents, date, status, category_id,
      account_id, credit_card_id, invoice_id, source
    )
    values (
      v_expense.household_id,
      'expense',
      p_transaction ->> 'description',
      (p_transaction ->> 'amount_cents')::bigint,
      (p_transaction ->> 'date')::date,
      p_transaction ->> 'status',
      (p_transaction ->> 'category_id')::uuid,
      (p_transaction ->> 'account_id')::uuid,
      v_card,
      v_invoice,
      'property'
    )
    returning id into v_tx;
  else
    update public.transactions t
    set description = p_transaction ->> 'description',
        amount_cents = (p_transaction ->> 'amount_cents')::bigint,
        date = (p_transaction ->> 'date')::date,
        status = p_transaction ->> 'status',
        category_id = (p_transaction ->> 'category_id')::uuid,
        account_id = (p_transaction ->> 'account_id')::uuid,
        credit_card_id = v_card,
        invoice_id = v_invoice
    where t.id = v_tx;
  end if;

  update public.property_expenses e
  set status = 'paid',
      paid_amount_cents = (p_paid ->> 'paid_amount_cents')::bigint,
      paid_date = (p_paid ->> 'paid_date')::date,
      funding_source = v_source,
      transaction_id = v_tx
  where e.id = p_expense_id;

  perform set_config('app.property_sync', 'off', true);
  return v_tx;
end;
$$;

-- Desmarcar o pagamento: volta para previsto e apaga o lançamento ligado
create or replace function public.unpay_property_expense(p_expense_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tx uuid;
begin
  select e.transaction_id into v_tx from public.property_expenses e where e.id = p_expense_id for update;
  if not found then
    raise exception 'INVALID_EXPENSE';
  end if;

  update public.property_expenses e
  set status = 'planned', paid_amount_cents = null, paid_date = null, transaction_id = null
  where e.id = p_expense_id;

  if v_tx is not null then
    delete from public.transactions t where t.id = v_tx;
  end if;
end;
$$;

-- Excluir gastos e os lançamentos ligados
create or replace function public.delete_property_expenses(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.transactions t
  using public.property_expenses e
  where e.id = any (coalesce(p_ids, '{}'::uuid[])) and t.id = e.transaction_id;

  delete from public.property_expenses e where e.id = any (coalesce(p_ids, '{}'::uuid[]));
end;
$$;

-- "Desfazer": recria os lançamentos e os gastos com os mesmos ids
create or replace function public.restore_property_expenses(p_expenses jsonb, p_transactions jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_expenses is null or jsonb_typeof(p_expenses) <> 'array' or jsonb_array_length(p_expenses) = 0 then
    raise exception 'INVALID_INPUT';
  end if;

  perform set_config('app.property_sync', 'on', true);

  insert into public.transactions (
    id, household_id, type, description, amount_cents, date, status, category_id,
    account_id, credit_card_id, invoice_id, source, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.date, r.status, r.category_id,
    r.account_id, r.credit_card_id, r.invoice_id, 'property', r.notes
  from jsonb_populate_recordset(null::public.transactions, coalesce(p_transactions, '[]'::jsonb)) r;

  insert into public.property_expenses (
    id, household_id, property_id, expense_type_id, description, payee, planned_amount_cents,
    due_date, status, paid_amount_cents, paid_date, funding_source, transaction_id, notes
  )
  select
    r.id, r.household_id, r.property_id, r.expense_type_id, r.description, r.payee, r.planned_amount_cents,
    r.due_date, r.status, r.paid_amount_cents, r.paid_date, r.funding_source, r.transaction_id, r.notes
  from jsonb_populate_recordset(null::public.property_expenses, p_expenses) r;

  perform set_config('app.property_sync', 'off', true);
end;
$$;

-- Excluir o imóvel: lançamentos ligados primeiro, depois o imóvel (gastos em cascata)
create or replace function public.delete_property(p_property_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.properties p where p.id = p_property_id) then
    raise exception 'INVALID_PROPERTY';
  end if;

  delete from public.transactions t
  using public.property_expenses e
  where e.property_id = p_property_id and t.id = e.transaction_id;

  delete from public.properties p where p.id = p_property_id;
end;
$$;

-- =====================================================================
-- Permissões e RLS
-- =====================================================================

revoke all on function public.seed_property_expense_types(uuid) from public, anon, authenticated;
revoke all on function public.property_expenses_check_refs() from public, anon, authenticated;
revoke all on function public.transactions_property_guard() from public, anon, authenticated;
revoke all on function public.transactions_property_unlink() from public, anon, authenticated;

revoke all on function public.create_property_expenses(uuid, jsonb) from public, anon;
revoke all on function public.pay_property_expense(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.unpay_property_expense(uuid) from public, anon;
revoke all on function public.delete_property_expenses(uuid[]) from public, anon;
revoke all on function public.restore_property_expenses(jsonb, jsonb) from public, anon;
revoke all on function public.delete_property(uuid) from public, anon;
grant execute on function public.create_property_expenses(uuid, jsonb) to authenticated;
grant execute on function public.pay_property_expense(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.unpay_property_expense(uuid) to authenticated;
grant execute on function public.delete_property_expenses(uuid[]) to authenticated;
grant execute on function public.restore_property_expenses(jsonb, jsonb) to authenticated;
grant execute on function public.delete_property(uuid) to authenticated;

revoke all on public.properties, public.property_expense_types, public.property_expenses from anon;
revoke truncate, references, trigger on public.properties, public.property_expense_types, public.property_expenses from authenticated;

alter table public.properties enable row level security;
alter table public.property_expense_types enable row level security;
alter table public.property_expenses enable row level security;

create policy properties_all on public.properties
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy property_expense_types_all on public.property_expense_types
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy property_expenses_all on public.property_expenses
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
```

- [ ] **Step 2: Aplicar no Supabase e regenerar os tipos**

Run: `yes | npm run db:push` e depois `npm run db:types`
Expected: a migration `20261006120000_imovel.sql` aplicada; `lib/supabase/database.types.ts` passa a ter `properties`, `property_expense_types`, `property_expenses` e as funções novas. Se o push falhar por SQL, corrija a migration (ela ainda não foi aplicada) e rode de novo.

- [ ] **Step 3: Escrever os testes de RLS e integração**

```ts
// tests/rls/property.rls.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestUser } from './helpers'

const ctx = createTestContext()
const TX_COLUMNS =
  'id, household_id, type, description, amount_cents, date, status, category_id, account_id, destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number, source, external_id, notes, recurrence_id, occurrence_date'
const EXPENSE_COLUMNS =
  'id, household_id, property_id, expense_type_id, description, payee, planned_amount_cents, due_date, status, paid_amount_cents, paid_date, funding_source, transaction_id, notes'

describe('imóvel', () => {
  let a: TestUser
  let b: TestUser
  let houseA: string
  let houseB: string
  let accA: string
  let cardA: string
  let imovelA: string
  let mercadoA: string
  let monthlyA: string
  let fgtsTypeA: string
  let monthlyB: string
  let propertyA: string

  async function typeId(user: TestUser, householdId: string, key: string): Promise<string> {
    const { data, error } = await user.client
      .from('property_expense_types')
      .select('id')
      .eq('household_id', householdId)
      .eq('system_key', key)
      .single()
    if (error) throw error
    return data.id as string
  }

  async function categoryId(user: TestUser, householdId: string, name: string): Promise<string> {
    const { data, error } = await user.client
      .from('categories')
      .select('id')
      .eq('household_id', householdId)
      .eq('name', name)
      .eq('kind', 'expense')
      .is('parent_id', null)
      .single()
    if (error) throw error
    return data.id as string
  }

  async function newExpense(description = 'Parcela mensal 1/36', planned = 150_000): Promise<string> {
    const { data, error } = await a.client.rpc('create_property_expenses', {
      p_property_id: propertyA,
      p_rows: [
        {
          expense_type_id: monthlyA,
          description,
          payee: 'Construtora',
          planned_amount_cents: planned,
          due_date: '2026-11-10',
          funding_source: 'own',
          notes: null,
        },
      ],
    })
    if (error) throw error
    return (data as string[])[0]
  }

  function accountTx(amount: number, date = '2026-10-05', account = accA) {
    return {
      description: 'Imóvel: Parcela mensal 1/36',
      amount_cents: amount,
      date,
      status: 'paid',
      category_id: imovelA,
      account_id: account,
      credit_card_id: null,
    }
  }

  async function expense(id: string) {
    const { data, error } = await a.client.from('property_expenses').select(EXPENSE_COLUMNS).eq('id', id).single()
    if (error) throw error
    return data
  }

  beforeAll(async () => {
    ;[a, b] = await Promise.all([ctx.newUser('prop-a'), ctx.newUser('prop-b')])
    houseA = await ctx.createHousehold(a, 'Casa Imóvel A')
    houseB = await ctx.createHousehold(b, 'Casa Imóvel B')
    imovelA = await categoryId(a, houseA, 'Imóvel')
    mercadoA = await categoryId(a, houseA, 'Mercado')
    monthlyA = await typeId(a, houseA, 'monthly')
    fgtsTypeA = await typeId(a, houseA, 'itbi')
    monthlyB = await typeId(b, houseB, 'monthly')
    const { data: acc, error: accError } = await a.client
      .from('accounts')
      .insert({ household_id: houseA, name: 'Conta A', type: 'checking', initial_balance_cents: 0, initial_balance_date: '2026-01-01', color: '#3b82f6' })
      .select('id')
      .single()
    if (accError) throw accError
    accA = acc.id as string
    const { data: card, error: cardError } = await a.client
      .from('credit_cards')
      .insert({ household_id: houseA, name: 'Cartão A', brand: 'visa', limit_cents: 500_000, closing_day: 3, due_day: 10, color: '#3b82f6' })
      .select('id')
      .single()
    if (cardError) throw cardError
    cardA = card.id as string
    const { data: property, error: propertyError } = await a.client
      .from('properties')
      .insert({ household_id: houseA, name: 'Apê Centro', purchase_price_cents: 50_000_000, expected_delivery_date: '2029-06-30' })
      .select('id')
      .single()
    if (propertyError) throw propertyError
    propertyA = property.id as string
  })

  afterAll(() => ctx.cleanup())

  it('a casa nasce com os 21 tipos de gasto padrão', async () => {
    const { data, error } = await a.client.from('property_expense_types').select('system_key, is_default, sort_order').eq('household_id', houseA)
    expect(error).toBeNull()
    expect(data).toHaveLength(21)
    expect(data!.every((row) => row.is_default)).toBe(true)
    expect(new Set(data!.map((row) => row.system_key))).toContain('construction_interest')
  })

  it('outra casa não lê nem altera imóvel, tipos e gastos', async () => {
    const id = await newExpense()
    const { data: props } = await b.client.from('properties').select('id').eq('id', propertyA)
    expect(props).toEqual([])
    const { data: types } = await b.client.from('property_expense_types').select('id').eq('household_id', houseA)
    expect(types).toEqual([])
    const { data: rows } = await b.client.from('property_expenses').select('id').eq('id', id)
    expect(rows).toEqual([])

    const created = await b.client.rpc('create_property_expenses', {
      p_property_id: propertyA,
      p_rows: [{ expense_type_id: monthlyB, description: 'X', planned_amount_cents: 1, due_date: '2026-11-10' }],
    })
    expect(created.error?.message).toBe('INVALID_PROPERTY')
    const paid = await b.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 1, paid_date: '2026-10-05', funding_source: 'fgts' },
      p_transaction: null,
    })
    expect(paid.error?.message).toBe('INVALID_EXPENSE')
    expect((await b.client.rpc('delete_property', { p_property_id: propertyA })).error?.message).toBe('INVALID_PROPERTY')
    expect((await expense(id)).status).toBe('planned')
  })

  it('gasto não aceita tipo de outra casa', async () => {
    const { error } = await a.client.rpc('create_property_expenses', {
      p_property_id: propertyA,
      p_rows: [{ expense_type_id: monthlyB, description: 'Tipo alheio', planned_amount_cents: 100, due_date: '2026-11-10' }],
    })
    expect(error?.message).toBe('INVALID_EXPENSE_TYPE')
  })

  it('pagar com recursos próprios cria um lançamento ligado; editar atualiza; desmarcar apaga', async () => {
    const id = await newExpense()
    const { data: txId, error } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 153_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(153_000),
    })
    expect(error).toBeNull()
    const paid = await expense(id)
    expect(paid).toMatchObject({ status: 'paid', paid_amount_cents: 153_000, paid_date: '2026-10-05', transaction_id: txId })
    const { data: tx } = await a.client.from('transactions').select('type, amount_cents, source, category_id, account_id, status').eq('id', txId as string).single()
    expect(tx).toEqual({ type: 'expense', amount_cents: 153_000, source: 'property', category_id: imovelA, account_id: accA, status: 'paid' })

    const edited = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 155_000, paid_date: '2026-10-04', funding_source: 'own' },
      p_transaction: accountTx(155_000, '2026-10-04'),
    })
    expect(edited.data).toBe(txId)
    const { data: updated } = await a.client.from('transactions').select('amount_cents, date').eq('id', txId as string).single()
    expect(updated).toEqual({ amount_cents: 155_000, date: '2026-10-04' })

    expect((await a.client.rpc('unpay_property_expense', { p_expense_id: id })).error).toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'planned', paid_amount_cents: null, paid_date: null, transaction_id: null })
    const { data: gone } = await a.client.from('transactions').select('id').eq('id', txId as string)
    expect(gone).toEqual([])
  })

  it('trocar a fonte para FGTS apaga o lançamento ligado', async () => {
    const id = await newExpense('ITBI', 800_000)
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 800_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(800_000),
    })
    const { error } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 800_000, paid_date: '2026-10-05', funding_source: 'fgts' },
      p_transaction: null,
    })
    expect(error).toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'paid', funding_source: 'fgts', transaction_id: null })
    const { data: gone } = await a.client.from('transactions').select('id').eq('id', txId as string)
    expect(gone).toEqual([])
  })

  it('no cartão o lançamento vai para a fatura informada', async () => {
    const id = await newExpense('Vistoria', 60_000)
    const { data: txId, error } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 60_000, paid_date: '2026-10-02', funding_source: 'own' },
      p_transaction: {
        ...accountTx(60_000, '2026-10-02', ''),
        account_id: null,
        credit_card_id: cardA,
        closing_month: '2026-10-01',
        closing_date: '2026-10-03',
        due_date: '2026-10-10',
        reference_month: '2026-10-01',
      },
    })
    expect(error).toBeNull()
    const { data: tx } = await a.client.from('transactions').select('credit_card_id, invoice_id, card_invoices(closing_month)').eq('id', txId as string).single()
    expect(tx!.credit_card_id).toBe(cardA)
    expect(tx!.card_invoices).toEqual({ closing_month: '2026-10-01' })
  })

  it('o lançamento ligado só muda pelo RPC; descrição e fatura continuam livres', async () => {
    const id = await newExpense()
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 150_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(150_000),
    })
    const amount = await a.client.from('transactions').update({ amount_cents: 1 }).eq('id', txId as string)
    expect(amount.error?.message).toBe('PROPERTY_LOCKED')
    const category = await a.client.from('transactions').update({ category_id: mercadoA }).eq('id', txId as string)
    expect(category.error?.message).toBe('PROPERTY_LOCKED')
    const description = await a.client.from('transactions').update({ description: 'Imóvel: mensal de outubro' }).eq('id', txId as string)
    expect(description.error).toBeNull()

    const inserted = await a.client.from('transactions').insert({
      household_id: houseA,
      type: 'expense',
      description: 'Falso',
      amount_cents: 100,
      date: '2026-10-05',
      status: 'paid',
      category_id: imovelA,
      account_id: accA,
      source: 'property',
    })
    expect(inserted.error?.message).toBe('PROPERTY_LOCKED')
  })

  it('a fatura de um lançamento ligado no cartão pode mudar (dias do cartão)', async () => {
    const id = await newExpense('Ligações', 30_000)
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 30_000, paid_date: '2026-10-02', funding_source: 'own' },
      p_transaction: {
        ...accountTx(30_000, '2026-10-02'),
        account_id: null,
        credit_card_id: cardA,
        closing_month: '2026-10-01',
        closing_date: '2026-10-03',
        due_date: '2026-10-10',
        reference_month: '2026-10-01',
      },
    })
    const { data: next } = await a.client.rpc('ensure_invoice', {
      p_card_id: cardA,
      p_closing_month: '2026-11-01',
      p_closing_date: '2026-11-03',
      p_due_date: '2026-11-10',
      p_reference_month: '2026-11-01',
    })
    const moved = await a.client.from('transactions').update({ invoice_id: next as string }).eq('id', txId as string)
    expect(moved.error).toBeNull()
  })

  it('excluir o lançamento volta o gasto para previsto', async () => {
    const id = await newExpense()
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 150_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(150_000),
    })
    expect((await a.client.from('transactions').delete().eq('id', txId as string)).error).toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'planned', paid_amount_cents: null, paid_date: null, transaction_id: null })
  })

  it('pagar é atômico: categoria inválida não deixa o gasto pago', async () => {
    const id = await newExpense()
    const { error } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 150_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: { ...accountTx(150_000), category_id: '00000000-0000-4000-8000-000000000000' },
    })
    expect(error).not.toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'planned', transaction_id: null })
  })

  it('excluir gastos apaga os lançamentos; restaurar devolve os dois', async () => {
    const id = await newExpense()
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: id,
      p_paid: { paid_amount_cents: 150_000, paid_date: '2026-10-05', funding_source: 'own' },
      p_transaction: accountTx(150_000),
    })
    const before = await expense(id)
    const { data: txRows } = await a.client.from('transactions').select(TX_COLUMNS).eq('id', txId as string)

    expect((await a.client.rpc('delete_property_expenses', { p_ids: [id] })).error).toBeNull()
    expect((await a.client.from('transactions').select('id').eq('id', txId as string)).data).toEqual([])

    const restored = await a.client.rpc('restore_property_expenses', { p_expenses: [before], p_transactions: txRows })
    expect(restored.error).toBeNull()
    expect(await expense(id)).toMatchObject({ status: 'paid', transaction_id: txId })
    const { data: tx } = await a.client.from('transactions').select('source').eq('id', txId as string).single()
    expect(tx).toEqual({ source: 'property' })
  })

  it('tipo usado por um gasto não pode ser excluído', async () => {
    await newExpense()
    const { error } = await a.client.from('property_expense_types').delete().eq('id', monthlyA)
    expect(error?.code).toBe('23503')
  })

  it('delete_property apaga o imóvel, os gastos e os lançamentos ligados', async () => {
    const { data: property } = await a.client
      .from('properties')
      .insert({ household_id: houseA, name: 'Casa Praia', purchase_price_cents: 1_000 })
      .select('id')
      .single()
    const { data: ids } = await a.client.rpc('create_property_expenses', {
      p_property_id: property!.id,
      p_rows: [{ expense_type_id: fgtsTypeA, description: 'ITBI', planned_amount_cents: 100, due_date: '2026-10-01' }],
    })
    const { data: txId } = await a.client.rpc('pay_property_expense', {
      p_expense_id: (ids as string[])[0],
      p_paid: { paid_amount_cents: 100, paid_date: '2026-10-01', funding_source: 'own' },
      p_transaction: accountTx(100, '2026-10-01'),
    })
    expect((await a.client.rpc('delete_property', { p_property_id: property!.id })).error).toBeNull()
    expect((await a.client.from('property_expenses').select('id').in('id', ids as string[])).data).toEqual([])
    expect((await a.client.from('transactions').select('id').eq('id', txId as string)).data).toEqual([])
  })
})
```

- [ ] **Step 4: Rodar os testes de integração**

Run: `npm run test:rls`
Expected: PASS em `tests/rls/property.rls.test.ts` e nos arquivos existentes (45 + os novos). Se um teste falhar por regra do banco, corrija a migration com uma **nova** migration (a primeira já foi aplicada) e rode `yes | npm run db:push` e `npm run db:types` de novo.

- [ ] **Step 5: Verificar tipos e commitar**

Run: `npx tsc --noEmit` e `npm run lint`
Expected: sem erros.

```bash
git add supabase/migrations/20261006120000_imovel.sql lib/supabase/database.types.ts tests/rls/property.rls.test.ts
git commit -m "feat(imovel): tabelas, tipos padrão, triggers do lançamento ligado e RPCs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Regras do imóvel (`lib/finance/property.ts`)

**Files:**
- Create: `lib/finance/property.ts`
- Test: `lib/finance/property.test.ts`

**Interfaces:**
- Consumes: `formatYearMonthParam`, `yearMonthOfISO`, `YearMonth` (`lib/dates.ts`); `monthIndex`, `monthsIn` (`lib/finance/periods.ts`).
- Produces:
  - `FUNDING_SOURCES`, `type FundingSource`, `FUNDING_LABELS`; `TYPICAL_PHASES`, `type TypicalPhase`, `TYPICAL_PHASE_LABELS`; `PROPERTY_PHASES`, `type PropertyPhase`, `PROPERTY_PHASE_LABELS`; `AMORTIZATION_SYSTEMS`, `type AmortizationSystem`, `AMORTIZATION_LABELS`
  - `CONSTRUCTOR_KEYS`, `isConstructorKey(key: string | null): boolean`
  - `type ExpenseStatus = 'planned' | 'paid' | 'overdue'`, `EXPENSE_STATUS_LABELS`
  - `type PropertyExpense = { id; propertyId; expenseTypeId; description; payee: string | null; plannedAmountCents; dueDate; status: 'planned' | 'paid'; paidAmountCents: number | null; paidDate: string | null; fundingSource: FundingSource; transactionId: string | null; notes: string | null }`
  - `type ExpenseType = { id; name; typicalPhase: TypicalPhase; sortOrder: number; isDefault: boolean; systemKey: string | null; archived: boolean }`
  - `expenseStatus(expense, today): ExpenseStatus`
  - `correctionCents(expense, systemKey): number`
  - `type PropertySummary`, `propertySummary(purchasePriceCents, expenses, typeKeys: Map<string, string | null>): PropertySummary`
  - `type TypeTotal`, `totalsByType(expenses, types): TypeTotal[]`
  - `type ScheduleMonth`, `propertySchedule(expenses, expectedDeliveryDate: string | null, today): ScheduleMonth[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/property.test.ts
import { describe, expect, it } from 'vitest'
import {
  correctionCents,
  expenseStatus,
  propertySchedule,
  propertySummary,
  totalsByType,
  type PropertyExpense,
} from './property'

const expense = (patch: Partial<PropertyExpense>): PropertyExpense => ({
  id: 'e',
  propertyId: 'p',
  expenseTypeId: 'monthly',
  description: 'Parcela mensal 1/36',
  payee: null,
  plannedAmountCents: 150_000,
  dueDate: '2026-11-10',
  status: 'planned',
  paidAmountCents: null,
  paidDate: null,
  fundingSource: 'own',
  transactionId: null,
  notes: null,
  ...patch,
})

const paid = (patch: Partial<PropertyExpense>) => expense({ status: 'paid', paidDate: '2026-10-05', paidAmountCents: 150_000, ...patch })

const KEYS = new Map<string, string | null>([
  ['monthly', 'monthly'],
  ['incc', 'incc'],
  ['taxa', 'construction_interest'],
  ['itbi', 'itbi'],
  ['custom', null],
])

describe('expenseStatus', () => {
  it('pago, atrasado (vencimento antes de hoje) e previsto (hoje ou depois)', () => {
    expect(expenseStatus(paid({ dueDate: '2026-01-01' }), '2026-10-05')).toBe('paid')
    expect(expenseStatus(expense({ dueDate: '2026-10-04' }), '2026-10-05')).toBe('overdue')
    expect(expenseStatus(expense({ dueDate: '2026-10-05' }), '2026-10-05')).toBe('planned')
  })
})

describe('correctionCents', () => {
  it('pago − previsto só em parcela paga da construtora', () => {
    expect(correctionCents(paid({ paidAmountCents: 153_000 }), 'monthly')).toBe(3_000)
    expect(correctionCents(paid({ paidAmountCents: 149_000 }), 'keys')).toBe(-1_000)
    expect(correctionCents(paid({ paidAmountCents: 150_000 }), 'down_payment')).toBe(0)
    expect(correctionCents(paid({ paidAmountCents: 200_000 }), 'itbi')).toBe(0)
    expect(correctionCents(paid({ paidAmountCents: 200_000 }), null)).toBe(0)
    expect(correctionCents(expense({}), 'monthly')).toBe(0)
  })
})

describe('propertySummary', () => {
  it('imóvel sem gastos: tudo zerado e sem próximo', () => {
    expect(propertySummary(50_000_000, [], KEYS)).toEqual({
      purchasePriceCents: 50_000_000,
      plannedCents: 0,
      paidCents: 0,
      toPayCents: 0,
      paidRatio: 0,
      inccCents: 0,
      constructionInterestCents: 0,
      bySource: {
        own: { paidCents: 0, toPayCents: 0 },
        fgts: { paidCents: 0, toPayCents: 0 },
        financing: { paidCents: 0, toPayCents: 0 },
      },
      next: null,
    })
  })

  it('totais, INCC, taxa de obra, fontes e % pago sobre (pago + a pagar)', () => {
    const expenses = [
      paid({ id: '1', paidAmountCents: 153_000 }),
      paid({ id: '2', expenseTypeId: 'incc', plannedAmountCents: 0, paidAmountCents: 5_000 }),
      paid({ id: '3', expenseTypeId: 'taxa', plannedAmountCents: 20_000, paidAmountCents: 21_000, fundingSource: 'financing' }),
      expense({ id: '4', expenseTypeId: 'itbi', plannedAmountCents: 800_000, fundingSource: 'fgts', dueDate: '2026-12-01' }),
      expense({ id: '5', dueDate: '2026-11-10', description: 'B' }),
      expense({ id: '6', dueDate: '2026-11-10', description: 'A' }),
    ]
    const summary = propertySummary(50_000_000, expenses, KEYS)
    expect(summary.plannedCents).toBe(150_000 + 0 + 20_000 + 800_000 + 150_000 + 150_000)
    expect(summary.paidCents).toBe(153_000 + 5_000 + 21_000)
    expect(summary.toPayCents).toBe(800_000 + 150_000 + 150_000)
    expect(summary.paidRatio).toBeCloseTo(179_000 / (179_000 + 1_100_000))
    expect(summary.inccCents).toBe(3_000 + 5_000)
    expect(summary.constructionInterestCents).toBe(21_000)
    expect(summary.bySource).toEqual({
      own: { paidCents: 158_000, toPayCents: 300_000 },
      fgts: { paidCents: 0, toPayCents: 800_000 },
      financing: { paidCents: 21_000, toPayCents: 0 },
    })
    expect(summary.next?.id).toBe('6')
  })

  it('o próximo pagamento inclui os atrasados', () => {
    const summary = propertySummary(0, [expense({ id: 'late', dueDate: '2026-01-10' }), expense({ id: 'later', dueDate: '2027-01-10' })], KEYS)
    expect(summary.next?.id).toBe('late')
  })
})

describe('totalsByType', () => {
  const types = [
    { id: 'monthly', name: 'Parcelas mensais', sortOrder: 2 },
    { id: 'itbi', name: 'ITBI', sortOrder: 11 },
    { id: 'custom', name: 'Móveis', sortOrder: 22 },
    { id: 'incc', name: 'Correção INCC', sortOrder: 5 },
  ]
  it('previsto, pago e quantidade na ordem dos tipos; tipos sem gasto ficam fora', () => {
    const result = totalsByType(
      [paid({ expenseTypeId: 'itbi', plannedAmountCents: 800_000, paidAmountCents: 800_000 }), expense({}), paid({ paidAmountCents: 151_000 })],
      types,
    )
    expect(result).toEqual([
      { typeId: 'monthly', name: 'Parcelas mensais', plannedCents: 300_000, paidCents: 151_000, count: 2 },
      { typeId: 'itbi', name: 'ITBI', plannedCents: 800_000, paidCents: 800_000, count: 1 },
    ])
  })
  it('sem gastos, lista vazia', () => {
    expect(totalsByType([], types)).toEqual([])
  })
})

describe('propertySchedule', () => {
  it('sem gastos, vazio', () => {
    expect(propertySchedule([], '2029-06-30', '2026-10-05')).toEqual([])
  })

  it('do primeiro mês ao último, inclusive meses vazios, até a entrega das chaves', () => {
    const months = propertySchedule(
      [
        expense({ dueDate: '2026-11-10' }),
        paid({ dueDate: '2026-12-10', paidDate: '2027-01-02', paidAmountCents: 151_000 }),
      ],
      '2027-03-15',
      '2026-12-20',
    )
    expect(months.map((month) => month.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
    expect(months[0]).toEqual({ ym: { year: 2026, month: 11 }, key: '2026-11', plannedCents: 150_000, paidCents: 0, isCurrent: false, isDelivery: false })
    expect(months[1]).toMatchObject({ plannedCents: 150_000, paidCents: 0, isCurrent: true })
    expect(months[2]).toMatchObject({ plannedCents: 0, paidCents: 151_000 })
    expect(months[4]).toMatchObject({ plannedCents: 0, paidCents: 0, isDelivery: true })
  })

  it('entrega antes do primeiro gasto não estende o começo', () => {
    const months = propertySchedule([expense({ dueDate: '2026-11-10' })], '2026-01-10', '2026-10-05')
    expect(months.map((month) => month.key)).toEqual(['2026-11'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/finance/property.test.ts`
Expected: FAIL — "Failed to resolve import './property'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/finance/property.ts
import { formatYearMonthParam, yearMonthOfISO, type YearMonth } from '@/lib/dates'
import { monthIndex, monthsIn } from './periods'

export const FUNDING_SOURCES = ['own', 'fgts', 'financing'] as const
export type FundingSource = (typeof FUNDING_SOURCES)[number]
export const FUNDING_LABELS: Record<FundingSource, string> = {
  own: 'Recursos próprios',
  fgts: 'FGTS',
  financing: 'Financiamento',
}

export const TYPICAL_PHASES = ['signing', 'construction', 'delivery', 'financing', 'post_keys', 'any'] as const
export type TypicalPhase = (typeof TYPICAL_PHASES)[number]
export const TYPICAL_PHASE_LABELS: Record<TypicalPhase, string> = {
  signing: 'Assinatura',
  construction: 'Obra',
  delivery: 'Entrega',
  financing: 'Financiamento',
  post_keys: 'Pós-chaves',
  any: 'Qualquer',
}

export const PROPERTY_PHASES = ['pre_keys', 'post_keys'] as const
export type PropertyPhase = (typeof PROPERTY_PHASES)[number]
export const PROPERTY_PHASE_LABELS: Record<PropertyPhase, string> = {
  pre_keys: 'Em obra (pré-chaves)',
  post_keys: 'Pós-chaves',
}

export const AMORTIZATION_SYSTEMS = ['sac', 'price'] as const
export type AmortizationSystem = (typeof AMORTIZATION_SYSTEMS)[number]
export const AMORTIZATION_LABELS: Record<AmortizationSystem, string> = { sac: 'SAC', price: 'Price' }

/** Parcelas pagas à construtora: a diferença sobre o previsto é correção (INCC). */
export const CONSTRUCTOR_KEYS: readonly string[] = ['down_payment', 'monthly', 'intermediate', 'keys']

export function isConstructorKey(key: string | null): boolean {
  return key !== null && CONSTRUCTOR_KEYS.includes(key)
}

export type ExpenseStatus = 'planned' | 'paid' | 'overdue'
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = { planned: 'Previsto', paid: 'Pago', overdue: 'Atrasado' }

export type PropertyExpense = {
  id: string
  propertyId: string
  expenseTypeId: string
  description: string
  payee: string | null
  plannedAmountCents: number
  dueDate: string
  status: 'planned' | 'paid'
  paidAmountCents: number | null
  paidDate: string | null
  fundingSource: FundingSource
  transactionId: string | null
  notes: string | null
}

export type ExpenseType = {
  id: string
  name: string
  typicalPhase: TypicalPhase
  sortOrder: number
  isDefault: boolean
  systemKey: string | null
  archived: boolean
}

/** "Atrasado" é calculado: previsto com vencimento antes de hoje. */
export function expenseStatus(expense: Pick<PropertyExpense, 'status' | 'dueDate'>, today: string): ExpenseStatus {
  if (expense.status === 'paid') return 'paid'
  return expense.dueDate < today ? 'overdue' : 'planned'
}

/** Pago − previsto de uma parcela paga da construtora (pode ser negativo); 0 nos demais. */
export function correctionCents(
  expense: Pick<PropertyExpense, 'status' | 'paidAmountCents' | 'plannedAmountCents'>,
  systemKey: string | null,
): number {
  if (expense.status !== 'paid' || expense.paidAmountCents === null || !isConstructorKey(systemKey)) return 0
  return expense.paidAmountCents - expense.plannedAmountCents
}

export type SourceTotals = Record<FundingSource, { paidCents: number; toPayCents: number }>

export type PropertySummary = {
  purchasePriceCents: number
  plannedCents: number
  paidCents: number
  toPayCents: number
  paidRatio: number
  inccCents: number
  constructionInterestCents: number
  bySource: SourceTotals
  next: PropertyExpense | null
}

const byDueDate = (a: PropertyExpense, b: PropertyExpense) =>
  a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description, 'pt-BR')

/** Totais do Resumo. `typeKeys`: id do tipo → system_key. % pago = pago ÷ (pago + a pagar). */
export function propertySummary(
  purchasePriceCents: number,
  expenses: PropertyExpense[],
  typeKeys: Map<string, string | null>,
): PropertySummary {
  const bySource: SourceTotals = {
    own: { paidCents: 0, toPayCents: 0 },
    fgts: { paidCents: 0, toPayCents: 0 },
    financing: { paidCents: 0, toPayCents: 0 },
  }
  let plannedCents = 0
  let paidCents = 0
  let toPayCents = 0
  let inccCents = 0
  let constructionInterestCents = 0

  for (const expense of expenses) {
    const key = typeKeys.get(expense.expenseTypeId) ?? null
    plannedCents += expense.plannedAmountCents
    if (expense.status === 'paid') {
      const value = expense.paidAmountCents ?? 0
      paidCents += value
      bySource[expense.fundingSource].paidCents += value
      inccCents += correctionCents(expense, key)
      if (key === 'incc') inccCents += value
      if (key === 'construction_interest') constructionInterestCents += value
    } else {
      toPayCents += expense.plannedAmountCents
      bySource[expense.fundingSource].toPayCents += expense.plannedAmountCents
    }
  }

  const unpaid = expenses.filter((expense) => expense.status !== 'paid').sort(byDueDate)
  const base = paidCents + toPayCents
  return {
    purchasePriceCents,
    plannedCents,
    paidCents,
    toPayCents,
    paidRatio: base > 0 ? paidCents / base : 0,
    inccCents,
    constructionInterestCents,
    bySource,
    next: unpaid[0] ?? null,
  }
}

export type TypeTotal = { typeId: string; name: string; plannedCents: number; paidCents: number; count: number }

type Totals = { plannedCents: number; paidCents: number; count: number }

/** Previsto, pago e quantidade por tipo, na ordem do cadastro; tipos sem gasto ficam fora. */
export function totalsByType(expenses: PropertyExpense[], types: Pick<ExpenseType, 'id' | 'name' | 'sortOrder'>[]): TypeTotal[] {
  const totals = new Map<string, Totals>()
  for (const expense of expenses) {
    const total = totals.get(expense.expenseTypeId) ?? { plannedCents: 0, paidCents: 0, count: 0 }
    total.plannedCents += expense.plannedAmountCents
    total.paidCents += expense.status === 'paid' ? (expense.paidAmountCents ?? 0) : 0
    total.count += 1
    totals.set(expense.expenseTypeId, total)
  }
  return [...types]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'))
    .flatMap((type) => {
      const total = totals.get(type.id)
      return total ? [{ typeId: type.id, name: type.name, ...total }] : []
    })
}

export type ScheduleMonth = {
  ym: YearMonth
  key: string
  plannedCents: number
  paidCents: number
  isCurrent: boolean
  isDelivery: boolean
}

const fromIndex = (index: number): YearMonth => ({ year: Math.floor(index / 12), month: (index % 12) + 1 })

/**
 * Previsto (pelo vencimento) e realizado (pela data do pagamento) por mês, do primeiro mês com gasto
 * até o último — ou até o mês das chaves, se for depois.
 */
export function propertySchedule(expenses: PropertyExpense[], expectedDeliveryDate: string | null, today: string): ScheduleMonth[] {
  if (expenses.length === 0) return []
  const planned = new Map<string, number>()
  const paid = new Map<string, number>()
  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  const touch = (iso: string) => {
    const index = monthIndex(yearMonthOfISO(iso))
    first = Math.min(first, index)
    last = Math.max(last, index)
  }

  for (const expense of expenses) {
    const dueKey = expense.dueDate.slice(0, 7)
    planned.set(dueKey, (planned.get(dueKey) ?? 0) + expense.plannedAmountCents)
    touch(expense.dueDate)
    if (expense.status === 'paid' && expense.paidDate) {
      const paidKey = expense.paidDate.slice(0, 7)
      paid.set(paidKey, (paid.get(paidKey) ?? 0) + (expense.paidAmountCents ?? 0))
      touch(expense.paidDate)
    }
  }
  if (expectedDeliveryDate) last = Math.max(last, monthIndex(yearMonthOfISO(expectedDeliveryDate)))

  const currentKey = today.slice(0, 7)
  const deliveryKey = expectedDeliveryDate?.slice(0, 7) ?? null
  return monthsIn({ start: fromIndex(first), end: fromIndex(last) }).map((ym) => {
    const key = formatYearMonthParam(ym)
    return {
      ym,
      key,
      plannedCents: planned.get(key) ?? 0,
      paidCents: paid.get(key) ?? 0,
      isCurrent: key === currentKey,
      isDelivery: key === deliveryKey,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/finance/property.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/property.ts lib/finance/property.test.ts
git commit -m "feat(imovel): status, correção INCC, resumo, totais por tipo e cronograma

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gerador do plano de pagamento (`lib/finance/property-plan.ts`)

**Files:**
- Create: `lib/finance/property-plan.ts`
- Test: `lib/finance/property-plan.test.ts`

**Interfaces:**
- Consumes: `addMonthsClamped(date: string, n: number): string` (`lib/finance/invoice.ts`); `type FundingSource` (Task 2).
- Produces:
  - `type PlanSystemKey = 'monthly' | 'intermediate' | 'keys'`, `PLAN_BLOCK_LABELS: Record<PlanSystemKey, string>`
  - `type PaymentPlanInput = { monthly: { amountCents; count; firstDueDate } | null; intermediate: { amountCents; count; firstDueDate; everyMonths: 6 | 12 } | null; keys: { amountCents; dueDate } | null; fundingSource: FundingSource }`
  - `type PlanRow = { systemKey: PlanSystemKey; description: string; plannedAmountCents: number; dueDate: string; fundingSource: FundingSource }`
  - `buildPaymentPlan(input: PaymentPlanInput): PlanRow[]`
  - `type PlanBlockPreview = { systemKey: PlanSystemKey; count: number; firstDate: string; lastDate: string; totalCents: number }`
  - `planPreview(rows: PlanRow[]): { blocks: PlanBlockPreview[]; count: number; totalCents: number }`

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/property-plan.test.ts
import { describe, expect, it } from 'vitest'
import { buildPaymentPlan, planPreview, type PaymentPlanInput } from './property-plan'

const base: PaymentPlanInput = { monthly: null, intermediate: null, keys: null, fundingSource: 'own' }

describe('buildPaymentPlan', () => {
  it('mensais: mesmo dia de cada mês, descrições k/n', () => {
    const rows = buildPaymentPlan({ ...base, monthly: { amountCents: 150_000, count: 3, firstDueDate: '2026-11-10' } })
    expect(rows).toEqual([
      { systemKey: 'monthly', description: 'Parcela mensal 1/3', plannedAmountCents: 150_000, dueDate: '2026-11-10', fundingSource: 'own' },
      { systemKey: 'monthly', description: 'Parcela mensal 2/3', plannedAmountCents: 150_000, dueDate: '2026-12-10', fundingSource: 'own' },
      { systemKey: 'monthly', description: 'Parcela mensal 3/3', plannedAmountCents: 150_000, dueDate: '2027-01-10', fundingSource: 'own' },
    ])
  })

  it('mensal no dia 31 atravessa fevereiro de ano bissexto e volta a 31', () => {
    const rows = buildPaymentPlan({ ...base, monthly: { amountCents: 1, count: 3, firstDueDate: '2028-01-31' } })
    expect(rows.map((row) => row.dueDate)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
  })

  it('intermediárias a cada 6 e a cada 12 meses', () => {
    const six = buildPaymentPlan({ ...base, intermediate: { amountCents: 1_000_000, count: 3, firstDueDate: '2026-12-15', everyMonths: 6 } })
    expect(six.map((row) => [row.description, row.dueDate])).toEqual([
      ['Intermediária 1/3', '2026-12-15'],
      ['Intermediária 2/3', '2027-06-15'],
      ['Intermediária 3/3', '2027-12-15'],
    ])
    const yearly = buildPaymentPlan({ ...base, intermediate: { amountCents: 1, count: 2, firstDueDate: '2028-02-29', everyMonths: 12 } })
    expect(yearly.map((row) => row.dueDate)).toEqual(['2028-02-29', '2029-02-28'])
  })

  it('só chaves, com a fonte escolhida', () => {
    expect(buildPaymentPlan({ ...base, keys: { amountCents: 5_000_000, dueDate: '2029-06-30' }, fundingSource: 'financing' })).toEqual([
      { systemKey: 'keys', description: 'Parcela das chaves', plannedAmountCents: 5_000_000, dueDate: '2029-06-30', fundingSource: 'financing' },
    ])
  })

  it('sem blocos, nada', () => {
    expect(buildPaymentPlan(base)).toEqual([])
  })
})

describe('planPreview', () => {
  it('por bloco, na ordem mensais → intermediárias → chaves, e total geral', () => {
    const rows = buildPaymentPlan({
      ...base,
      keys: { amountCents: 5_000_000, dueDate: '2029-06-30' },
      monthly: { amountCents: 150_000, count: 36, firstDueDate: '2026-11-10' },
      intermediate: { amountCents: 1_000_000, count: 6, firstDueDate: '2026-12-15', everyMonths: 6 },
    })
    expect(planPreview(rows)).toEqual({
      blocks: [
        { systemKey: 'monthly', count: 36, firstDate: '2026-11-10', lastDate: '2029-10-10', totalCents: 5_400_000 },
        { systemKey: 'intermediate', count: 6, firstDate: '2026-12-15', lastDate: '2029-06-15', totalCents: 6_000_000 },
        { systemKey: 'keys', count: 1, firstDate: '2029-06-30', lastDate: '2029-06-30', totalCents: 5_000_000 },
      ],
      count: 43,
      totalCents: 16_400_000,
    })
  })
  it('vazio', () => {
    expect(planPreview([])).toEqual({ blocks: [], count: 0, totalCents: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/finance/property-plan.test.ts`
Expected: FAIL — "Failed to resolve import './property-plan'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/finance/property-plan.ts
import { addMonthsClamped } from './invoice'
import type { FundingSource } from './property'

export type PlanSystemKey = 'monthly' | 'intermediate' | 'keys'

export const PLAN_BLOCK_LABELS: Record<PlanSystemKey, string> = {
  monthly: 'Mensais',
  intermediate: 'Intermediárias',
  keys: 'Chaves',
}

export type PaymentPlanInput = {
  monthly: { amountCents: number; count: number; firstDueDate: string } | null
  intermediate: { amountCents: number; count: number; firstDueDate: string; everyMonths: 6 | 12 } | null
  keys: { amountCents: number; dueDate: string } | null
  fundingSource: FundingSource
}

export type PlanRow = {
  systemKey: PlanSystemKey
  description: string
  plannedAmountCents: number
  dueDate: string
  fundingSource: FundingSource
}

/** Gastos previstos do plano da construtora. Datas sempre a partir da 1ª (dia 31 → 28/29 em fevereiro e volta a 31). */
export function buildPaymentPlan(input: PaymentPlanInput): PlanRow[] {
  const rows: PlanRow[] = []
  const { fundingSource } = input
  if (input.monthly) {
    const { amountCents, count, firstDueDate } = input.monthly
    for (let k = 0; k < count; k++) {
      rows.push({
        systemKey: 'monthly',
        description: `Parcela mensal ${k + 1}/${count}`,
        plannedAmountCents: amountCents,
        dueDate: addMonthsClamped(firstDueDate, k),
        fundingSource,
      })
    }
  }
  if (input.intermediate) {
    const { amountCents, count, firstDueDate, everyMonths } = input.intermediate
    for (let k = 0; k < count; k++) {
      rows.push({
        systemKey: 'intermediate',
        description: `Intermediária ${k + 1}/${count}`,
        plannedAmountCents: amountCents,
        dueDate: addMonthsClamped(firstDueDate, k * everyMonths),
        fundingSource,
      })
    }
  }
  if (input.keys) {
    rows.push({
      systemKey: 'keys',
      description: 'Parcela das chaves',
      plannedAmountCents: input.keys.amountCents,
      dueDate: input.keys.dueDate,
      fundingSource,
    })
  }
  return rows
}

export type PlanBlockPreview = { systemKey: PlanSystemKey; count: number; firstDate: string; lastDate: string; totalCents: number }

const ORDER: PlanSystemKey[] = ['monthly', 'intermediate', 'keys']

/** Resumo do que será criado: por bloco e no total. */
export function planPreview(rows: PlanRow[]): { blocks: PlanBlockPreview[]; count: number; totalCents: number } {
  const blocks = ORDER.flatMap((systemKey) => {
    const block = rows.filter((row) => row.systemKey === systemKey)
    if (block.length === 0) return []
    const dates = block.map((row) => row.dueDate).sort()
    return [
      {
        systemKey,
        count: block.length,
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
        totalCents: block.reduce((sum, row) => sum + row.plannedAmountCents, 0),
      },
    ]
  })
  return {
    blocks,
    count: rows.length,
    totalCents: rows.reduce((sum, row) => sum + row.plannedAmountCents, 0),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/finance/property-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/property-plan.ts lib/finance/property-plan.test.ts
git commit -m "feat(imovel): gerador do plano de pagamento (mensais, intermediárias e chaves) com prévia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lançamento do pagamento, validação e filtros

**Files:**
- Create: `lib/finance/property-payment.ts`, `lib/validation/property.ts`, `lib/property-filters.ts`
- Test: `lib/finance/property-payment.test.ts`, `lib/validation/property.test.ts`, `lib/property-filters.test.ts`

**Interfaces:**
- Consumes: `resolveCycleForDate` (`lib/finance/invoice.ts`); `CardSchedule`, `InvoiceCycle` (`lib/finance/types.ts`); `isoDateSchema`, `uuidSchema` (`lib/validation/common.ts`); `MAX_CENTS`, `descriptionSchema`, `notesSchema` (`lib/validation/fields.ts`); `transactionRecordSchema` (`lib/validation/transaction-record.ts`); `formatYearMonthParam`, `parseYearMonth`, `YearMonth` (`lib/dates.ts`); `monthIndex` (`lib/finance/periods.ts`); Task 2 (`FUNDING_SOURCES`, `TYPICAL_PHASES`, `PROPERTY_PHASES`, `AMORTIZATION_SYSTEMS`, `expenseStatus`, `PropertyExpense`, `ExpenseStatus`, `FundingSource`).
- Produces:
  - `lib/finance/property-payment.ts`: `PROPERTY_TX_PREFIX = 'Imóvel: '`; `propertyTransactionDescription(description: string): string`; `type PaymentTarget = { kind: 'account'; accountId: string } | { kind: 'card'; creditCardId: string; schedule: CardSchedule; stored: InvoiceCycle[] }`; `type PaymentTransaction = { description; amountCents; date; status: 'paid'; categoryId; accountId: string | null; creditCardId: string | null; cycle: InvoiceCycle | null }`; `paymentTransaction(input: { description; paidAmountCents; paidDate; categoryId }, target: PaymentTarget): PaymentTransaction`
  - `lib/validation/property.ts`: `propertySchema`, `type PropertyInput`, `type PropertyOutput`; `expenseSchema`, `type ExpenseInput`, `type ExpenseOutput`; `paymentSchema(today: string)`, `type PaymentInput`, `type PaymentOutput`; `planSchema`, `type PlanInput`, `type PlanOutput`; `expenseTypeSchema`, `type ExpenseTypeInput`; `EXPENSE_RECORD_COLUMNS`, `expenseRecordSchema`, `propertySnapshotSchema`, `type ExpenseRecord`, `type PropertySnapshot`; `type LinkedTransaction = { accountId: string | null; creditCardId: string | null; categoryId: string | null }`; `type ExpenseView = PropertyExpense & { linked: LinkedTransaction | null }`
  - `lib/property-filters.ts`: `PROPERTY_TABS`, `type PropertyTab`, `type ExpenseFilters = { typeId?: string; status?: ExpenseStatus; source?: FundingSource; from?: YearMonth; to?: YearMonth }`, `type PropertyQuery = { propertyId?: string; tab: PropertyTab; filters: ExpenseFilters; expenseId?: string }`, `parsePropertyQuery(params): PropertyQuery`, `propertyHref(query: PropertyQuery, patch?: Partial<PropertyQuery>): string`, `filterExpenses<T extends PropertyExpense>(expenses: T[], filters: ExpenseFilters, today: string): T[]`, `hasExpenseFilters(filters): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/finance/property-payment.test.ts
import { describe, expect, it } from 'vitest'
import { paymentTransaction, propertyTransactionDescription } from './property-payment'

const input = { description: 'Parcela mensal 3/36', paidAmountCents: 153_000, paidDate: '2026-10-02', categoryId: 'imovel' }

describe('propertyTransactionDescription', () => {
  it('prefixo "Imóvel: " e corte em 120', () => {
    expect(propertyTransactionDescription('ITBI')).toBe('Imóvel: ITBI')
    const long = propertyTransactionDescription('x'.repeat(120))
    expect(long).toHaveLength(120)
    expect(long.startsWith('Imóvel: x')).toBe(true)
  })
})

describe('paymentTransaction', () => {
  it('na conta: pago, na data e no valor do pagamento, sem fatura', () => {
    expect(paymentTransaction(input, { kind: 'account', accountId: 'itau' })).toEqual({
      description: 'Imóvel: Parcela mensal 3/36',
      amountCents: 153_000,
      date: '2026-10-02',
      status: 'paid',
      categoryId: 'imovel',
      accountId: 'itau',
      creditCardId: null,
      cycle: null,
    })
  })

  it('no cartão: antes do fechamento cai na fatura do mês; no dia, na seguinte', () => {
    const card = { kind: 'card' as const, creditCardId: 'nubank', schedule: { closingDay: 3, dueDay: 10 }, stored: [] }
    const before = paymentTransaction(input, card)
    expect(before).toMatchObject({ accountId: null, creditCardId: 'nubank', status: 'paid' })
    expect(before.cycle).toMatchObject({ closingDate: '2026-10-03', dueDate: '2026-10-10' })
    const onClosing = paymentTransaction({ ...input, paidDate: '2026-10-03' }, card)
    expect(onClosing.cycle).toMatchObject({ closingDate: '2026-11-03', dueDate: '2026-11-10' })
  })
})
```

```ts
// lib/validation/property.test.ts
import { describe, expect, it } from 'vitest'
import { expenseSchema, expenseTypeSchema, paymentSchema, planSchema, propertySchema } from './property'

const UUID = '0b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'
const UUID2 = '1b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'

describe('propertySchema', () => {
  it('só nome e valor obrigatórios; vazios viram null', () => {
    const parsed = propertySchema.parse({ name: ' Apê Centro ', purchasePriceCents: 50_000_000, developer: '', unit: '', address: '', bank: '' })
    expect(parsed).toMatchObject({
      name: 'Apê Centro',
      developer: null,
      unit: null,
      address: null,
      contractDate: null,
      expectedDeliveryDate: null,
      phase: 'pre_keys',
      bank: null,
      financedAmountCents: null,
      termMonths: null,
      amortizationSystem: null,
      annualInterestRate: null,
    })
  })
  it('recusa nome vazio, prazo acima de 600 e juros acima de 100', () => {
    expect(propertySchema.safeParse({ name: '', purchasePriceCents: 1 }).success).toBe(false)
    expect(propertySchema.safeParse({ name: 'A', purchasePriceCents: 1, termMonths: 601 }).success).toBe(false)
    expect(propertySchema.safeParse({ name: 'A', purchasePriceCents: 1, annualInterestRate: 100.5 }).success).toBe(false)
  })
})

describe('expenseSchema', () => {
  it('aceita previsto 0 e normaliza favorecido vazio', () => {
    const parsed = expenseSchema.parse({
      propertyId: UUID,
      expenseTypeId: UUID2,
      description: 'ITBI',
      payee: '',
      plannedAmountCents: 0,
      dueDate: '2026-12-01',
      fundingSource: 'fgts',
      notes: '',
    })
    expect(parsed).toMatchObject({ payee: null, notes: null, plannedAmountCents: 0, fundingSource: 'fgts' })
  })
})

describe('paymentSchema', () => {
  const base = { expenseId: UUID, paidAmountCents: 153_000, paidDate: '2026-10-05', fundingSource: 'own', launch: true, source: { kind: 'account', id: UUID2 }, categoryId: UUID }
  it('pagamento com data futura é recusado no campo da data', () => {
    const result = paymentSchema('2026-10-05').safeParse({ ...base, paidDate: '2026-10-06' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['paidDate'])
  })
  it('recursos próprios com "Lançar" exige conta/cartão e categoria', () => {
    const result = paymentSchema('2026-10-05').safeParse({ ...base, source: null, categoryId: null })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(['categoryId', 'source'])
  })
  it('FGTS nunca lança, mesmo com launch ligado', () => {
    const parsed = paymentSchema('2026-10-05').parse({ ...base, fundingSource: 'fgts', source: null, categoryId: null })
    expect(parsed.launch).toBe(false)
  })
})

describe('planSchema', () => {
  it('exige ao menos um bloco', () => {
    expect(planSchema.safeParse({ propertyId: UUID, fundingSource: 'own', monthly: null, intermediate: null, keys: null }).success).toBe(false)
  })
  it('limites de quantidade e intervalo das intermediárias', () => {
    const ok = { propertyId: UUID, fundingSource: 'own', monthly: { amountCents: 1, count: 360, firstDueDate: '2026-11-10' }, intermediate: null, keys: null }
    expect(planSchema.safeParse(ok).success).toBe(true)
    expect(planSchema.safeParse({ ...ok, monthly: { ...ok.monthly, count: 361 } }).success).toBe(false)
    expect(
      planSchema.safeParse({ ...ok, intermediate: { amountCents: 1, count: 2, firstDueDate: '2026-12-15', everyMonths: 3 } }).success,
    ).toBe(false)
  })
})

describe('expenseTypeSchema', () => {
  it('nome 1–60 e fase típica válida', () => {
    expect(expenseTypeSchema.safeParse({ name: 'Móveis', typicalPhase: 'post_keys' }).success).toBe(true)
    expect(expenseTypeSchema.safeParse({ name: '', typicalPhase: 'post_keys' }).success).toBe(false)
    expect(expenseTypeSchema.safeParse({ name: 'X', typicalPhase: 'nunca' }).success).toBe(false)
  })
})
```

```ts
// lib/property-filters.test.ts
import { describe, expect, it } from 'vitest'
import type { PropertyExpense } from '@/lib/finance/property'
import { filterExpenses, hasExpenseFilters, parsePropertyQuery, propertyHref } from './property-filters'

const UUID = '0b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'
const TYPE = '1b6f4c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b'

const expense = (patch: Partial<PropertyExpense>): PropertyExpense => ({
  id: 'e',
  propertyId: 'p',
  expenseTypeId: TYPE,
  description: 'X',
  payee: null,
  plannedAmountCents: 1,
  dueDate: '2026-11-10',
  status: 'planned',
  paidAmountCents: null,
  paidDate: null,
  fundingSource: 'own',
  transactionId: null,
  notes: null,
  ...patch,
})

describe('parsePropertyQuery', () => {
  it('lê aba, filtros e gasto; inválidos são ignorados', () => {
    expect(
      parsePropertyQuery({ imovel: UUID, aba: 'gastos', tipo: TYPE, status: 'atrasado', fonte: 'fgts', de: '2026-01', ate: '2026-12', gasto: UUID }),
    ).toEqual({
      propertyId: UUID,
      tab: 'gastos',
      filters: { typeId: TYPE, status: 'overdue', source: 'fgts', from: { year: 2026, month: 1 }, to: { year: 2026, month: 12 } },
      expenseId: UUID,
    })
    expect(parsePropertyQuery({ imovel: 'x', aba: 'nada', status: 'zzz', fonte: 'zzz', de: '2026-13' })).toEqual({ tab: 'resumo', filters: {} })
  })
})

describe('propertyHref', () => {
  it('monta a URL com imóvel, aba e filtros; patch troca partes', () => {
    const query = parsePropertyQuery({ imovel: UUID, aba: 'gastos', status: 'pago', fonte: 'proprios', de: '2026-01' })
    expect(propertyHref(query)).toBe(`/imovel?imovel=${UUID}&aba=gastos&status=pago&fonte=proprios&de=2026-01`)
    expect(propertyHref(query, { tab: 'resumo', filters: {} })).toBe(`/imovel?imovel=${UUID}&aba=resumo`)
  })
})

describe('filterExpenses', () => {
  const list = [
    expense({ id: 'late', dueDate: '2026-09-10' }),
    expense({ id: 'paid', status: 'paid', paidAmountCents: 1, paidDate: '2026-10-01', dueDate: '2026-10-10', fundingSource: 'fgts' }),
    expense({ id: 'future', dueDate: '2027-02-10', expenseTypeId: 'outro' }),
  ]
  it('por status (inclusive atrasado), fonte, tipo e período do vencimento', () => {
    const today = '2026-10-05'
    expect(filterExpenses(list, { status: 'overdue' }, today).map((e) => e.id)).toEqual(['late'])
    expect(filterExpenses(list, { source: 'fgts' }, today).map((e) => e.id)).toEqual(['paid'])
    expect(filterExpenses(list, { typeId: TYPE }, today).map((e) => e.id)).toEqual(['late', 'paid'])
    expect(filterExpenses(list, { from: { year: 2026, month: 10 }, to: { year: 2026, month: 12 } }, today).map((e) => e.id)).toEqual(['paid'])
    expect(filterExpenses(list, {}, today)).toHaveLength(3)
  })
  it('hasExpenseFilters', () => {
    expect(hasExpenseFilters({})).toBe(false)
    expect(hasExpenseFilters({ source: 'own' })).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/finance/property-payment.test.ts lib/validation/property.test.ts lib/property-filters.test.ts`
Expected: FAIL — os três módulos ainda não existem.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/finance/property-payment.ts
import { resolveCycleForDate } from './invoice'
import type { CardSchedule, InvoiceCycle } from './types'

export const PROPERTY_TX_PREFIX = 'Imóvel: '

/** "Imóvel: <descrição do gasto>", cortado no limite de 120 da descrição do lançamento. */
export function propertyTransactionDescription(description: string): string {
  return `${PROPERTY_TX_PREFIX}${description}`.slice(0, 120)
}

export type PaymentTarget =
  | { kind: 'account'; accountId: string }
  | { kind: 'card'; creditCardId: string; schedule: CardSchedule; stored: InvoiceCycle[] }

export type PaymentTransaction = {
  description: string
  amountCents: number
  date: string
  status: 'paid'
  categoryId: string
  accountId: string | null
  creditCardId: string | null
  cycle: InvoiceCycle | null
}

/** Lançamento de um gasto pago com recursos próprios. A data nunca é futura, então é sempre "pago". */
export function paymentTransaction(
  input: { description: string; paidAmountCents: number; paidDate: string; categoryId: string },
  target: PaymentTarget,
): PaymentTransaction {
  const base = {
    description: propertyTransactionDescription(input.description),
    amountCents: input.paidAmountCents,
    date: input.paidDate,
    status: 'paid' as const,
    categoryId: input.categoryId,
  }
  if (target.kind === 'account') return { ...base, accountId: target.accountId, creditCardId: null, cycle: null }
  return {
    ...base,
    accountId: null,
    creditCardId: target.creditCardId,
    cycle: resolveCycleForDate(target.schedule, input.paidDate, target.stored),
  }
}
```

```ts
// lib/validation/property.ts
import { z } from 'zod'
import {
  AMORTIZATION_SYSTEMS,
  FUNDING_SOURCES,
  PROPERTY_PHASES,
  TYPICAL_PHASES,
  type PropertyExpense,
} from '@/lib/finance/property'
import { isoDateSchema, uuidSchema } from './common'
import { MAX_CENTS, descriptionSchema, notesSchema } from './fields'
import { transactionRecordSchema } from './transaction-record'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Use no máximo ${max} caracteres.` })
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))

const centsSchema = z
  .number({ error: 'Informe o valor.' })
  .int({ error: 'Informe o valor.' })
  .min(0, { error: 'Informe um valor válido.' })
  .max(MAX_CENTS, { error: 'Valor muito alto.' })

const positiveCents = centsSchema.refine((value) => value > 0, { error: 'Informe um valor maior que zero.' })

const optionalDate = isoDateSchema
  .nullable()
  .optional()
  .transform((value) => value ?? null)

export const propertySchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome.' }).max(80, { error: 'Use no máximo 80 caracteres.' }),
  developer: optionalText(200),
  unit: optionalText(200),
  address: optionalText(200),
  purchasePriceCents: centsSchema,
  contractDate: optionalDate,
  expectedDeliveryDate: optionalDate,
  phase: z.enum(PROPERTY_PHASES, { error: 'Escolha a fase.' }).default('pre_keys'),
  bank: optionalText(80),
  financedAmountCents: centsSchema.nullable().optional().transform((value) => value ?? null),
  termMonths: z
    .number()
    .int({ error: 'Informe meses inteiros.' })
    .min(1, { error: 'Prazo entre 1 e 600 meses.' })
    .max(600, { error: 'Prazo entre 1 e 600 meses.' })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  amortizationSystem: z
    .enum(AMORTIZATION_SYSTEMS, { error: 'Escolha SAC ou Price.' })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  annualInterestRate: z
    .number({ error: 'Informe a taxa.' })
    .min(0, { error: 'Taxa entre 0 e 100% ao ano.' })
    .max(100, { error: 'Taxa entre 0 e 100% ao ano.' })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
})

export type PropertyInput = z.input<typeof propertySchema>
export type PropertyOutput = z.output<typeof propertySchema>

export const expenseSchema = z.object({
  propertyId: uuidSchema,
  expenseTypeId: z.uuid({ error: 'Escolha o tipo.' }),
  description: descriptionSchema,
  payee: optionalText(80),
  plannedAmountCents: centsSchema,
  dueDate: isoDateSchema,
  fundingSource: z.enum(FUNDING_SOURCES, { error: 'Escolha a fonte.' }),
  notes: notesSchema,
})

export type ExpenseInput = z.input<typeof expenseSchema>
export type ExpenseOutput = z.output<typeof expenseSchema>

const sourceSchema = z
  .object({ kind: z.enum(['account', 'card']), id: z.uuid({ error: 'Escolha a conta ou o cartão.' }) })
  .nullable()
  .optional()
  .transform((value) => value ?? null)

/** `today` (AAAA-MM-DD) impede pagamento com data futura. Só recursos próprios lança nas finanças. */
export function paymentSchema(today: string) {
  return z
    .object({
      expenseId: uuidSchema,
      paidAmountCents: positiveCents,
      paidDate: isoDateSchema.refine((value) => value <= today, { error: 'A data do pagamento não pode ser futura.' }),
      fundingSource: z.enum(FUNDING_SOURCES, { error: 'Escolha a fonte.' }),
      launch: z.boolean(),
      source: sourceSchema,
      categoryId: z.uuid({ error: 'Escolha a categoria.' }).nullable().optional().transform((value) => value ?? null),
    })
    .transform((value) => ({ ...value, launch: value.launch && value.fundingSource === 'own' }))
    .superRefine((value, ctx) => {
      if (!value.launch) return
      if (!value.source) ctx.addIssue({ code: 'custom', path: ['source'], message: 'Escolha a conta ou o cartão.' })
      if (!value.categoryId) ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Escolha a categoria.' })
    })
}

export type PaymentInput = z.input<ReturnType<typeof paymentSchema>>
export type PaymentOutput = z.output<ReturnType<typeof paymentSchema>>

const blockCount = (max: number) =>
  z
    .number({ error: 'Informe a quantidade.' })
    .int({ error: 'Informe a quantidade.' })
    .min(1, { error: `Entre 1 e ${max}.` })
    .max(max, { error: `Entre 1 e ${max}.` })

export const planSchema = z
  .object({
    propertyId: uuidSchema,
    fundingSource: z.enum(FUNDING_SOURCES, { error: 'Escolha a fonte.' }),
    monthly: z.object({ amountCents: positiveCents, count: blockCount(360), firstDueDate: isoDateSchema }).nullable(),
    intermediate: z
      .object({
        amountCents: positiveCents,
        count: blockCount(60),
        firstDueDate: isoDateSchema,
        everyMonths: z.union([z.literal(6), z.literal(12)], { error: 'A cada 6 ou 12 meses.' }),
      })
      .nullable(),
    keys: z.object({ amountCents: positiveCents, dueDate: isoDateSchema }).nullable(),
  })
  .refine((value) => value.monthly || value.intermediate || value.keys, {
    error: 'Preencha ao menos um bloco: mensais, intermediárias ou chaves.',
    path: ['monthly'],
  })

export type PlanInput = z.input<typeof planSchema>
export type PlanOutput = z.output<typeof planSchema>

export const expenseTypeSchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome.' }).max(60, { error: 'Use no máximo 60 caracteres.' }),
  typicalPhase: z.enum(TYPICAL_PHASES, { error: 'Escolha a fase típica.' }),
})

export type ExpenseTypeInput = z.input<typeof expenseTypeSchema>

/** Colunas de property_expenses que o "Desfazer" recria. */
export const EXPENSE_RECORD_COLUMNS =
  'id, property_id, expense_type_id, description, payee, planned_amount_cents, due_date, status, paid_amount_cents, paid_date, funding_source, transaction_id, notes'

export const expenseRecordSchema = z.object({
  id: z.uuid(),
  property_id: z.uuid(),
  expense_type_id: z.uuid(),
  description: z.string().min(1).max(120),
  payee: z.string().max(80).nullable(),
  planned_amount_cents: z.number().int().min(0),
  due_date: isoDateSchema,
  status: z.enum(['planned', 'paid']),
  paid_amount_cents: z.number().int().positive().nullable(),
  paid_date: isoDateSchema.nullable(),
  funding_source: z.enum(FUNDING_SOURCES),
  transaction_id: z.uuid().nullable(),
  notes: z.string().max(500).nullable(),
})

export const propertySnapshotSchema = z.object({
  expenses: z.array(expenseRecordSchema).min(1).max(500),
  transactions: z.array(transactionRecordSchema).max(500),
})

export type ExpenseRecord = z.output<typeof expenseRecordSchema>
export type PropertySnapshot = z.output<typeof propertySnapshotSchema>

/** Conta/cartão e categoria do lançamento ligado (para pré-preencher "Editar pagamento"). */
export type LinkedTransaction = { accountId: string | null; creditCardId: string | null; categoryId: string | null }
export type ExpenseView = PropertyExpense & { linked: LinkedTransaction | null }
```

```ts
// lib/property-filters.ts
import { formatYearMonthParam, parseYearMonth, type YearMonth } from '@/lib/dates'
import { monthIndex } from '@/lib/finance/periods'
import { expenseStatus, type ExpenseStatus, type FundingSource, type PropertyExpense } from '@/lib/finance/property'
import { uuidSchema } from '@/lib/validation/common'

export const PROPERTY_TABS = ['resumo', 'cronograma', 'tipos', 'gastos'] as const
export type PropertyTab = (typeof PROPERTY_TABS)[number]

export const PROPERTY_TAB_LABELS: Record<PropertyTab, string> = {
  resumo: 'Resumo',
  cronograma: 'Cronograma',
  tipos: 'Por tipo',
  gastos: 'Gastos',
}

export type ExpenseFilters = { typeId?: string; status?: ExpenseStatus; source?: FundingSource; from?: YearMonth; to?: YearMonth }
export type PropertyQuery = { propertyId?: string; tab: PropertyTab; filters: ExpenseFilters; expenseId?: string }

type Params = Record<string, string | string[] | undefined>

const STATUS_FROM_PARAM: Record<string, ExpenseStatus> = { previsto: 'planned', pago: 'paid', atrasado: 'overdue' }
const STATUS_TO_PARAM: Record<ExpenseStatus, string> = { planned: 'previsto', paid: 'pago', overdue: 'atrasado' }
const SOURCE_FROM_PARAM: Record<string, FundingSource> = { proprios: 'own', fgts: 'fgts', financiamento: 'financing' }
const SOURCE_TO_PARAM: Record<FundingSource, string> = { own: 'proprios', fgts: 'fgts', financing: 'financiamento' }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const lookup = <T,>(map: Record<string, T>, key: string | undefined): T | undefined =>
  key !== undefined && Object.hasOwn(map, key) ? map[key] : undefined
const validUuid = (value: string | undefined) => (value && uuidSchema.safeParse(value).success ? value : undefined)

/** Lê ?imovel, ?aba, ?tipo, ?status, ?fonte, ?de, ?ate e ?gasto; valores inválidos são ignorados. */
export function parsePropertyQuery(params: Params): PropertyQuery {
  const query: PropertyQuery = { tab: 'resumo', filters: {} }
  const propertyId = validUuid(first(params.imovel))
  const tab = PROPERTY_TABS.find((value) => value === first(params.aba))
  const typeId = validUuid(first(params.tipo))
  const status = lookup(STATUS_FROM_PARAM, first(params.status))
  const source = lookup(SOURCE_FROM_PARAM, first(params.fonte))
  const from = parseYearMonth(first(params.de))
  const to = parseYearMonth(first(params.ate))
  const expenseId = validUuid(first(params.gasto))
  if (propertyId) query.propertyId = propertyId
  if (tab) query.tab = tab
  if (typeId) query.filters.typeId = typeId
  if (status) query.filters.status = status
  if (source) query.filters.source = source
  if (from) query.filters.from = from
  if (to) query.filters.to = to
  if (expenseId) query.expenseId = expenseId
  return query
}

/** URL de /imovel com imóvel, aba e filtros (o gasto aberto não entra). */
export function propertyHref(query: PropertyQuery, patch: Partial<PropertyQuery> = {}): string {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.propertyId) params.set('imovel', next.propertyId)
  params.set('aba', next.tab)
  const { filters } = next
  if (filters.typeId) params.set('tipo', filters.typeId)
  if (filters.status) params.set('status', STATUS_TO_PARAM[filters.status])
  if (filters.source) params.set('fonte', SOURCE_TO_PARAM[filters.source])
  if (filters.from) params.set('de', formatYearMonthParam(filters.from))
  if (filters.to) params.set('ate', formatYearMonthParam(filters.to))
  return `/imovel?${params.toString()}`
}

export function hasExpenseFilters(filters: ExpenseFilters): boolean {
  return Object.values(filters).some(Boolean)
}

/** Filtra pelo tipo, status (com "atrasado" calculado), fonte e mês de vencimento (de/até, inclusivos). */
export function filterExpenses<T extends PropertyExpense>(expenses: T[], filters: ExpenseFilters, today: string): T[] {
  const from = filters.from ? monthIndex(filters.from) : null
  const to = filters.to ? monthIndex(filters.to) : null
  return expenses.filter((expense) => {
    if (filters.typeId && expense.expenseTypeId !== filters.typeId) return false
    if (filters.status && expenseStatus(expense, today) !== filters.status) return false
    if (filters.source && expense.fundingSource !== filters.source) return false
    const due = monthIndex(parseYearMonth(expense.dueDate.slice(0, 7)) as YearMonth)
    if (from !== null && due < from) return false
    if (to !== null && due > to) return false
    return true
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/finance/property-payment.test.ts lib/validation/property.test.ts lib/property-filters.test.ts`
Expected: PASS. (Se `parseYearMonth` recusar algum ano fora de 2000–2100 num teste, ajuste o teste — o app só trabalha nessa faixa.)

- [ ] **Step 5: Commit**

```bash
git add lib/finance/property-payment.ts lib/finance/property-payment.test.ts lib/validation/property.ts lib/validation/property.test.ts lib/property-filters.ts lib/property-filters.test.ts
git commit -m "feat(imovel): lançamento do pagamento, validação e filtros da lista de gastos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Consultas, argumentos dos RPCs e Server Actions do imóvel

**Files:**
- Create: `lib/property-rpc.ts`, `lib/property.ts`, `lib/actions/properties.ts`, `lib/actions/property-expenses.ts`, `lib/actions/property-types.ts`
- Modify: `lib/validation/property.ts` (acrescentar `PropertyRecord`), `lib/supabase/errors.ts` (mensagens novas)
- Test: `lib/property-rpc.test.ts`, `lib/supabase/errors.test.ts` (acrescentar um caso)

**Interfaces:**
- Consumes: Task 1 (tabelas e RPCs), Tasks 2–4; `cycleColumns` (`lib/card-rpc.ts`); `loadCardContext` (`lib/card-context.ts`); `fetchAllPages`; `getCurrentUser` (`lib/auth.ts`); `getCurrentHousehold` (`lib/household.ts`); `todayISO`; `TRANSACTION_RECORD_COLUMNS`, `type TransactionRecord` (`lib/validation/transaction-record.ts`).
- Produces:
  - `lib/validation/property.ts`: `type PropertyRecord = { id; name; developer; unit; address; purchasePriceCents; contractDate; expectedDeliveryDate; phase: PropertyPhase; bank; financedAmountCents; termMonths; amortizationSystem: AmortizationSystem | null; annualInterestRate: number | null }` (campos opcionais como `string | null` / `number | null`)
  - `lib/property-rpc.ts`: `propertyColumns(p: PropertyOutput)`, `type ExpenseRowInput`, `expenseRows(rows: ExpenseRowInput[])`, `payArgs(expenseId, paid: { paidAmountCents; paidDate; fundingSource }, tx: PaymentTransaction | null)`
  - `lib/property.ts` (server-only): `listProperties(): Promise<PropertyRecord[]>`, `listExpenseTypes(): Promise<ExpenseType[]>`, `listPropertyExpenses(propertyId): Promise<ExpenseView[]>`, `findExpenseByTransaction(transactionId): Promise<{ propertyId: string; expenseId: string } | null>`, `type PropertyCard = { propertyId: string; name: string; summary: PropertySummary; nextStatus: ExpenseStatus | null }`, `getPropertyCard(today): Promise<PropertyCard | null>`
  - `lib/actions/properties.ts`: `createProperty(input): ActionResult<{ id: string }>`, `updateProperty(id, input): ActionResult`, `deleteProperty(id): ActionResult`
  - `lib/actions/property-expenses.ts`: `createExpense(input): ActionResult<{ id: string }>`, `updateExpense(id, input): ActionResult`, `generatePlan(input): ActionResult<{ ids: string[] }>`, `payExpense(input): ActionResult<{ transactionId: string | null }>`, `unpayExpense(id): ActionResult`, `deleteExpenses(ids): ActionResult<PropertySnapshot>`, `restoreExpenses(snapshot): ActionResult`, `deleteLinkedTransaction(transactionId): ActionResult`
  - `lib/actions/property-types.ts`: `createExpenseType(input): ActionResult<{ id: string }>`, `updateExpenseType(id, input): ActionResult`, `setExpenseTypeArchived(id, archived): ActionResult`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/property-rpc.test.ts
import { describe, expect, it } from 'vitest'
import { expenseRows, payArgs, propertyColumns } from './property-rpc'

describe('propertyColumns', () => {
  it('converte para as colunas de properties', () => {
    expect(
      propertyColumns({
        name: 'Apê',
        developer: null,
        unit: 'Bloco B 302',
        address: null,
        purchasePriceCents: 50_000_000,
        contractDate: '2025-03-10',
        expectedDeliveryDate: '2029-06-30',
        phase: 'pre_keys',
        bank: 'Caixa',
        financedAmountCents: 40_000_000,
        termMonths: 420,
        amortizationSystem: 'sac',
        annualInterestRate: 9.5,
      }),
    ).toEqual({
      name: 'Apê',
      developer: null,
      unit: 'Bloco B 302',
      address: null,
      purchase_price_cents: 50_000_000,
      contract_date: '2025-03-10',
      expected_delivery_date: '2029-06-30',
      phase: 'pre_keys',
      bank: 'Caixa',
      financed_amount_cents: 40_000_000,
      term_months: 420,
      amortization_system: 'sac',
      annual_interest_rate: 9.5,
    })
  })
})

describe('expenseRows', () => {
  it('linhas do create_property_expenses', () => {
    expect(
      expenseRows([
        { expenseTypeId: 't', description: 'ITBI', payee: null, plannedAmountCents: 800_000, dueDate: '2026-12-01', fundingSource: 'fgts', notes: null },
      ]),
    ).toEqual([
      { expense_type_id: 't', description: 'ITBI', payee: null, planned_amount_cents: 800_000, due_date: '2026-12-01', funding_source: 'fgts', notes: null },
    ])
  })
})

describe('payArgs', () => {
  const paid = { paidAmountCents: 153_000, paidDate: '2026-10-02', fundingSource: 'own' as const }
  it('sem lançamento: p_transaction nulo', () => {
    expect(payArgs('e', { ...paid, fundingSource: 'fgts' }, null)).toEqual({
      p_expense_id: 'e',
      p_paid: { paid_amount_cents: 153_000, paid_date: '2026-10-02', funding_source: 'fgts' },
      p_transaction: null,
    })
  })
  it('na conta e no cartão (com o ciclo da fatura)', () => {
    const base = { description: 'Imóvel: X', amountCents: 153_000, date: '2026-10-02', status: 'paid' as const, categoryId: 'c' }
    expect(payArgs('e', paid, { ...base, accountId: 'a', creditCardId: null, cycle: null }).p_transaction).toEqual({
      description: 'Imóvel: X',
      amount_cents: 153_000,
      date: '2026-10-02',
      status: 'paid',
      category_id: 'c',
      account_id: 'a',
      credit_card_id: null,
    })
    const cycle = { closingMonth: '2026-10-01', closingDate: '2026-10-03', dueDate: '2026-10-10', referenceMonth: '2026-10-01' }
    expect(payArgs('e', paid, { ...base, accountId: null, creditCardId: 'k', cycle }).p_transaction).toEqual({
      description: 'Imóvel: X',
      amount_cents: 153_000,
      date: '2026-10-02',
      status: 'paid',
      category_id: 'c',
      account_id: null,
      credit_card_id: 'k',
      closing_month: '2026-10-01',
      closing_date: '2026-10-03',
      due_date: '2026-10-10',
      reference_month: '2026-10-01',
    })
  })
})
```

Acrescentar em `lib/supabase/errors.test.ts`, dentro do `describe` existente:

```ts
  it('traduz os erros do imóvel', () => {
    expect(translateError({ message: 'PROPERTY_LOCKED' })).toBe('Este lançamento vem do Imóvel. Edite pelo Imóvel.')
    expect(translateError({ message: 'INVALID_EXPENSE_TYPE' })).toBe('Tipo de gasto inválido.')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/property-rpc.test.ts lib/supabase/errors.test.ts`
Expected: FAIL — `./property-rpc` não existe e as mensagens novas não estão em `translateError`.

- [ ] **Step 3: `PropertyRecord`, argumentos dos RPCs e mensagens de erro**

Acrescentar no fim de `lib/validation/property.ts` (e incluir `type AmortizationSystem, type PropertyPhase` no import de `@/lib/finance/property`):

```ts
/** Imóvel como a tela usa (camelCase). */
export type PropertyRecord = {
  id: string
  name: string
  developer: string | null
  unit: string | null
  address: string | null
  purchasePriceCents: number
  contractDate: string | null
  expectedDeliveryDate: string | null
  phase: PropertyPhase
  bank: string | null
  financedAmountCents: number | null
  termMonths: number | null
  amortizationSystem: AmortizationSystem | null
  annualInterestRate: number | null
}
```

```ts
// lib/property-rpc.ts
import { cycleColumns } from '@/lib/card-rpc'
import type { FundingSource } from '@/lib/finance/property'
import type { PaymentTransaction } from '@/lib/finance/property-payment'
import type { PropertyOutput } from '@/lib/validation/property'

/** Campos do formulário nas colunas de properties (sem household_id). */
export function propertyColumns(property: PropertyOutput) {
  return {
    name: property.name,
    developer: property.developer,
    unit: property.unit,
    address: property.address,
    purchase_price_cents: property.purchasePriceCents,
    contract_date: property.contractDate,
    expected_delivery_date: property.expectedDeliveryDate,
    phase: property.phase,
    bank: property.bank,
    financed_amount_cents: property.financedAmountCents,
    term_months: property.termMonths,
    amortization_system: property.amortizationSystem,
    annual_interest_rate: property.annualInterestRate,
  }
}

export type ExpenseRowInput = {
  expenseTypeId: string
  description: string
  payee: string | null
  plannedAmountCents: number
  dueDate: string
  fundingSource: FundingSource
  notes: string | null
}

/** Linhas de create_property_expenses. */
export function expenseRows(rows: ExpenseRowInput[]) {
  return rows.map((row) => ({
    expense_type_id: row.expenseTypeId,
    description: row.description,
    payee: row.payee,
    planned_amount_cents: row.plannedAmountCents,
    due_date: row.dueDate,
    funding_source: row.fundingSource,
    notes: row.notes,
  }))
}

/** Argumentos de pay_property_expense: dados do pagamento e, se houver, o lançamento (no cartão, com o ciclo da fatura). */
export function payArgs(
  expenseId: string,
  paid: { paidAmountCents: number; paidDate: string; fundingSource: FundingSource },
  tx: PaymentTransaction | null,
) {
  return {
    p_expense_id: expenseId,
    p_paid: { paid_amount_cents: paid.paidAmountCents, paid_date: paid.paidDate, funding_source: paid.fundingSource },
    p_transaction: tx
      ? {
          description: tx.description,
          amount_cents: tx.amountCents,
          date: tx.date,
          status: tx.status,
          category_id: tx.categoryId,
          account_id: tx.accountId,
          credit_card_id: tx.creditCardId,
          ...(tx.cycle ? cycleColumns(tx.cycle) : {}),
        }
      : null,
  }
}
```

Em `lib/supabase/errors.ts`, dentro de `MESSAGES`, depois de `INVALID_BUDGET_CATEGORY`:

```ts
  PROPERTY_LOCKED: 'Este lançamento vem do Imóvel. Edite pelo Imóvel.',
  INVALID_PROPERTY: 'Imóvel inválido.',
  INVALID_EXPENSE: 'Gasto do imóvel inválido.',
  INVALID_EXPENSE_TYPE: 'Tipo de gasto inválido.',
  INVALID_TRANSACTION: 'Lançamento inválido.',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/property-rpc.test.ts lib/supabase/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Consultas (`lib/property.ts`)**

```ts
// lib/property.ts
import 'server-only'
import { fetchAllPages } from '@/lib/fetch-all'
import {
  expenseStatus,
  propertySummary,
  type AmortizationSystem,
  type ExpenseStatus,
  type ExpenseType,
  type FundingSource,
  type PropertyPhase,
  type PropertySummary,
  type TypicalPhase,
} from '@/lib/finance/property'
import { createClient } from '@/lib/supabase/server'
import { EXPENSE_RECORD_COLUMNS, type ExpenseView, type PropertyRecord } from '@/lib/validation/property'

const PROPERTY_COLUMNS =
  'id, name, developer, unit, address, purchase_price_cents, contract_date, expected_delivery_date, phase, bank, financed_amount_cents, term_months, amortization_system, annual_interest_rate'

type PropertyRow = {
  id: string
  name: string
  developer: string | null
  unit: string | null
  address: string | null
  purchase_price_cents: number
  contract_date: string | null
  expected_delivery_date: string | null
  phase: string
  bank: string | null
  financed_amount_cents: number | null
  term_months: number | null
  amortization_system: string | null
  annual_interest_rate: number | string | null
}

function toProperty(row: PropertyRow): PropertyRecord {
  return {
    id: row.id,
    name: row.name,
    developer: row.developer,
    unit: row.unit,
    address: row.address,
    purchasePriceCents: Number(row.purchase_price_cents),
    contractDate: row.contract_date,
    expectedDeliveryDate: row.expected_delivery_date,
    phase: row.phase as PropertyPhase,
    bank: row.bank,
    financedAmountCents: row.financed_amount_cents === null ? null : Number(row.financed_amount_cents),
    termMonths: row.term_months,
    amortizationSystem: row.amortization_system as AmortizationSystem | null,
    annualInterestRate: row.annual_interest_rate === null ? null : Number(row.annual_interest_rate),
  }
}

/** Imóveis da casa; o primeiro (mais antigo) é o principal. */
export async function listProperties(): Promise<PropertyRecord[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('properties').select(PROPERTY_COLUMNS).order('created_at').order('id')
  if (error) throw error
  return (data as PropertyRow[]).map(toProperty)
}

/** Todos os tipos de gasto (inclusive arquivados), na ordem do cadastro. */
export async function listExpenseTypes(): Promise<ExpenseType[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('property_expense_types')
    .select('id, name, typical_phase, sort_order, is_default, system_key, archived')
    .order('sort_order')
    .order('name')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    typicalPhase: row.typical_phase as TypicalPhase,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    systemKey: row.system_key,
    archived: row.archived,
  }))
}

type ExpenseRow = {
  id: string
  property_id: string
  expense_type_id: string
  description: string
  payee: string | null
  planned_amount_cents: number
  due_date: string
  status: string
  paid_amount_cents: number | null
  paid_date: string | null
  funding_source: string
  transaction_id: string | null
  notes: string | null
  transactions: { account_id: string | null; credit_card_id: string | null; category_id: string | null } | null
}

function toExpense(row: ExpenseRow): ExpenseView {
  return {
    id: row.id,
    propertyId: row.property_id,
    expenseTypeId: row.expense_type_id,
    description: row.description,
    payee: row.payee,
    plannedAmountCents: Number(row.planned_amount_cents),
    dueDate: row.due_date,
    status: row.status as 'planned' | 'paid',
    paidAmountCents: row.paid_amount_cents === null ? null : Number(row.paid_amount_cents),
    paidDate: row.paid_date,
    fundingSource: row.funding_source as FundingSource,
    transactionId: row.transaction_id,
    notes: row.notes,
    linked: row.transactions
      ? { accountId: row.transactions.account_id, creditCardId: row.transactions.credit_card_id, categoryId: row.transactions.category_id }
      : null,
  }
}

/** Gastos do imóvel por vencimento, com conta/cartão/categoria do lançamento ligado. `propertyId` já validado. */
export async function listPropertyExpenses(propertyId: string): Promise<ExpenseView[]> {
  const supabase = await createClient()
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('property_expenses')
      .select(`${EXPENSE_RECORD_COLUMNS}, transactions(account_id, credit_card_id, category_id)`)
      .eq('property_id', propertyId)
      .order('due_date')
      .order('description')
      .order('id')
      .range(from, to),
  )
  return (rows as unknown as ExpenseRow[]).map(toExpense)
}

/** Gasto ligado a um lançamento (para "Editar no Imóvel"). `transactionId` já validado. */
export async function findExpenseByTransaction(transactionId: string): Promise<{ propertyId: string; expenseId: string } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('property_expenses').select('id, property_id').eq('transaction_id', transactionId).maybeSingle()
  if (error) throw error
  return data ? { propertyId: data.property_id, expenseId: data.id } : null
}

export type PropertyCard = { propertyId: string; name: string; summary: PropertySummary; nextStatus: ExpenseStatus | null }

/** Card do Início: resumo do imóvel principal, ou null se não há imóvel. */
export async function getPropertyCard(today: string): Promise<PropertyCard | null> {
  const [properties, types] = await Promise.all([listProperties(), listExpenseTypes()])
  const property = properties[0]
  if (!property) return null
  const expenses = await listPropertyExpenses(property.id)
  const summary = propertySummary(property.purchasePriceCents, expenses, new Map(types.map((type) => [type.id, type.systemKey])))
  return {
    propertyId: property.id,
    name: property.name,
    summary,
    nextStatus: summary.next ? expenseStatus(summary.next, today) : null,
  }
}
```

- [ ] **Step 6: Actions do imóvel e dos tipos**

```ts
// lib/actions/properties.ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentHousehold } from '@/lib/household'
import { propertyColumns } from '@/lib/property-rpc'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import { propertySchema } from '@/lib/validation/property'

function done() {
  revalidatePath('/', 'layout')
}

export async function createProperty(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = propertySchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('properties')
    .insert({ household_id: household.id, ...propertyColumns(parsed.data) })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateProperty(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = propertySchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase.from('properties').update(propertyColumns(parsed.data)).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: translateError({ message: 'INVALID_PROPERTY' }) }
  done()
  return { ok: true, data: null }
}

/** Apaga o imóvel, os gastos e os lançamentos ligados (delete_property). Sem Desfazer. */
export async function deleteProperty(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_property', { p_property_id: parsedId.data })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: null }
}
```

```ts
// lib/actions/property-types.ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentHousehold } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import { expenseTypeSchema } from '@/lib/validation/property'

function done() {
  revalidatePath('/', 'layout')
}

/** Tipo novo entra no fim da lista. */
export async function createExpenseType(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseTypeSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data: last, error: lastError } = await supabase
    .from('property_expense_types')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastError) return { ok: false, error: translateError(lastError) }

  const { data, error } = await supabase
    .from('property_expense_types')
    .insert({
      household_id: household.id,
      name: parsed.data.name,
      typical_phase: parsed.data.typicalPhase,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateExpenseType(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = expenseTypeSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('property_expense_types')
    .update({ name: parsed.data.name, typical_phase: parsed.data.typicalPhase })
    .eq('id', parsedId.data)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: translateError({ message: 'INVALID_EXPENSE_TYPE' }) }
  done()
  return { ok: true, data: null }
}

export async function setExpenseTypeArchived(id: unknown, archived: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success || typeof archived !== 'boolean') return { ok: false, error: GENERIC_ERROR }
  const supabase = await createClient()
  const { data, error } = await supabase.from('property_expense_types').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: translateError({ message: 'INVALID_EXPENSE_TYPE' }) }
  done()
  return { ok: true, data: null }
}
```

- [ ] **Step 7: Actions dos gastos**

```ts
// lib/actions/property-expenses.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentUser } from '@/lib/auth'
import { loadCardContext } from '@/lib/card-context'
import { todayISO } from '@/lib/dates'
import { paymentTransaction, propertyTransactionDescription, type PaymentTarget, type PaymentTransaction } from '@/lib/finance/property-payment'
import { buildPaymentPlan } from '@/lib/finance/property-plan'
import { getCurrentHousehold } from '@/lib/household'
import { expenseRows, payArgs } from '@/lib/property-rpc'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import {
  EXPENSE_RECORD_COLUMNS,
  expenseSchema,
  paymentSchema,
  planSchema,
  propertySnapshotSchema,
  type ExpenseRecord,
  type PropertySnapshot,
} from '@/lib/validation/property'
import { TRANSACTION_RECORD_COLUMNS, type TransactionRecord } from '@/lib/validation/transaction-record'

function done() {
  revalidatePath('/', 'layout')
}

const fail = (message: string) => ({ ok: false as const, error: translateError({ message }) })

export async function createExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const { propertyId, ...row } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_property_expenses', { p_property_id: propertyId, p_rows: expenseRows([row]) })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: { id: (data as string[])[0] } }
}

/** Edita os dados do gasto. Num gasto pago a fonte não muda aqui (muda em "Editar pagamento"); a descrição do lançamento ligado acompanha. */
export async function updateExpense(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from('property_expenses')
    .select('status, transaction_id')
    .eq('id', parsedId.data)
    .maybeSingle()
  if (readError) return { ok: false, error: translateError(readError) }
  if (!current) return fail('INVALID_EXPENSE')

  const { error } = await supabase
    .from('property_expenses')
    .update({
      expense_type_id: parsed.data.expenseTypeId,
      description: parsed.data.description,
      payee: parsed.data.payee,
      planned_amount_cents: parsed.data.plannedAmountCents,
      due_date: parsed.data.dueDate,
      notes: parsed.data.notes,
      ...(current.status === 'paid' ? {} : { funding_source: parsed.data.fundingSource }),
    })
    .eq('id', parsedId.data)
  if (error) return { ok: false, error: translateError(error) }

  if (current.transaction_id) {
    const { error: txError } = await supabase
      .from('transactions')
      .update({ description: propertyTransactionDescription(parsed.data.description) })
      .eq('id', current.transaction_id)
    if (txError) return { ok: false, error: translateError(txError) }
  }
  done()
  return { ok: true, data: null }
}

/** Cria os gastos previstos do plano numa transação; devolve os ids para o "Desfazer". */
export async function generatePlan(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const { propertyId, ...plan } = parsed.data

  const supabase = await createClient()
  const { data: types, error: typesError } = await supabase
    .from('property_expense_types')
    .select('id, system_key')
    .in('system_key', ['monthly', 'intermediate', 'keys'])
  if (typesError) return { ok: false, error: translateError(typesError) }
  const typeOf = new Map(types.map((type) => [type.system_key as string, type.id]))

  const rows = buildPaymentPlan(plan)
  if (rows.some((row) => !typeOf.has(row.systemKey))) return fail('INVALID_EXPENSE_TYPE')
  const { data, error } = await supabase.rpc('create_property_expenses', {
    p_property_id: propertyId,
    p_rows: expenseRows(
      rows.map((row) => ({
        expenseTypeId: typeOf.get(row.systemKey) as string,
        description: row.description,
        payee: null,
        plannedAmountCents: row.plannedAmountCents,
        dueDate: row.dueDate,
        fundingSource: row.fundingSource,
        notes: null,
      })),
    ),
  })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: { ids: data as string[] } }
}

/** Pagar ou editar o pagamento. Recursos próprios com "Lançar" cria/atualiza o lançamento ligado; senão, apaga o que houver. */
export async function payExpense(input: unknown): Promise<ActionResult<{ transactionId: string | null }>> {
  const parsed = paymentSchema(todayISO()).safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const payment = parsed.data

  const user = await getCurrentUser()
  if (!user) return fail('NOT_AUTHENTICATED')

  const supabase = await createClient()
  const { data: expense, error: readError } = await supabase
    .from('property_expenses')
    .select('description')
    .eq('id', payment.expenseId)
    .maybeSingle()
  if (readError) return { ok: false, error: translateError(readError) }
  if (!expense) return fail('INVALID_EXPENSE')

  let tx: PaymentTransaction | null = null
  if (payment.launch && payment.source && payment.categoryId) {
    let target: PaymentTarget
    if (payment.source.kind === 'account') {
      target = { kind: 'account', accountId: payment.source.id }
    } else {
      const card = await loadCardContext(supabase, payment.source.id)
      if (!card) return fail('INVALID_CARD')
      target = { kind: 'card', creditCardId: payment.source.id, schedule: card.schedule, stored: card.stored }
    }
    tx = paymentTransaction(
      { description: expense.description, paidAmountCents: payment.paidAmountCents, paidDate: payment.paidDate, categoryId: payment.categoryId },
      target,
    )
  }

  const { data, error } = await supabase.rpc('pay_property_expense', payArgs(payment.expenseId, payment, tx))
  if (error) return { ok: false, error: translateError(error) }

  if (tx && payment.source) {
    await supabase
      .from('profiles')
      .update(
        payment.source.kind === 'account'
          ? { last_account_id: payment.source.id, last_credit_card_id: null }
          : { last_credit_card_id: payment.source.id, last_account_id: null },
      )
      .eq('user_id', user.id)
  }
  done()
  return { ok: true, data: { transactionId: (data as string | null) ?? null } }
}

export async function unpayExpense(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const supabase = await createClient()
  const { error } = await supabase.rpc('unpay_property_expense', { p_expense_id: parsedId.data })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: null }
}

const idsSchema = z.array(uuidSchema).min(1).max(500)

/** Exclui gastos (e os lançamentos ligados) e devolve o que precisa para o "Desfazer". */
export async function deleteExpenses(ids: unknown): Promise<ActionResult<PropertySnapshot>> {
  const parsed = idsSchema.safeParse(ids)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data: expenses, error } = await supabase.from('property_expenses').select(EXPENSE_RECORD_COLUMNS).in('id', parsed.data)
  if (error) return { ok: false, error: translateError(error) }
  if (expenses.length === 0) return fail('INVALID_EXPENSE')

  const txIds = expenses.map((row) => row.transaction_id).filter((value): value is string => Boolean(value))
  let transactions: TransactionRecord[] = []
  if (txIds.length > 0) {
    const { data, error: txError } = await supabase.from('transactions').select(TRANSACTION_RECORD_COLUMNS).in('id', txIds)
    if (txError) return { ok: false, error: translateError(txError) }
    transactions = data as TransactionRecord[]
  }

  const { error: rpcError } = await supabase.rpc('delete_property_expenses', { p_ids: parsed.data })
  if (rpcError) return { ok: false, error: translateError(rpcError) }
  done()
  return { ok: true, data: { expenses: expenses as ExpenseRecord[], transactions } }
}

export async function restoreExpenses(snapshot: unknown): Promise<ActionResult> {
  const parsed = propertySnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR }
  const household = await getCurrentHousehold()
  if (!household) return fail('NO_HOUSEHOLD')

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_property_expenses', {
    p_expenses: parsed.data.expenses.map((row) => ({ ...row, household_id: household.id })),
    p_transactions: parsed.data.transactions.map((row) => ({ ...row, household_id: household.id })),
  })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: null }
}

/** Exclui o lançamento ligado (por Lançamentos); o trigger volta o gasto para previsto. Sem Desfazer. */
export async function deleteLinkedTransaction(transactionId: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(transactionId)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const supabase = await createClient()
  const { data, error } = await supabase.from('transactions').delete().eq('id', parsedId.data).eq('source', 'property').select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }
  done()
  return { ok: true, data: null }
}
```

- [ ] **Step 8: Verificar e commitar**

Run: `npx tsc --noEmit`, `npm test`, `npm run lint`
Expected: sem erros. Se os tipos gerados do Supabase não aceitarem um argumento de RPC (ex.: `Json`), faça o cast na chamada (`as unknown as Json`, importando `Json` de `@/lib/supabase/database.types`) — não afrouxe os tipos de `lib/property-rpc.ts`.

```bash
git add lib/property-rpc.ts lib/property-rpc.test.ts lib/property.ts lib/actions/properties.ts lib/actions/property-expenses.ts lib/actions/property-types.ts lib/validation/property.ts lib/supabase/errors.ts lib/supabase/errors.test.ts
git commit -m "feat(imovel): consultas e Server Actions de imóvel, gastos, pagamento e tipos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tela Imóvel — cadastro, cabeçalho, abas e Resumo

**Files:**
- Create: `components/property/property-form.tsx`, `components/property/property-header.tsx`, `components/property/property-tabs.tsx`, `components/property/summary-tab.tsx`, `components/property/status-badge.tsx`, `components/property/progress-bar.tsx`
- Modify: `app/(app)/imovel/page.tsx` (substituir o placeholder)

**Interfaces:**
- Consumes: Task 2 (`propertySummary`, `expenseStatus`, labels, `PropertySummary`), Task 4 (`parsePropertyQuery`, `propertyHref`, `PROPERTY_TABS`, `PROPERTY_TAB_LABELS`, `PropertyQuery`), Task 5 (`listProperties`, `listExpenseTypes`, `listPropertyExpenses`, `PropertyRecord`, `createProperty`, `updateProperty`, `deleteProperty`); `Panel`, `EmptyText` (`components/dashboard/panel.tsx`); `ResponsiveModal`; `Field`, `MoneyInput`, `NativeSelect`; `Button`, `Input`; `PageHeader`; `formatBRL`; `formatISODateBR`.
- Produces (usados nas Tasks 7–10):
  - `ExpenseStatusBadge({ status }: { status: ExpenseStatus })`
  - `ProgressBar({ ratio, label }: { ratio: number; label: string })`
  - `PropertyFormButton({ label, property?, counts?, variant? })`
  - `PropertyHeader({ properties, propertyId, query, actions })` — `actions` é um `React.ReactNode` com os botões (as Tasks 7 e 8 acrescentam "Novo gasto" e "Gerar plano")
  - `PropertyTabs({ query })`
  - `SummaryTab({ property, summary, nextStatus, typeName })`

- [ ] **Step 1: Componentes pequenos (selo e barra)**

```tsx
// components/property/status-badge.tsx
import { EXPENSE_STATUS_LABELS, type ExpenseStatus } from '@/lib/finance/property'
import { cn } from '@/lib/utils'

const STYLES: Record<ExpenseStatus, string> = {
  planned: 'border-border text-muted-foreground',
  paid: 'border-income/40 text-income',
  overdue: 'border-expense bg-expense/15 font-semibold text-expense',
}

/** Status sempre em texto; a cor só reforça. */
export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return <span className={cn('inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs', STYLES[status])}>{EXPENSE_STATUS_LABELS[status]}</span>
}
```

```tsx
// components/property/progress-bar.tsx
/** Barra 0–100% com o percentual exposto para leitores de tela. */
export function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const percent = Math.round(Math.min(Math.max(ratio, 0), 1) * 100)
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  )
}
```

- [ ] **Step 2: Formulário do imóvel**

```tsx
// components/property/property-form.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createProperty, deleteProperty, updateProperty } from '@/lib/actions/properties'
import {
  AMORTIZATION_LABELS,
  AMORTIZATION_SYSTEMS,
  PROPERTY_PHASE_LABELS,
  PROPERTY_PHASES,
  type AmortizationSystem,
  type PropertyPhase,
} from '@/lib/finance/property'
import type { PropertyRecord } from '@/lib/validation/property'

type Errors = Record<string, string[] | undefined>
type Counts = { expenses: number; linked: number }

/** "9,5" → 9.5; vazio → null; texto inválido → NaN (o schema recusa). */
function parseRate(text: string): number | null {
  const value = text.trim().replace(',', '.')
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : Number.NaN
}

function PropertyForm({ property, counts, onDone }: { property?: PropertyRecord; counts?: Counts; onDone: (id: string | null) => void }) {
  const [name, setName] = useState(property?.name ?? '')
  const [developer, setDeveloper] = useState(property?.developer ?? '')
  const [unit, setUnit] = useState(property?.unit ?? '')
  const [address, setAddress] = useState(property?.address ?? '')
  const [priceCents, setPriceCents] = useState(property?.purchasePriceCents ?? 0)
  const [contractDate, setContractDate] = useState(property?.contractDate ?? '')
  const [deliveryDate, setDeliveryDate] = useState(property?.expectedDeliveryDate ?? '')
  const [phase, setPhase] = useState<PropertyPhase>(property?.phase ?? 'pre_keys')
  const [bank, setBank] = useState(property?.bank ?? '')
  const [financedCents, setFinancedCents] = useState(property?.financedAmountCents ?? 0)
  const [term, setTerm] = useState(property?.termMonths?.toString() ?? '')
  const [amortization, setAmortization] = useState<AmortizationSystem | ''>(property?.amortizationSystem ?? '')
  const [rate, setRate] = useState(property?.annualInterestRate?.toString().replace('.', ',') ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()
  const err = (field: string) => errors[field]?.[0]

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const values = {
      name,
      developer,
      unit,
      address,
      purchasePriceCents: priceCents,
      contractDate: contractDate || null,
      expectedDeliveryDate: deliveryDate || null,
      phase,
      bank,
      financedAmountCents: financedCents > 0 ? financedCents : null,
      termMonths: term.trim() ? Number(term) : null,
      amortizationSystem: amortization || null,
      annualInterestRate: parseRate(rate),
    }
    startTransition(async () => {
      if (property) {
        const result = await updateProperty(property.id, values)
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {})
          toast.error(result.error)
          return
        }
        toast.success('Imóvel atualizado.')
        onDone(property.id)
        return
      }
      const result = await createProperty(values)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success('Imóvel cadastrado.')
      onDone(result.data.id)
    })
  }

  function remove() {
    if (!property) return
    const detail = counts ? ` Isto apaga ${counts.expenses} gastos e ${counts.linked} lançamentos em Lançamentos.` : ''
    if (!window.confirm(`Excluir o imóvel "${property.name}"?${detail} Não dá para desfazer.`)) return
    startTransition(async () => {
      const result = await deleteProperty(property.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Imóvel excluído.')
      onDone(null)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-2" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="property-name" label="Empreendimento" error={err('name')}>
          <Input id="property-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={Boolean(err('name'))} />
        </Field>
        <Field id="property-developer" label="Construtora" error={err('developer')}>
          <Input id="property-developer" value={developer} onChange={(e) => setDeveloper(e.target.value)} maxLength={200} />
        </Field>
        <Field id="property-unit" label="Unidade / bloco" error={err('unit')}>
          <Input id="property-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={200} />
        </Field>
        <Field id="property-address" label="Endereço" error={err('address')}>
          <Input id="property-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
        </Field>
        <Field id="property-price" label="Valor de compra" error={err('purchasePriceCents')}>
          <MoneyInput id="property-price" valueCents={priceCents} onChangeCents={setPriceCents} aria-invalid={Boolean(err('purchasePriceCents'))} />
        </Field>
        <Field id="property-phase" label="Fase atual" error={err('phase')}>
          <NativeSelect id="property-phase" value={phase} onChange={(e) => setPhase(e.target.value as PropertyPhase)}>
            {PROPERTY_PHASES.map((value) => (
              <option key={value} value={value}>
                {PROPERTY_PHASE_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="property-contract" label="Assinatura do contrato" error={err('contractDate')}>
          <Input id="property-contract" type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
        </Field>
        <Field id="property-delivery" label="Previsão das chaves" error={err('expectedDeliveryDate')}>
          <Input id="property-delivery" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </Field>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Financiamento (opcional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="property-bank" label="Banco" error={err('bank')}>
            <Input id="property-bank" value={bank} onChange={(e) => setBank(e.target.value)} maxLength={80} />
          </Field>
          <Field id="property-financed" label="Valor financiado" error={err('financedAmountCents')}>
            <MoneyInput id="property-financed" valueCents={financedCents} onChangeCents={setFinancedCents} />
          </Field>
          <Field id="property-term" label="Prazo (meses)" error={err('termMonths')}>
            <Input id="property-term" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))} aria-invalid={Boolean(err('termMonths'))} />
          </Field>
          <Field id="property-amortization" label="Sistema de amortização" error={err('amortizationSystem')}>
            <NativeSelect id="property-amortization" value={amortization} onChange={(e) => setAmortization(e.target.value as AmortizationSystem | '')}>
              <option value="">Não informado</option>
              {AMORTIZATION_SYSTEMS.map((value) => (
                <option key={value} value={value}>
                  {AMORTIZATION_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="property-rate" label="Juros (% ao ano)" error={err('annualInterestRate')}>
            <Input id="property-rate" inputMode="decimal" placeholder="9,5" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={Boolean(err('annualInterestRate'))} />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        {property ? (
          <Button type="button" variant="outline" className="text-expense" disabled={pending} onClick={remove}>
            Excluir imóvel
          </Button>
        ) : null}
      </div>
    </form>
  )
}

type PropertyFormButtonProps = {
  label: string
  property?: PropertyRecord
  counts?: Counts
  variant?: 'default' | 'outline' | 'ghost'
}

/** Botão que abre o cadastro (novo) ou a edição do imóvel. */
export function PropertyFormButton({ label, property, counts, variant = 'outline' }: PropertyFormButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={property ? 'Editar imóvel' : 'Novo imóvel'}>
        {open ? (
          <PropertyForm
            property={property}
            counts={counts}
            onDone={(id) => {
              setOpen(false)
              if (id === null) router.push('/imovel')
              else if (!property) router.push(`/imovel?imovel=${id}`)
            }}
          />
        ) : null}
      </ResponsiveModal>
    </>
  )
}
```

- [ ] **Step 3: Cabeçalho e abas**

```tsx
// components/property/property-header.tsx
'use client'

import { useRouter } from 'next/navigation'
import { NativeSelect } from '@/components/form/native-select'
import { propertyHref, type PropertyQuery } from '@/lib/property-filters'

type PropertyHeaderProps = {
  properties: { id: string; name: string }[]
  propertyId: string
  query: PropertyQuery
  actions: React.ReactNode
}

/** Nome (ou seletor, com mais de um imóvel) e os botões de ação. */
export function PropertyHeader({ properties, propertyId, query, actions }: PropertyHeaderProps) {
  const router = useRouter()
  const current = properties.find((property) => property.id === propertyId)
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {properties.length > 1 ? (
        <NativeSelect
          aria-label="Imóvel"
          className="sm:max-w-xs"
          value={propertyId}
          onChange={(event) => router.push(propertyHref(query, { propertyId: event.target.value, filters: {} }))}
        >
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <p className="min-w-0 truncate text-lg font-medium">{current?.name}</p>
      )}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}
```

```tsx
// components/property/property-tabs.tsx
import Link from 'next/link'
import { PROPERTY_TAB_LABELS, PROPERTY_TABS, propertyHref, type PropertyQuery } from '@/lib/property-filters'
import { cn } from '@/lib/utils'

export function PropertyTabs({ query }: { query: PropertyQuery }) {
  return (
    <nav aria-label="Seções do imóvel" className="mb-4 flex flex-wrap gap-1">
      {PROPERTY_TABS.map((tab) => {
        const active = tab === query.tab
        return (
          <Link
            key={tab}
            href={propertyHref(query, { tab })}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-surface-2',
            )}
          >
            {PROPERTY_TAB_LABELS[tab]}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Aba Resumo**

```tsx
// components/property/summary-tab.tsx
import { EmptyText, Panel } from '@/components/dashboard/panel'
import { formatISODateBR } from '@/lib/dates'
import {
  AMORTIZATION_LABELS,
  FUNDING_LABELS,
  FUNDING_SOURCES,
  PROPERTY_PHASE_LABELS,
  type ExpenseStatus,
  type PropertySummary,
} from '@/lib/finance/property'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import type { PropertyRecord } from '@/lib/validation/property'
import { ProgressBar } from './progress-bar'
import { ExpenseStatusBadge } from './status-badge'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold break-words tabular-nums sm:text-lg">{value}</p>
    </div>
  )
}

type SummaryTabProps = {
  property: PropertyRecord
  summary: PropertySummary
  nextStatus: ExpenseStatus | null
  typeName: (typeId: string) => string
}

export function SummaryTab({ property, summary, nextStatus, typeName }: SummaryTabProps) {
  const percent = Math.round(summary.paidRatio * 100)
  const details: [string, string | null][] = [
    ['Construtora', property.developer],
    ['Unidade', property.unit],
    ['Endereço', property.address],
    ['Fase', PROPERTY_PHASE_LABELS[property.phase]],
    ['Contrato', property.contractDate ? formatISODateBR(property.contractDate) : null],
    ['Previsão das chaves', property.expectedDeliveryDate ? formatISODateBR(property.expectedDeliveryDate) : null],
    ['Banco', property.bank],
    ['Valor financiado', property.financedAmountCents !== null ? formatBRL(property.financedAmountCents) : null],
    ['Prazo', property.termMonths !== null ? `${property.termMonths} meses` : null],
    ['Amortização', property.amortizationSystem ? AMORTIZATION_LABELS[property.amortizationSystem] : null],
    ['Juros', property.annualInterestRate !== null ? `${String(property.annualInterestRate).replace('.', ',')}% ao ano` : null],
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Valor do imóvel" value={formatBRL(summary.purchasePriceCents)} />
        <Stat label="Total previsto" value={formatBRL(summary.plannedCents)} />
        <Stat label="Total pago" value={formatBRL(summary.paidCents)} />
        <Stat label="A pagar" value={formatBRL(summary.toPayCents)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Progresso">
          <div className="space-y-2">
            <p className="flex items-baseline justify-between text-sm">
              <span>Pago</span>
              <span className="font-semibold tabular-nums">{percent}%</span>
            </p>
            <ProgressBar ratio={summary.paidRatio} label="Percentual pago" />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Correção INCC</dt>
              <dd className="tabular-nums">{formatSignedBRL(summary.inccCents)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Taxa de obra</dt>
              <dd className="tabular-nums">{formatBRL(summary.constructionInterestCents)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Por fonte">
          <ul className="space-y-2 text-sm">
            {FUNDING_SOURCES.map((source) => (
              <li key={source} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>{FUNDING_LABELS[source]}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  pago {formatBRL(summary.bySource[source].paidCents)} · a pagar {formatBRL(summary.bySource[source].toPayCents)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Próximo pagamento">
          {summary.next && nextStatus ? (
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{summary.next.description}</span>
                <ExpenseStatusBadge status={nextStatus} />
              </p>
              <p className="text-xs text-muted-foreground">
                {typeName(summary.next.expenseTypeId)} · vence {formatISODateBR(summary.next.dueDate)}
              </p>
              <p className="font-semibold tabular-nums">{formatBRL(summary.next.plannedAmountCents)}</p>
            </div>
          ) : (
            <EmptyText>Nenhum pagamento pendente.</EmptyText>
          )}
        </Panel>
      </div>

      <Panel title="Dados do imóvel">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {details
            .filter((entry): entry is [string, string] => entry[1] !== null)
            .map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
        </dl>
      </Panel>
    </div>
  )
}
```

- [ ] **Step 5: Página**

```tsx
// app/(app)/imovel/page.tsx
import type { Metadata } from 'next'
import { EmptyText } from '@/components/dashboard/panel'
import { PageHeader } from '@/components/layout/page-header'
import { PropertyFormButton } from '@/components/property/property-form'
import { PropertyHeader } from '@/components/property/property-header'
import { PropertyTabs } from '@/components/property/property-tabs'
import { SummaryTab } from '@/components/property/summary-tab'
import { todayISO } from '@/lib/dates'
import { expenseStatus, propertySummary } from '@/lib/finance/property'
import { listExpenseTypes, listProperties, listPropertyExpenses } from '@/lib/property'
import { parsePropertyQuery, type PropertyQuery } from '@/lib/property-filters'

export const metadata: Metadata = { title: 'Imóvel' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function PropertyPage({ searchParams }: Props) {
  const query = parsePropertyQuery(await searchParams)
  const today = todayISO()
  const [properties, types] = await Promise.all([listProperties(), listExpenseTypes()])

  if (properties.length === 0) {
    return (
      <>
        <PageHeader title="Imóvel" />
        <div className="space-y-4 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-muted-foreground">Cadastre o imóvel para acompanhar os gastos.</p>
          <PropertyFormButton label="Cadastrar imóvel" variant="default" />
        </div>
      </>
    )
  }

  const property = properties.find((item) => item.id === query.propertyId) ?? properties[0]
  const current: PropertyQuery = { ...query, propertyId: property.id }
  const expenses = await listPropertyExpenses(property.id)
  const typeName = new Map(types.map((type) => [type.id, type.name]))
  const summary = propertySummary(property.purchasePriceCents, expenses, new Map(types.map((type) => [type.id, type.systemKey])))
  const counts = { expenses: expenses.length, linked: expenses.filter((expense) => expense.transactionId).length }

  return (
    <>
      <PageHeader title="Imóvel" />
      <PropertyHeader
        properties={properties.map((item) => ({ id: item.id, name: item.name }))}
        propertyId={property.id}
        query={current}
        actions={
          <>
            <PropertyFormButton label="Editar imóvel" property={property} counts={counts} />
            <PropertyFormButton label="Novo imóvel" variant="ghost" />
          </>
        }
      />
      <PropertyTabs query={current} />
      {current.tab === 'resumo' ? (
        <SummaryTab
          property={property}
          summary={summary}
          nextStatus={summary.next ? expenseStatus(summary.next, today) : null}
          typeName={(id) => typeName.get(id) ?? 'Tipo removido'}
        />
      ) : (
        <EmptyText>Esta seção chega nas próximas etapas.</EmptyText>
      )}
    </>
  )
}
```

> `typeName` é uma função passada de um Server Component para outro Server Component (`SummaryTab` não é client), então é permitido.

- [ ] **Step 6: Verificar e commitar**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: sem erros; `/imovel` aparece no build.

```bash
git add components/property "app/(app)/imovel/page.tsx"
git commit -m "feat(imovel): cadastro, cabeçalho com seletor, abas e Resumo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Aba Gastos — lista, filtros, gasto e pagamento

**Files:**
- Create: `components/property/expense-form.tsx`, `components/property/payment-form.tsx`, `components/property/expenses-tab.tsx`
- Modify: `app/(app)/imovel/page.tsx` (botão "Novo gasto" e aba Gastos)

**Interfaces:**
- Consumes: Task 2 (`expenseStatus`, `correctionCents`, `isConstructorKey`, `FUNDING_SOURCES`, `FUNDING_LABELS`, `ExpenseType`), Task 4 (`ExpenseView`, `filterExpenses`, `propertyHref`, `hasExpenseFilters`, `PropertyQuery`), Task 5 actions (`createExpense`, `updateExpense`, `payExpense`, `unpayExpense`, `deleteExpenses`, `restoreExpenses`), Task 6 (`ExpenseStatusBadge`); `useTransactionFormData` (`components/transactions/form-data-context.tsx`); `activeCategories`, `buildCategoryTree` (`lib/categories.ts`); `encodeSource`, `decodeSource`, `pickDefaultSource` (`lib/transaction-mappers.ts`); `formatYearMonthLabel`, `formatYearMonthParam`, `parseYearMonth`, `formatISODateBR` (`lib/dates.ts`).
- Produces:
  - `ExpenseForm({ propertyId, types, today, expense?, onDone })`, `ExpenseFormButton({ propertyId, types, today })`
  - `PaymentForm({ expense, systemKey, today, onDone })`
  - `ExpensesTab({ propertyId, expenses, types, query, today, openExpense })`

- [ ] **Step 1: Formulário do gasto**

```tsx
// components/property/expense-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createExpense, updateExpense } from '@/lib/actions/property-expenses'
import { FUNDING_LABELS, FUNDING_SOURCES, type ExpenseType, type FundingSource } from '@/lib/finance/property'
import type { ExpenseView } from '@/lib/validation/property'

type Errors = Record<string, string[] | undefined>

type ExpenseFormProps = {
  propertyId: string
  types: ExpenseType[]
  today: string
  expense?: ExpenseView
  onDone: () => void
}

export function ExpenseForm({ propertyId, types, today, expense, onDone }: ExpenseFormProps) {
  // Tipos ativos + o tipo atual do gasto, mesmo se arquivado
  const options = types.filter((type) => !type.archived || type.id === expense?.expenseTypeId)
  const [typeId, setTypeId] = useState(expense?.expenseTypeId ?? options[0]?.id ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [payee, setPayee] = useState(expense?.payee ?? '')
  const [plannedCents, setPlannedCents] = useState(expense?.plannedAmountCents ?? 0)
  const [dueDate, setDueDate] = useState(expense?.dueDate ?? today)
  const [fundingSource, setFundingSource] = useState<FundingSource>(expense?.fundingSource ?? 'own')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()
  const err = (field: string) => errors[field]?.[0]
  const paid = expense?.status === 'paid'

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const values = { propertyId, expenseTypeId: typeId, description, payee, plannedAmountCents: plannedCents, dueDate, fundingSource, notes }
    startTransition(async () => {
      const result = expense ? await updateExpense(expense.id, values) : await createExpense(values)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success(expense ? 'Gasto atualizado.' : 'Gasto criado.')
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
      <Field id="expense-type" label="Tipo" error={err('expenseTypeId')}>
        <NativeSelect id="expense-type" value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-invalid={Boolean(err('expenseTypeId'))}>
          {options.map((type) => (
            <option key={type.id} value={type.id}>
              {type.archived ? `${type.name} (arquivado)` : type.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="expense-description" label="Descrição" error={err('description')}>
        <Input id="expense-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} aria-invalid={Boolean(err('description'))} />
      </Field>
      <Field id="expense-payee" label="Favorecido" error={err('payee')}>
        <Input id="expense-payee" value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={80} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="expense-planned" label="Valor previsto" error={err('plannedAmountCents')}>
          <MoneyInput id="expense-planned" valueCents={plannedCents} onChangeCents={setPlannedCents} aria-invalid={Boolean(err('plannedAmountCents'))} />
        </Field>
        <Field id="expense-due" label="Vencimento" error={err('dueDate')}>
          <Input id="expense-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-invalid={Boolean(err('dueDate'))} />
        </Field>
      </div>
      <Field id="expense-source" label="Fonte do recurso" error={err('fundingSource')}>
        <NativeSelect id="expense-source" value={fundingSource} disabled={paid} onChange={(e) => setFundingSource(e.target.value as FundingSource)}>
          {FUNDING_SOURCES.map((source) => (
            <option key={source} value={source}>
              {FUNDING_LABELS[source]}
            </option>
          ))}
        </NativeSelect>
        {paid ? <p className="text-xs text-muted-foreground">A fonte de um gasto pago muda em “Editar pagamento”.</p> : null}
      </Field>
      <Field id="expense-notes" label="Observação" error={err('notes')}>
        <textarea
          id="expense-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full min-w-0 rounded-lg border border-input bg-surface-2 px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

export function ExpenseFormButton({ propertyId, types, today }: { propertyId: string; types: ExpenseType[]; today: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo gasto</Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Novo gasto">
        {open ? <ExpenseForm propertyId={propertyId} types={types} today={today} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
```

- [ ] **Step 2: Formulário de pagamento**

```tsx
// components/property/payment-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { useTransactionFormData } from '@/components/transactions/form-data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { payExpense } from '@/lib/actions/property-expenses'
import { activeCategories, buildCategoryTree } from '@/lib/categories'
import { formatSignedBRL } from '@/lib/finance/money'
import { FUNDING_LABELS, FUNDING_SOURCES, isConstructorKey, type FundingSource } from '@/lib/finance/property'
import { decodeSource, encodeSource, pickDefaultSource } from '@/lib/transaction-mappers'
import type { ExpenseView } from '@/lib/validation/property'

type Errors = Record<string, string[] | undefined>

type PaymentFormProps = { expense: ExpenseView; systemKey: string | null; today: string; onDone: () => void }

export function PaymentForm({ expense, systemKey, today, onDone }: PaymentFormProps) {
  const data = useTransactionFormData()
  const accounts = data.accounts.filter((account) => !account.archived)
  const cards = data.cards.filter((card) => !card.archived)
  const expenseCategories = activeCategories(data.categories).filter((category) => category.kind === 'expense')
  const tree = buildCategoryTree(expenseCategories)
  const imovel = expenseCategories.find((category) => category.isDefault && category.parentId === null && category.name === 'Imóvel')

  const [paidCents, setPaidCents] = useState(expense.paidAmountCents ?? expense.plannedAmountCents)
  const [paidDate, setPaidDate] = useState(expense.paidDate ?? today)
  const [fundingSource, setFundingSource] = useState<FundingSource>(expense.fundingSource)
  const [launch, setLaunch] = useState(expense.status === 'paid' ? expense.transactionId !== null : true)
  const [source, setSource] = useState(
    expense.linked
      ? encodeSource({ accountId: expense.linked.accountId ?? '', creditCardId: expense.linked.creditCardId ?? '' })
      : encodeSource(pickDefaultSource(accounts, cards, data.lastAccountId, data.lastCreditCardId)),
  )
  const [categoryId, setCategoryId] = useState(expense.linked?.categoryId ?? imovel?.id ?? expenseCategories[0]?.id ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()
  const err = (field: string) => errors[field]?.[0]
  const own = fundingSource === 'own'
  const correction = isConstructorKey(systemKey) ? paidCents - expense.plannedAmountCents : 0

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const decoded = decodeSource(source)
    const target = decoded.accountId
      ? { kind: 'account' as const, id: decoded.accountId }
      : decoded.creditCardId
        ? { kind: 'card' as const, id: decoded.creditCardId }
        : null
    startTransition(async () => {
      const result = await payExpense({
        expenseId: expense.id,
        paidAmountCents: paidCents,
        paidDate,
        fundingSource,
        launch,
        source: target,
        categoryId: categoryId || null,
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success(result.data.transactionId ? 'Pagamento salvo e lançado nas finanças.' : 'Pagamento salvo.')
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="payment-amount" label="Valor pago" error={err('paidAmountCents')}>
          <MoneyInput id="payment-amount" autoFocus valueCents={paidCents} onChangeCents={setPaidCents} aria-invalid={Boolean(err('paidAmountCents'))} />
        </Field>
        <Field id="payment-date" label="Data do pagamento" error={err('paidDate')}>
          <Input id="payment-date" type="date" max={today} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} aria-invalid={Boolean(err('paidDate'))} />
        </Field>
      </div>
      {correction !== 0 ? (
        <p className="text-sm tabular-nums">
          Correção: <span className="font-medium">{formatSignedBRL(correction)}</span>
        </p>
      ) : null}
      <Field id="payment-source-kind" label="Fonte do recurso" error={err('fundingSource')}>
        <NativeSelect id="payment-source-kind" value={fundingSource} onChange={(e) => setFundingSource(e.target.value as FundingSource)}>
          {FUNDING_SOURCES.map((value) => (
            <option key={value} value={value}>
              {FUNDING_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {own ? (
        <div className="space-y-4 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={launch} onChange={(e) => setLaunch(e.target.checked)} className="size-4 accent-primary" />
            Lançar nas finanças
          </label>
          {launch ? (
            <>
              <Field id="payment-from" label="Pagar com" error={err('source')}>
                <NativeSelect id="payment-from" value={source} onChange={(e) => setSource(e.target.value)} aria-invalid={Boolean(err('source'))}>
                  <option value="">Escolha</option>
                  {accounts.length > 0 ? (
                    <optgroup label="Contas">
                      {accounts.map((account) => (
                        <option key={account.id} value={encodeSource({ accountId: account.id, creditCardId: '' })}>
                          {account.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {cards.length > 0 ? (
                    <optgroup label="Cartões">
                      {cards.map((card) => (
                        <option key={card.id} value={encodeSource({ accountId: '', creditCardId: card.id })}>
                          {card.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </NativeSelect>
              </Field>
              <Field id="payment-category" label="Categoria" error={err('categoryId')}>
                <NativeSelect id="payment-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={Boolean(err('categoryId'))}>
                  {tree.flatMap((node) => [
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>,
                    ...node.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {`— ${child.name}`}
                      </option>
                    )),
                  ])}
                </NativeSelect>
              </Field>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Sem lançamento: o pagamento fica só no Imóvel.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">FGTS e financiamento não geram lançamento: o dinheiro não passa pelas contas.</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar pagamento'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Aba Gastos**

```tsx
// components/property/expenses-tab.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { EmptyText } from '@/components/dashboard/panel'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteExpenses, restoreExpenses, unpayExpense } from '@/lib/actions/property-expenses'
import { formatISODateBR, formatYearMonthLabel, formatYearMonthParam, parseYearMonth, yearMonthOfISO } from '@/lib/dates'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import {
  correctionCents,
  EXPENSE_STATUS_LABELS,
  expenseStatus,
  FUNDING_LABELS,
  FUNDING_SOURCES,
  type ExpenseStatus,
  type ExpenseType,
  type FundingSource,
} from '@/lib/finance/property'
import { hasExpenseFilters, propertyHref, type ExpenseFilters, type PropertyQuery } from '@/lib/property-filters'
import type { ExpenseView } from '@/lib/validation/property'
import { ExpenseForm } from './expense-form'
import { PaymentForm } from './payment-form'
import { ExpenseStatusBadge } from './status-badge'

type ExpensesTabProps = {
  propertyId: string
  expenses: ExpenseView[]
  types: ExpenseType[]
  query: PropertyQuery
  today: string
  openExpense: ExpenseView | null
}

type Mode = 'view' | 'edit' | 'pay'

function groupByDueMonth(expenses: ExpenseView[]) {
  const groups: { key: string; items: ExpenseView[] }[] = []
  for (const expense of expenses) {
    const key = expense.dueDate.slice(0, 7)
    const last = groups.at(-1)
    if (last && last.key === key) last.items.push(expense)
    else groups.push({ key, items: [expense] })
  }
  return groups
}

export function ExpensesTab({ propertyId, expenses, types, query, today, openExpense }: ExpensesTabProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<ExpenseView | null>(openExpense)
  const [mode, setMode] = useState<Mode>('view')
  const [pending, startTransition] = useTransition()
  const typeById = new Map(types.map((type) => [type.id, type]))
  const { filters } = query

  const setFilters = (patch: ExpenseFilters) => router.replace(propertyHref(query, { filters: { ...filters, ...patch } }))
  const close = () => {
    setSelected(null)
    setMode('view')
  }

  function remove(expense: ExpenseView) {
    const extra = expense.transactionId ? ' O lançamento em Lançamentos também será excluído.' : ''
    if (!window.confirm(`Excluir "${expense.description}"?${extra}`)) return
    startTransition(async () => {
      const result = await deleteExpenses([expense.id])
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      close()
      toast('Gasto excluído.', {
        action: {
          label: 'Desfazer',
          onClick: async () => {
            const restored = await restoreExpenses(result.data)
            if (restored.ok) toast.success('Gasto restaurado.')
            else toast.error(restored.error)
          },
        },
      })
    })
  }

  function unpay(expense: ExpenseView) {
    if (expense.transactionId && !window.confirm('Desmarcar o pagamento apaga o lançamento em Lançamentos. Continuar?')) return
    startTransition(async () => {
      const result = await unpayExpense(expense.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('O gasto voltou para previsto.')
      close()
    })
  }

  const selectedStatus = selected ? expenseStatus(selected, today) : null
  const selectedKey = selected ? (typeById.get(selected.expenseTypeId)?.systemKey ?? null) : null

  return (
    <>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <NativeSelect aria-label="Tipo" value={filters.typeId ?? ''} onChange={(e) => setFilters({ typeId: e.target.value || undefined })}>
          <option value="">Todos os tipos</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Status"
          value={filters.status ?? ''}
          onChange={(e) => setFilters({ status: (e.target.value || undefined) as ExpenseStatus | undefined })}
        >
          <option value="">Todos os status</option>
          {(['planned', 'overdue', 'paid'] as const).map((status) => (
            <option key={status} value={status}>
              {EXPENSE_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Fonte"
          value={filters.source ?? ''}
          onChange={(e) => setFilters({ source: (e.target.value || undefined) as FundingSource | undefined })}
        >
          <option value="">Todas as fontes</option>
          {FUNDING_SOURCES.map((source) => (
            <option key={source} value={source}>
              {FUNDING_LABELS[source]}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="month"
          aria-label="Vencimento de"
          value={filters.from ? formatYearMonthParam(filters.from) : ''}
          onChange={(e) => setFilters({ from: parseYearMonth(e.target.value) ?? undefined })}
        />
        <Input
          type="month"
          aria-label="Vencimento até"
          value={filters.to ? formatYearMonthParam(filters.to) : ''}
          onChange={(e) => setFilters({ to: parseYearMonth(e.target.value) ?? undefined })}
        />
        <Button variant="ghost" disabled={!hasExpenseFilters(filters)} onClick={() => router.replace(propertyHref(query, { filters: {} }))}>
          Limpar
        </Button>
      </div>

      {expenses.length === 0 ? (
        <EmptyText>{hasExpenseFilters(filters) ? 'Nenhum gasto com estes filtros.' : 'Nenhum gasto cadastrado. Use “Novo gasto” ou “Gerar plano”.'}</EmptyText>
      ) : (
        <div className="space-y-4">
          {groupByDueMonth(expenses).map((group) => (
            <section key={group.key} className="rounded-xl border border-border bg-surface p-2">
              <h2 className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">{formatYearMonthLabel(yearMonthOfISO(`${group.key}-01`))}</h2>
              <ul>
                {group.items.map((expense) => {
                  const status = expenseStatus(expense, today)
                  const type = typeById.get(expense.expenseTypeId)
                  const correction = correctionCents(expense, type?.systemKey ?? null)
                  const subtitle = [type?.name, expense.payee, `vence ${formatISODateBR(expense.dueDate)}`, FUNDING_LABELS[expense.fundingSource]]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <li key={expense.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(expense)
                          setMode('view')
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{expense.description}</span>
                          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-medium tabular-nums">
                            {formatBRL(expense.status === 'paid' ? (expense.paidAmountCents ?? 0) : expense.plannedAmountCents)}
                          </span>
                          <span className="flex items-center gap-1">
                            {correction !== 0 ? <span className="text-xs text-muted-foreground tabular-nums">INCC {formatSignedBRL(correction)}</span> : null}
                            <ExpenseStatusBadge status={status} />
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ResponsiveModal
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title={mode === 'edit' ? 'Editar gasto' : mode === 'pay' ? (selected?.status === 'paid' ? 'Editar pagamento' : 'Pagar') : (selected?.description ?? 'Gasto')}
      >
        {selected && mode === 'edit' ? (
          <ExpenseForm propertyId={propertyId} types={types} today={today} expense={selected} onDone={close} />
        ) : null}
        {selected && mode === 'pay' ? <PaymentForm expense={selected} systemKey={selectedKey} today={today} onDone={close} /> : null}
        {selected && mode === 'view' && selectedStatus ? (
          <div className="space-y-4 pb-2">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="col-span-2 flex items-center gap-2">
                <dt className="sr-only">Status</dt>
                <dd>
                  <ExpenseStatusBadge status={selectedStatus} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Tipo</dt>
                <dd className="break-words">{typeById.get(selected.expenseTypeId)?.name ?? '—'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Favorecido</dt>
                <dd className="break-words">{selected.payee ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vencimento</dt>
                <dd>{formatISODateBR(selected.dueDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Previsto</dt>
                <dd className="tabular-nums">{formatBRL(selected.plannedAmountCents)}</dd>
              </div>
              {selected.status === 'paid' ? (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">Pago</dt>
                    <dd className="tabular-nums">
                      {formatBRL(selected.paidAmountCents ?? 0)} em {formatISODateBR(selected.paidDate ?? selected.dueDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Correção</dt>
                    <dd className="tabular-nums">{formatSignedBRL(correctionCents(selected, selectedKey))}</dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Fonte</dt>
                <dd>{FUNDING_LABELS[selected.fundingSource]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Nas finanças</dt>
                <dd>{selected.transactionId ? 'Lançado' : 'Não lançado'}</dd>
              </div>
              {selected.notes ? (
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-muted-foreground">Observação</dt>
                  <dd className="break-words">{selected.notes}</dd>
                </div>
              ) : null}
            </dl>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => setMode('pay')} disabled={pending}>
                {selected.status === 'paid' ? 'Editar pagamento' : 'Pagar'}
              </Button>
              <Button variant="outline" onClick={() => setMode('edit')} disabled={pending}>
                Editar
              </Button>
              {selected.status === 'paid' ? (
                <Button variant="outline" onClick={() => unpay(selected)} disabled={pending}>
                  Desmarcar pagamento
                </Button>
              ) : null}
              <Button variant="outline" className="text-expense" onClick={() => remove(selected)} disabled={pending}>
                Excluir
              </Button>
            </div>
          </div>
        ) : null}
      </ResponsiveModal>
    </>
  )
}
```

- [ ] **Step 4: Ligar na página**

Em `app/(app)/imovel/page.tsx`:
- importar `ExpenseFormButton` de `@/components/property/expense-form`, `ExpensesTab` de `@/components/property/expenses-tab` e `filterExpenses` de `@/lib/property-filters`;
- em `actions`, antes de "Editar imóvel": `<ExpenseFormButton propertyId={property.id} types={types} today={today} />`;
- trocar o bloco das abas por:

```tsx
      {current.tab === 'resumo' ? (
        <SummaryTab
          property={property}
          summary={summary}
          nextStatus={summary.next ? expenseStatus(summary.next, today) : null}
          typeName={(id) => typeName.get(id) ?? 'Tipo removido'}
        />
      ) : current.tab === 'gastos' ? (
        <ExpensesTab
          propertyId={property.id}
          expenses={filterExpenses(expenses, current.filters, today)}
          types={types}
          query={current}
          today={today}
          openExpense={current.expenseId ? (expenses.find((expense) => expense.id === current.expenseId) ?? null) : null}
        />
      ) : (
        <EmptyText>Esta seção chega nas próximas etapas.</EmptyText>
      )}
```

- [ ] **Step 5: Verificar e commitar**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: sem erros.

Manual (`npm run dev`, logado): criar imóvel; "Novo gasto"; pagar com recursos próprios numa conta (aparece em Lançamentos); editar o pagamento para FGTS (o lançamento some); desmarcar; excluir e "Desfazer"; filtros mudam a URL.

```bash
git add components/property "app/(app)/imovel/page.tsx"
git commit -m "feat(imovel): aba Gastos com filtros, gasto, pagamento (com lançamento) e Desfazer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Gerador do plano, Cronograma e Por tipo

**Files:**
- Create: `components/property/plan-form.tsx`, `components/property/schedule-tab.tsx`, `components/property/types-tab.tsx`
- Modify: `app/(app)/imovel/page.tsx` (botão "Gerar plano" e as duas abas)

**Interfaces:**
- Consumes: Task 3 (`buildPaymentPlan`, `planPreview`, `PLAN_BLOCK_LABELS`), Task 2 (`propertySchedule`, `totalsByType`, `ScheduleMonth`, `TypeTotal`, `FUNDING_LABELS`, `FUNDING_SOURCES`), Task 5 (`generatePlan`, `deleteExpenses`), Task 6 (`ProgressBar`); `Panel`, `EmptyText`.
- Produces: `PlanFormButton({ propertyId, today })`, `ScheduleTab({ months })`, `TypesTab({ totals })`.

- [ ] **Step 1: Gerador**

```tsx
// components/property/plan-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { MoneyInput } from '@/components/form/money-input'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteExpenses, generatePlan } from '@/lib/actions/property-expenses'
import { formatISODateBR } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import { FUNDING_LABELS, FUNDING_SOURCES, type FundingSource } from '@/lib/finance/property'
import { buildPaymentPlan, PLAN_BLOCK_LABELS, planPreview, type PaymentPlanInput } from '@/lib/finance/property-plan'

const toCount = (text: string) => (text.trim() ? Number(text) : 0)

function PlanForm({ propertyId, today, onDone }: { propertyId: string; today: string; onDone: () => void }) {
  const [fundingSource, setFundingSource] = useState<FundingSource>('own')
  const [monthlyOn, setMonthlyOn] = useState(true)
  const [monthlyCents, setMonthlyCents] = useState(0)
  const [monthlyCount, setMonthlyCount] = useState('36')
  const [monthlyFirst, setMonthlyFirst] = useState(today)
  const [intermediateOn, setIntermediateOn] = useState(false)
  const [intermediateCents, setIntermediateCents] = useState(0)
  const [intermediateCount, setIntermediateCount] = useState('6')
  const [intermediateFirst, setIntermediateFirst] = useState(today)
  const [everyMonths, setEveryMonths] = useState<6 | 12>(6)
  const [keysOn, setKeysOn] = useState(false)
  const [keysCents, setKeysCents] = useState(0)
  const [keysDate, setKeysDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const input: PaymentPlanInput = {
    fundingSource,
    monthly: monthlyOn ? { amountCents: monthlyCents, count: toCount(monthlyCount), firstDueDate: monthlyFirst } : null,
    intermediate: intermediateOn
      ? { amountCents: intermediateCents, count: toCount(intermediateCount), firstDueDate: intermediateFirst, everyMonths }
      : null,
    keys: keysOn ? { amountCents: keysCents, dueDate: keysDate } : null,
  }

  // Prévia só com blocos completos e dentro dos limites (evita laço enorme enquanto digita)
  const previewInput: PaymentPlanInput = {
    fundingSource,
    monthly:
      input.monthly && input.monthly.amountCents > 0 && input.monthly.count >= 1 && input.monthly.count <= 360 && input.monthly.firstDueDate
        ? input.monthly
        : null,
    intermediate:
      input.intermediate &&
      input.intermediate.amountCents > 0 &&
      input.intermediate.count >= 1 &&
      input.intermediate.count <= 60 &&
      input.intermediate.firstDueDate
        ? input.intermediate
        : null,
    keys: input.keys && input.keys.amountCents > 0 && input.keys.dueDate ? input.keys : null,
  }
  const preview = planPreview(buildPaymentPlan(previewInput))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await generatePlan({ propertyId, ...input })
      if (!result.ok) {
        setError(Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.error)
        toast.error(result.error)
        return
      }
      const ids = result.data.ids
      toast(`${ids.length} gastos criados.`, {
        action: {
          label: 'Desfazer',
          onClick: async () => {
            const undone = await deleteExpenses(ids)
            if (undone.ok) toast.success('Plano desfeito.')
            else toast.error(undone.error)
          },
        },
      })
      onDone()
    })
  }

  const blockClass = 'space-y-3 rounded-lg border border-border p-3'
  const toggleClass = 'flex items-center gap-2 text-sm font-medium'

  return (
    <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
      <Field id="plan-source" label="Fonte do recurso">
        <NativeSelect id="plan-source" value={fundingSource} onChange={(e) => setFundingSource(e.target.value as FundingSource)}>
          {FUNDING_SOURCES.map((source) => (
            <option key={source} value={source}>
              {FUNDING_LABELS[source]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <fieldset className={blockClass}>
        <legend className="sr-only">Mensais</legend>
        <label className={toggleClass}>
          <input type="checkbox" checked={monthlyOn} onChange={(e) => setMonthlyOn(e.target.checked)} className="size-4 accent-primary" />
          Mensais
        </label>
        {monthlyOn ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="plan-monthly-amount" label="Valor">
              <MoneyInput id="plan-monthly-amount" valueCents={monthlyCents} onChangeCents={setMonthlyCents} />
            </Field>
            <Field id="plan-monthly-count" label="Quantidade">
              <Input id="plan-monthly-count" inputMode="numeric" value={monthlyCount} onChange={(e) => setMonthlyCount(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field id="plan-monthly-first" label="1º vencimento">
              <Input id="plan-monthly-first" type="date" value={monthlyFirst} onChange={(e) => setMonthlyFirst(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={blockClass}>
        <legend className="sr-only">Intermediárias</legend>
        <label className={toggleClass}>
          <input type="checkbox" checked={intermediateOn} onChange={(e) => setIntermediateOn(e.target.checked)} className="size-4 accent-primary" />
          Intermediárias (balões)
        </label>
        {intermediateOn ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="plan-intermediate-amount" label="Valor">
              <MoneyInput id="plan-intermediate-amount" valueCents={intermediateCents} onChangeCents={setIntermediateCents} />
            </Field>
            <Field id="plan-intermediate-count" label="Quantidade">
              <Input
                id="plan-intermediate-count"
                inputMode="numeric"
                value={intermediateCount}
                onChange={(e) => setIntermediateCount(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field id="plan-intermediate-first" label="1º vencimento">
              <Input id="plan-intermediate-first" type="date" value={intermediateFirst} onChange={(e) => setIntermediateFirst(e.target.value)} />
            </Field>
            <Field id="plan-intermediate-every" label="Intervalo">
              <NativeSelect id="plan-intermediate-every" value={everyMonths} onChange={(e) => setEveryMonths(Number(e.target.value) as 6 | 12)}>
                <option value={6}>A cada 6 meses</option>
                <option value={12}>A cada 12 meses</option>
              </NativeSelect>
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={blockClass}>
        <legend className="sr-only">Chaves</legend>
        <label className={toggleClass}>
          <input type="checkbox" checked={keysOn} onChange={(e) => setKeysOn(e.target.checked)} className="size-4 accent-primary" />
          Parcela das chaves
        </label>
        {keysOn ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="plan-keys-amount" label="Valor">
              <MoneyInput id="plan-keys-amount" valueCents={keysCents} onChangeCents={setKeysCents} />
            </Field>
            <Field id="plan-keys-date" label="Vencimento">
              <Input id="plan-keys-date" type="date" value={keysDate} onChange={(e) => setKeysDate(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <div className="rounded-lg bg-surface-2 p-3 text-sm" aria-live="polite">
        {preview.count === 0 ? (
          <p className="text-muted-foreground">Preencha ao menos um bloco para ver a prévia.</p>
        ) : (
          <ul className="space-y-1">
            {preview.blocks.map((block) => (
              <li key={block.systemKey} className="tabular-nums">
                <span className="font-medium">{PLAN_BLOCK_LABELS[block.systemKey]}:</span> {block.count}× de{' '}
                {formatISODateBR(block.firstDate)}
                {block.count > 1 ? ` a ${formatISODateBR(block.lastDate)}` : ''} · {formatBRL(block.totalCents)}
              </li>
            ))}
            <li className="pt-1 font-semibold tabular-nums">
              Total: {preview.count} gastos · {formatBRL(preview.totalCents)}
            </li>
          </ul>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending || preview.count === 0}>
        {pending ? 'Gerando…' : 'Gerar'}
      </Button>
    </form>
  )
}

export function PlanFormButton({ propertyId, today }: { propertyId: string; today: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Gerar plano
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Gerar plano de pagamento">
        {open ? <PlanForm propertyId={propertyId} today={today} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
```

- [ ] **Step 2: Cronograma e Por tipo**

```tsx
// components/property/schedule-tab.tsx
import { KeyRound } from 'lucide-react'
import { EmptyText } from '@/components/dashboard/panel'
import { formatYearMonthLabel } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import type { ScheduleMonth } from '@/lib/finance/property'
import { cn } from '@/lib/utils'

/** Linha do tempo por mês, agrupada por ano: previsto (claro) e realizado (cheio) na mesma escala. */
export function ScheduleTab({ months }: { months: ScheduleMonth[] }) {
  if (months.length === 0) return <EmptyText>Nenhum gasto cadastrado.</EmptyText>
  const max = Math.max(1, ...months.map((month) => Math.max(month.plannedCents, month.paidCents)))
  const years: { year: number; months: ScheduleMonth[] }[] = []
  for (const month of months) {
    const last = years.at(-1)
    if (last && last.year === month.ym.year) last.months.push(month)
    else years.push({ year: month.ym.year, months: [month] })
  }

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1.5 w-3 rounded-full bg-primary/40" /> Previsto
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1.5 w-3 rounded-full bg-income" /> Pago
        </span>
      </p>
      {years.map((group) => (
        <section key={group.year} aria-label={String(group.year)} className="rounded-xl border border-border bg-surface p-2">
          <h2 className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">{group.year}</h2>
          <ol className="space-y-1">
            {group.months.map((month) => (
              <li key={month.key} className={cn('rounded-lg px-2 py-2', month.isCurrent && 'bg-surface-2 ring-1 ring-primary/40')}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="font-medium">
                    {formatYearMonthLabel(month.ym)}
                    {month.isCurrent ? <span className="ml-1 text-xs font-normal text-primary">(este mês)</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    previsto {formatBRL(month.plannedCents)} · pago {formatBRL(month.paidCents)}
                  </span>
                </div>
                <div aria-hidden className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary/40" style={{ width: `${(month.plannedCents / max) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-income" style={{ width: `${(month.paidCents / max) * 100}%` }} />
                </div>
                {month.isDelivery ? (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
                    <KeyRound className="size-3.5" aria-hidden />
                    Entrega das chaves
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
```

```tsx
// components/property/types-tab.tsx
import { EmptyText } from '@/components/dashboard/panel'
import { formatBRL } from '@/lib/finance/money'
import type { TypeTotal } from '@/lib/finance/property'
import { ProgressBar } from './progress-bar'

export function TypesTab({ totals }: { totals: TypeTotal[] }) {
  if (totals.length === 0) return <EmptyText>Nenhum gasto cadastrado.</EmptyText>
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {totals.map((total) => {
        const ratio = total.plannedCents > 0 ? total.paidCents / total.plannedCents : total.paidCents > 0 ? 1 : 0
        return (
          <li key={total.typeId} className="space-y-2 rounded-xl border border-border bg-surface p-3">
            <p className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{total.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {total.count} {total.count === 1 ? 'gasto' : 'gastos'}
              </span>
            </p>
            <ProgressBar ratio={ratio} label={`Pago de ${total.name}`} />
            <p className="text-xs text-muted-foreground tabular-nums">
              pago {formatBRL(total.paidCents)} de {formatBRL(total.plannedCents)} previstos
            </p>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 3: Ligar na página**

Em `app/(app)/imovel/page.tsx`:
- importar `PlanFormButton`, `ScheduleTab`, `TypesTab` e `propertySchedule`, `totalsByType` (de `@/lib/finance/property`);
- em `actions`, depois de `ExpenseFormButton`: `<PlanFormButton propertyId={property.id} today={today} />`;
- trocar o `<EmptyText>Esta seção chega nas próximas etapas.</EmptyText>` final por:

```tsx
      ) : current.tab === 'cronograma' ? (
        <ScheduleTab months={propertySchedule(expenses, property.expectedDeliveryDate, today)} />
      ) : (
        <TypesTab totals={totalsByType(expenses, types)} />
      )}
```

e remover o import de `EmptyText` se ficar sem uso.

- [ ] **Step 4: Verificar e commitar**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: sem erros.

Manual: "Gerar plano" com 36 mensais + 6 intermediárias + chaves mostra a prévia e cria 43 gastos; "Desfazer" apaga todos; Cronograma mostra os meses até as chaves; Por tipo mostra os totais.

```bash
git add components/property "app/(app)/imovel/page.tsx"
git commit -m "feat(imovel): gerador do plano com prévia e Desfazer, cronograma e totais por tipo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tipos de gasto em Configurações

**Files:**
- Create: `app/(app)/configuracoes/tipos-de-gasto/page.tsx`, `components/property/expense-type-form.tsx`, `components/property/expense-type-archive-button.tsx`
- Modify: `app/(app)/configuracoes/page.tsx` (card com o link)

**Interfaces:**
- Consumes: Task 5 (`listExpenseTypes`, `createExpenseType`, `updateExpenseType`, `setExpenseTypeArchived`), Task 2 (`TYPICAL_PHASES`, `TYPICAL_PHASE_LABELS`, `ExpenseType`, `TypicalPhase`).
- Produces: tela `/configuracoes/tipos-de-gasto`.

- [ ] **Step 1: Formulário e botão de arquivar**

```tsx
// components/property/expense-type-form.tsx
'use client'

import { Pencil } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createExpenseType, updateExpenseType } from '@/lib/actions/property-types'
import { TYPICAL_PHASE_LABELS, TYPICAL_PHASES, type ExpenseType, type TypicalPhase } from '@/lib/finance/property'

type Errors = Record<string, string[] | undefined>

function ExpenseTypeForm({ type, onDone }: { type?: ExpenseType; onDone: () => void }) {
  const [name, setName] = useState(type?.name ?? '')
  const [phase, setPhase] = useState<TypicalPhase>(type?.typicalPhase ?? 'any')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const values = { name, typicalPhase: phase }
    startTransition(async () => {
      const result = type ? await updateExpenseType(type.id, values) : await createExpenseType(values)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success(type ? 'Tipo atualizado.' : 'Tipo criado.')
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
      <Field id="type-name" label="Nome" error={errors.name?.[0]}>
        <Input id="type-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-invalid={Boolean(errors.name)} />
      </Field>
      <Field id="type-phase" label="Fase típica" error={errors.typicalPhase?.[0]}>
        <NativeSelect id="type-phase" value={phase} onChange={(e) => setPhase(e.target.value as TypicalPhase)}>
          {TYPICAL_PHASES.map((value) => (
            <option key={value} value={value}>
              {TYPICAL_PHASE_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

/** Sem `type`: botão "Novo tipo". Com `type`: ícone de editar. */
export function ExpenseTypeFormButton({ type }: { type?: ExpenseType }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {type ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Editar ${type.name}`}>
          <Pencil aria-hidden />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>Novo tipo</Button>
      )}
      <ResponsiveModal open={open} onOpenChange={setOpen} title={type ? 'Editar tipo de gasto' : 'Novo tipo de gasto'}>
        {open ? <ExpenseTypeForm type={type} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
```

```tsx
// components/property/expense-type-archive-button.tsx
'use client'

import { Archive, ArchiveRestore } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { setExpenseTypeArchived } from '@/lib/actions/property-types'

export function ExpenseTypeArchiveButton({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const [pending, startTransition] = useTransition()
  function toggle() {
    startTransition(async () => {
      const result = await setExpenseTypeArchived(id, !archived)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(archived ? 'Tipo reativado.' : 'Tipo arquivado.')
    })
  }
  return (
    <Button variant="ghost" size="icon" onClick={toggle} disabled={pending} aria-label={archived ? `Reativar ${name}` : `Arquivar ${name}`}>
      {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
    </Button>
  )
}
```

- [ ] **Step 2: Página e link em Configurações**

```tsx
// app/(app)/configuracoes/tipos-de-gasto/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { ExpenseTypeArchiveButton } from '@/components/property/expense-type-archive-button'
import { ExpenseTypeFormButton } from '@/components/property/expense-type-form'
import { TYPICAL_PHASE_LABELS, type ExpenseType } from '@/lib/finance/property'
import { listExpenseTypes } from '@/lib/property'

export const metadata: Metadata = { title: 'Tipos de gasto do imóvel' }

function TypeRow({ type }: { type: ExpenseType }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate">{type.name}</span>
        <span className="block text-xs text-muted-foreground">
          {TYPICAL_PHASE_LABELS[type.typicalPhase]}
          {type.isDefault ? ' · padrão' : ''}
        </span>
      </span>
      <ExpenseTypeFormButton type={type} />
      <ExpenseTypeArchiveButton id={type.id} name={type.name} archived={type.archived} />
    </li>
  )
}

export default async function ExpenseTypesPage() {
  const types = await listExpenseTypes()
  const active = types.filter((type) => !type.archived)
  const archived = types.filter((type) => type.archived)

  return (
    <>
      <div className="mb-2">
        <Link href="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ Configurações
        </Link>
      </div>
      <PageHeader title="Tipos de gasto do imóvel" />
      <div className="mb-4">
        <ExpenseTypeFormButton />
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
        {active.map((type) => (
          <TypeRow key={type.id} type={type} />
        ))}
      </ul>
      {archived.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground">Arquivados ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface px-4">
            {archived.map((type) => (
              <TypeRow key={type.id} type={type} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}
```

Em `app/(app)/configuracoes/page.tsx`: trocar o import de ícones por `import { Building2, LogOut, Tags } from 'lucide-react'` e, logo depois do `<Card>` de Categorias, acrescentar:

```tsx
        <Card>
          <CardHeader>
            <CardTitle>Tipos de gasto do imóvel</CardTitle>
            <CardDescription>Sinal, parcelas, ITBI, cartório e os demais tipos usados no Imóvel.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/configuracoes/tipos-de-gasto">
                <Building2 className="size-4" aria-hidden />
                Gerenciar tipos
              </Link>
            </Button>
          </CardContent>
        </Card>
```

- [ ] **Step 3: Verificar e commitar**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: sem erros; rota `/configuracoes/tipos-de-gasto` no build.

```bash
git add "app/(app)/configuracoes" components/property/expense-type-form.tsx components/property/expense-type-archive-button.tsx
git commit -m "feat(imovel): tipos de gasto em Configurações (criar, renomear, fase típica, arquivar)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Integração com Lançamentos e card no Início

**Files:**
- Create: `components/transactions/property-transaction-modal.tsx`, `app/(app)/imovel/lancamento/[id]/page.tsx`, `components/dashboard/property-panel.tsx`
- Modify: `lib/transaction-mappers.ts` (coluna `source`), `components/transactions/transaction-item.tsx`, `components/transactions/transaction-list.tsx`, `components/cards/invoice-transactions.tsx`, `components/accounts/statement-list.tsx`, `app/(app)/inicio/page.tsx`, e os fixtures de `TransactionRow` em testes (`lib/finance/csv.test.ts`, `lib/transaction-mappers.test.ts` e qualquer outro que o `tsc` apontar)

**Interfaces:**
- Consumes: Task 5 (`deleteLinkedTransaction`, `findExpenseByTransaction`, `getPropertyCard`, `PropertyCard`), Task 6 (`ExpenseStatusBadge`, `ProgressBar`); `Panel` (`components/dashboard/panel.tsx`).
- Produces: `type TransactionSource = 'manual' | 'recurrence' | 'property' | 'import'`; `TransactionRow.source`; `PropertyTransactionModal({ row, sourceLabel, categoryName, onClose })`; rota `/imovel/lancamento/[id]`; `PropertyPanel({ card })`.

- [ ] **Step 1: `source` nas linhas de lançamento**

Em `lib/transaction-mappers.ts`:

```ts
export type TransactionSource = 'manual' | 'recurrence' | 'property' | 'import'
```

acrescentar `, source` ao fim de `TRANSACTION_COLUMNS` (depois de `recurrences(frequency)`) e o campo em `TransactionRow`, depois de `recurrences`:

```ts
  /** De onde veio: 'property' é o lançamento ligado a um gasto do Imóvel (só leitura em Lançamentos). */
  source: TransactionSource
```

Run: `npx tsc --noEmit`
Expected: erros só nos fixtures de teste que montam `TransactionRow` (ex.: `lib/finance/csv.test.ts` `base`, `lib/transaction-mappers.test.ts` `row`). Em cada um, acrescente `source: 'manual'`. Rode `npx tsc --noEmit` de novo até zerar e `npm test` (tudo passa).

- [ ] **Step 2: Ícone e selo nas listas**

Em `components/transactions/transaction-item.tsx`: importar `Building2` de `lucide-react`; no `subtitle`, acrescentar o selo antes do `'previsto'`:

```ts
  const subtitle = [neutral ? null : category?.name, sourceLabel, row.source === 'property' ? 'Imóvel' : null, row.status === 'pending' ? 'previsto' : null]
    .filter(Boolean)
    .join(' · ')
```

e, logo depois do bloco do ícone `Repeat` (dentro do mesmo `<span className="flex min-w-0 items-center gap-1 font-medium">`):

```tsx
          {row.source === 'property' ? (
            <>
              <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">(imóvel)</span>
            </>
          ) : null}
```

Em `components/accounts/statement-list.tsx`: importar `Building2` e, depois do bloco do `Repeat` no título, o mesmo trecho acima.

- [ ] **Step 3: Visão só leitura do lançamento ligado**

```tsx
// components/transactions/property-transaction-modal.tsx
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { deleteLinkedTransaction } from '@/lib/actions/property-expenses'
import { formatISODateBR } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import type { TransactionRow } from '@/lib/transaction-mappers'

type PropertyTransactionModalProps = {
  row: TransactionRow | null
  sourceLabel: string
  categoryName: string | undefined
  onClose: () => void
}

/** Lançamento ligado a um gasto do Imóvel: só leitura; edição pelo Imóvel; excluir volta o gasto para previsto. */
export function PropertyTransactionModal({ row, sourceLabel, categoryName, onClose }: PropertyTransactionModalProps) {
  const [pending, startTransition] = useTransition()

  function remove() {
    if (!row) return
    if (!window.confirm('Excluir este lançamento? Isto volta o gasto do imóvel para previsto.')) return
    startTransition(async () => {
      const result = await deleteLinkedTransaction(row.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Lançamento excluído. O gasto do imóvel voltou para previsto.')
      onClose()
    })
  }

  return (
    <ResponsiveModal
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Lançamento do Imóvel"
    >
      {row ? (
        <div className="space-y-4 pb-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="col-span-2 min-w-0">
              <dt className="text-xs text-muted-foreground">Descrição</dt>
              <dd className="break-words">{row.description}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Valor</dt>
              <dd className="tabular-nums">{formatBRL(row.amount_cents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Data</dt>
              <dd>{formatISODateBR(row.date)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Pago com</dt>
              <dd className="break-words">{sourceLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Categoria</dt>
              <dd className="break-words">{categoryName ?? '—'}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">Este lançamento vem de um gasto do Imóvel. Valor, data, conta e categoria mudam pelo Imóvel.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild>
              <Link href={`/imovel/lancamento/${row.id}`} onClick={onClose}>
                Editar no Imóvel
              </Link>
            </Button>
            <Button variant="outline" className="text-expense" onClick={remove} disabled={pending}>
              Excluir
            </Button>
          </div>
        </div>
      ) : null}
    </ResponsiveModal>
  )
}
```

Em `components/transactions/transaction-list.tsx`:
- importar `PropertyTransactionModal`;
- `const [viewing, setViewing] = useState<TransactionRow | null>(null)`;
- no começo de `open(row)`: `if (row.source === 'property') { setViewing(row); return }`;
- depois do `<TransactionModal … />`:

```tsx
      <PropertyTransactionModal
        row={viewing}
        sourceLabel={viewing ? labelFor(viewing) : ''}
        categoryName={viewing?.category_id ? categoryById.get(viewing.category_id)?.name : undefined}
        onClose={() => setViewing(null)}
      />
```

Em `components/cards/invoice-transactions.tsx`:
- importar `PropertyTransactionModal`;
- `const [viewing, setViewing] = useState<TransactionRow | null>(null)`;
- nas compras, `onClick={() => (row.source === 'property' ? setViewing(row) : setEditing(row))}`;
- depois do `<TransactionModal … />`:

```tsx
      <PropertyTransactionModal
        row={viewing}
        sourceLabel="Cartão desta fatura"
        categoryName={viewing?.category_id ? categoryById.get(viewing.category_id)?.name : undefined}
        onClose={() => setViewing(null)}
      />
```

- [ ] **Step 4: "Editar no Imóvel" (redireciona para o gasto)**

Ler `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (em Next 16 `params` é Promise).

```tsx
// app/(app)/imovel/lancamento/[id]/page.tsx
import { redirect } from 'next/navigation'
import { findExpenseByTransaction } from '@/lib/property'
import { uuidSchema } from '@/lib/validation/common'

type Props = { params: Promise<{ id: string }> }

/** Leva do lançamento ligado ao gasto do Imóvel (aba Gastos com o gasto aberto). */
export default async function PropertyTransactionRedirect({ params }: Props) {
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) redirect('/imovel')
  const found = await findExpenseByTransaction(id)
  if (!found) redirect('/imovel')
  redirect(`/imovel?imovel=${found.propertyId}&aba=gastos&gasto=${found.expenseId}`)
}
```

- [ ] **Step 5: Card no Início**

```tsx
// components/dashboard/property-panel.tsx
import { ProgressBar } from '@/components/property/progress-bar'
import { ExpenseStatusBadge } from '@/components/property/status-badge'
import { formatISODateBR } from '@/lib/dates'
import { formatBRL } from '@/lib/finance/money'
import type { PropertyCard } from '@/lib/property'

export function PropertyPanel({ card }: { card: PropertyCard }) {
  const { summary } = card
  return (
    <div className="space-y-3 text-sm">
      <p className="truncate font-medium">{card.name}</p>
      <div className="space-y-1">
        <p className="flex items-baseline justify-between">
          <span>Pago</span>
          <span className="tabular-nums">{Math.round(summary.paidRatio * 100)}%</span>
        </p>
        <ProgressBar ratio={summary.paidRatio} label="Percentual pago do imóvel" />
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Total pago</dt>
          <dd className="break-words tabular-nums">{formatBRL(summary.paidCents)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Total previsto</dt>
          <dd className="break-words tabular-nums">{formatBRL(summary.plannedCents)}</dd>
        </div>
      </dl>
      {summary.next && card.nextStatus ? (
        <div className="space-y-1 rounded-lg bg-surface-2 p-2">
          <p className="text-xs text-muted-foreground">Próximo pagamento</p>
          <p className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{summary.next.description}</span>
            <ExpenseStatusBadge status={card.nextStatus} />
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatISODateBR(summary.next.dueDate)} · {formatBRL(summary.next.plannedAmountCents)}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">Nenhum pagamento pendente.</p>
      )}
    </div>
  )
}
```

Em `app/(app)/inicio/page.tsx`:
- importar `PropertyPanel` de `@/components/dashboard/property-panel` e `getPropertyCard` de `@/lib/property`;
- trocar `const data = await getDashboard(ym, todayISO())` por:

```tsx
  const today = todayISO()
  const [data, propertyCard] = await Promise.all([getDashboard(ym, today), getPropertyCard(today)])
```

- depois do `<Panel title="Orçamento" …>…</Panel>`:

```tsx
        {propertyCard ? (
          <Panel title="Imóvel" action={panelLink(`/imovel?imovel=${propertyCard.propertyId}`, 'Ver imóvel')}>
            <PropertyPanel card={propertyCard} />
          </Panel>
        ) : null}
```

- [ ] **Step 6: Verificar e commitar**

Run: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`
Expected: sem erros; build lista `/imovel/lancamento/[id]`.

Manual: pagar um gasto com recursos próprios → em Lançamentos ele aparece com o prédio e "Imóvel"; tocar abre a visão só leitura; "Editar no Imóvel" abre o gasto na aba Gastos; "Excluir" volta o gasto para previsto; o mesmo no extrato e na fatura do cartão; o Início mostra o card do imóvel.

```bash
git add lib/transaction-mappers.ts lib components "app/(app)/imovel/lancamento" "app/(app)/inicio/page.tsx"
git commit -m "feat(imovel): lançamento ligado só leitura em Lançamentos, Editar no Imóvel e card no Início

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: README e verificação final

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar o README**

Trocar `## Funcionalidades (até a Fase 5)` por `## Funcionalidades (até a Fase 6)` e acrescentar, depois do item **Exportar CSV**:

```markdown
- **Imóvel** (`/imovel`): cadastro do imóvel na planta (construtora, unidade, valor, contrato, previsão das chaves e dados do financiamento); gastos com previsto x pago, vencimento, favorecido e fonte (recursos próprios, FGTS ou financiamento), com "Atrasado" calculado; gerador do plano de pagamento (mensais, intermediárias a cada 6 ou 12 meses e chaves) com prévia e "Desfazer"; abas Resumo (totais, % pago, correção INCC, taxa de obra, por fonte e próximo pagamento), Cronograma (previsto x realizado por mês até as chaves), Por tipo e Gastos (filtros por tipo, status, fonte e período). Pagar com recursos próprios cria um único lançamento na categoria Imóvel (conta ou cartão), só leitura em Lançamentos ("Editar no Imóvel"); FGTS e financiamento não geram lançamento.
- **Tipos de gasto do imóvel** (`Configurações → Tipos de gasto do imóvel`): os 21 tipos padrão do PRD, editáveis, mais os que vocês criarem; tipos em uso só são arquivados.
```

- [ ] **Step 2: Verificação completa**

Run: `npm test`, `npm run test:rls`, `npm run lint`, `npm run build`
Expected: tudo passa.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README com as funcionalidades da Fase 6

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
