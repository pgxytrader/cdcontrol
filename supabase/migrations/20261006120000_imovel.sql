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
