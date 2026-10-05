-- Fase 3 — Cartões, faturas e parcelas.

-- =====================================================================
-- Cartões
-- =====================================================================

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  brand text not null check (brand in ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other')),
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  limit_cents bigint not null default 0 check (limit_cents >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  default_payment_account_id uuid references public.accounts (id) on delete set null,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index credit_cards_household_id_idx on public.credit_cards (household_id);
create index credit_cards_default_payment_account_id_idx on public.credit_cards (default_payment_account_id);

create trigger credit_cards_set_updated_at
  before update on public.credit_cards
  for each row execute function public.set_updated_at();

create or replace function public.credit_cards_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_payment_account_id is not null and not exists (
    select 1 from public.accounts a
    where a.id = new.default_payment_account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;
  return new;
end;
$$;

create trigger credit_cards_check_refs
  before insert or update on public.credit_cards
  for each row execute function public.credit_cards_check_refs();

-- =====================================================================
-- Faturas — identificadas pelo mês de fechamento; o status é calculado no app
-- =====================================================================

create table public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards (id) on delete cascade,
  closing_month date not null,
  closing_date date not null,
  due_date date not null,
  reference_month date not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_invoices_closing_month check (date_trunc('month', closing_date::timestamp)::date = closing_month),
  constraint card_invoices_reference_month check (date_trunc('month', due_date::timestamp)::date = reference_month),
  constraint card_invoices_due_after_closing check (due_date >= closing_date),
  constraint card_invoices_cycle_unique unique (credit_card_id, closing_month)
);

create index card_invoices_household_id_idx on public.card_invoices (household_id);

create trigger card_invoices_set_updated_at
  before update on public.card_invoices
  for each row execute function public.set_updated_at();

create or replace function public.card_invoices_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.credit_cards c where c.id = new.credit_card_id and c.household_id = new.household_id
  ) then
    raise exception 'INVALID_CARD';
  end if;
  return new;
end;
$$;

create trigger card_invoices_check_refs
  before insert or update on public.card_invoices
  for each row execute function public.card_invoices_check_refs();

-- =====================================================================
-- Compras parceladas
-- =====================================================================

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- NO ACTION (padrão): 23503 ao excluir cartão/categoria com parcelamentos
  credit_card_id uuid not null references public.credit_cards (id),
  category_id uuid not null references public.categories (id),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  total_amount_cents bigint not null check (total_amount_cents > 0),
  installments_count smallint not null check (installments_count between 2 and 24),
  first_installment_number smallint not null,
  purchase_date date not null,
  -- Mês de fechamento da fatura da parcela 1: a parcela k fica em first_closing_month + (k − 1)
  first_closing_month date not null
    check (date_trunc('month', first_closing_month::timestamp)::date = first_closing_month),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installment_plans_first_number check (first_installment_number between 1 and installments_count)
);

create index installment_plans_household_id_idx on public.installment_plans (household_id);
create index installment_plans_credit_card_id_idx on public.installment_plans (credit_card_id);
create index installment_plans_category_id_idx on public.installment_plans (category_id);

create trigger installment_plans_set_updated_at
  before update on public.installment_plans
  for each row execute function public.set_updated_at();

create or replace function public.installment_plans_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_household_id uuid;
begin
  if not exists (
    select 1 from public.credit_cards c where c.id = new.credit_card_id and c.household_id = new.household_id
  ) then
    raise exception 'INVALID_CARD';
  end if;

  select c.kind, c.household_id into v_kind, v_household_id from public.categories c where c.id = new.category_id;
  if not found or v_household_id <> new.household_id then
    raise exception 'INVALID_CATEGORY';
  end if;
  if v_kind <> 'expense' then
    raise exception 'CATEGORY_KIND_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger installment_plans_check_refs
  before insert or update on public.installment_plans
  for each row execute function public.installment_plans_check_refs();

-- =====================================================================
-- Lançamentos: cartão, fatura, parcela e pagamento de fatura
-- =====================================================================

alter table public.transactions drop constraint transactions_shape;
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check check (type in ('income', 'expense', 'transfer', 'invoice_payment'));

alter table public.transactions alter column account_id drop not null;

alter table public.transactions
  add column credit_card_id uuid references public.credit_cards (id),
  add column invoice_id uuid references public.card_invoices (id),
  add column installment_plan_id uuid references public.installment_plans (id) on delete cascade,
  add column installment_number smallint;

alter table public.transactions add constraint transactions_shape check (
  (
    type in ('income', 'expense')
    and category_id is not null
    and destination_account_id is null
    and (
      (account_id is not null and credit_card_id is null and invoice_id is null)
      or (account_id is null and credit_card_id is not null and invoice_id is not null)
    )
  )
  or (
    type = 'transfer'
    and category_id is null
    and account_id is not null
    and destination_account_id is not null
    and destination_account_id <> account_id
    and credit_card_id is null
    and invoice_id is null
  )
  or (
    type = 'invoice_payment'
    and account_id is not null
    and credit_card_id is not null
    and invoice_id is not null
    and category_id is null
    and destination_account_id is null
  )
);

alter table public.transactions add constraint transactions_installment_shape check (
  (installment_plan_id is null and installment_number is null)
  or (
    installment_plan_id is not null
    and installment_number is not null
    and type = 'expense'
    and credit_card_id is not null
  )
);

create index transactions_credit_card_id_idx on public.transactions (credit_card_id);
create index transactions_invoice_id_idx on public.transactions (invoice_id);
create index transactions_installment_plan_id_idx on public.transactions (installment_plan_id);

create or replace function public.transactions_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_household_id uuid;
  v_count smallint;
begin
  if new.account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;

  if new.destination_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.destination_account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;

  if new.credit_card_id is not null and not exists (
    select 1 from public.credit_cards c where c.id = new.credit_card_id and c.household_id = new.household_id
  ) then
    raise exception 'INVALID_CARD';
  end if;

  if new.invoice_id is not null and not exists (
    select 1 from public.card_invoices i
    where i.id = new.invoice_id and i.household_id = new.household_id and i.credit_card_id = new.credit_card_id
  ) then
    raise exception 'INVALID_INVOICE';
  end if;

  if new.installment_plan_id is not null then
    select p.installments_count into v_count
    from public.installment_plans p
    where p.id = new.installment_plan_id and p.household_id = new.household_id and p.credit_card_id = new.credit_card_id;
    if not found or new.installment_number is null or new.installment_number not between 1 and v_count then
      raise exception 'INVALID_PLAN';
    end if;
  end if;

  if new.category_id is not null then
    select c.kind, c.household_id into v_kind, v_household_id
    from public.categories c
    where c.id = new.category_id;

    if not found or v_household_id <> new.household_id then
      raise exception 'INVALID_CATEGORY';
    end if;
    if v_kind <> new.type then
      raise exception 'CATEGORY_KIND_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

-- =====================================================================
-- Último cartão usado por pessoa
-- =====================================================================

alter table public.profiles
  add column last_credit_card_id uuid references public.credit_cards (id) on delete set null;

grant update (last_credit_card_id) on public.profiles to authenticated;

-- =====================================================================
-- Views
-- =====================================================================

-- Saldo por conta: pagamentos de fatura saem da conta de origem
create or replace view public.v_account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.household_id,
  (a.initial_balance_cents + coalesce(sum(
    case
      when t.type = 'income' and t.account_id = a.id then t.amount_cents
      when t.type = 'expense' and t.account_id = a.id then -t.amount_cents
      when t.type = 'invoice_payment' and t.account_id = a.id then -t.amount_cents
      when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_cents
      when t.type = 'transfer' and t.account_id = a.id then -t.amount_cents
      else 0
    end
  ), 0))::bigint as balance_cents
from public.accounts a
left join public.transactions t
  on (t.account_id = a.id or t.destination_account_id = a.id)
  and t.status = 'paid'
  and t.date >= a.initial_balance_date
group by a.id;

-- Totais por fatura (mesma regra de summarizeInvoice em lib/finance/invoice.ts)
create view public.v_invoice_totals
with (security_invoker = true)
as
select
  i.id as invoice_id,
  i.household_id,
  i.credit_card_id,
  i.closing_month,
  i.closing_date,
  i.due_date,
  i.reference_month,
  coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)::bigint as charges_cents,
  coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint as credits_cents,
  (
    coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)
    - coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)
  )::bigint as total_cents,
  coalesce(sum(t.amount_cents) filter (where t.type = 'invoice_payment' and t.status = 'paid'), 0)::bigint as paid_cents
from public.card_invoices i
left join public.transactions t on t.invoice_id = i.id
group by i.id;

-- =====================================================================
-- RPCs (security invoker: o RLS vale para quem chama)
-- =====================================================================

create or replace function public.ensure_invoice(
  p_card_id uuid,
  p_closing_month date,
  p_closing_date date,
  p_due_date date,
  p_reference_month date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_invoice_id uuid;
begin
  select c.household_id into v_household_id from public.credit_cards c where c.id = p_card_id;
  if not found then
    raise exception 'INVALID_CARD';
  end if;

  insert into public.card_invoices (household_id, credit_card_id, closing_month, closing_date, due_date, reference_month)
  values (v_household_id, p_card_id, p_closing_month, p_closing_date, p_due_date, p_reference_month)
  on conflict (credit_card_id, closing_month) do nothing;

  select i.id into v_invoice_id
  from public.card_invoices i
  where i.credit_card_id = p_card_id and i.closing_month = p_closing_month;

  return v_invoice_id;
end;
$$;

-- Compra no cartão (à vista, parcelada ou estorno): plano + faturas + linhas numa transação só
create or replace function public.create_card_purchase(p_card_id uuid, p_plan jsonb, p_rows jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_plan_id uuid;
  v_row jsonb;
  v_invoice_id uuid;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  select c.household_id into v_household_id from public.credit_cards c where c.id = p_card_id;
  if not found then
    raise exception 'INVALID_CARD';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVALID_INPUT';
  end if;

  if p_plan is not null and jsonb_typeof(p_plan) = 'object' then
    insert into public.installment_plans (
      household_id, credit_card_id, category_id, description, total_amount_cents,
      installments_count, first_installment_number, purchase_date, first_closing_month
    )
    values (
      v_household_id,
      p_card_id,
      (p_plan ->> 'category_id')::uuid,
      p_plan ->> 'description',
      (p_plan ->> 'total_amount_cents')::bigint,
      (p_plan ->> 'installments_count')::smallint,
      (p_plan ->> 'first_installment_number')::smallint,
      (p_plan ->> 'purchase_date')::date,
      (p_plan ->> 'first_closing_month')::date
    )
    returning id into v_plan_id;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_invoice_id := public.ensure_invoice(
      p_card_id,
      (v_row ->> 'closing_month')::date,
      (v_row ->> 'closing_date')::date,
      (v_row ->> 'due_date')::date,
      (v_row ->> 'reference_month')::date
    );

    insert into public.transactions (
      household_id, type, description, amount_cents, date, status, category_id,
      credit_card_id, invoice_id, installment_plan_id, installment_number, notes
    )
    values (
      v_household_id,
      v_row ->> 'type',
      v_row ->> 'description',
      (v_row ->> 'amount_cents')::bigint,
      (v_row ->> 'date')::date,
      v_row ->> 'status',
      (v_row ->> 'category_id')::uuid,
      p_card_id,
      v_invoice_id,
      v_plan_id,
      (v_row ->> 'installment_number')::smallint,
      v_row ->> 'notes'
    )
    returning id into v_id;

    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end;
$$;

-- Novos dias do cartão: recalcula faturas abertas e âncoras e move lançamentos (calculado em lib/finance/card.ts)
create or replace function public.apply_card_schedule(
  p_card_id uuid,
  p_closing_day integer,
  p_due_day integer,
  p_invoices jsonb,
  p_plans jsonb,
  p_moves jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_move jsonb;
  v_invoice_id uuid;
begin
  update public.credit_cards c
  set closing_day = p_closing_day::smallint, due_day = p_due_day::smallint
  where c.id = p_card_id
  returning c.household_id into v_household_id;
  if v_household_id is null then
    raise exception 'INVALID_CARD';
  end if;

  update public.card_invoices i
  set
    closing_date = (x.value ->> 'closing_date')::date,
    due_date = (x.value ->> 'due_date')::date,
    reference_month = (x.value ->> 'reference_month')::date
  from jsonb_array_elements(coalesce(p_invoices, '[]'::jsonb)) as x
  where i.id = (x.value ->> 'id')::uuid and i.credit_card_id = p_card_id;

  update public.installment_plans p
  set first_closing_month = (x.value ->> 'first_closing_month')::date
  from jsonb_array_elements(coalesce(p_plans, '[]'::jsonb)) as x
  where p.id = (x.value ->> 'id')::uuid and p.credit_card_id = p_card_id;

  for v_move in select value from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) loop
    v_invoice_id := public.ensure_invoice(
      p_card_id,
      (v_move ->> 'closing_month')::date,
      (v_move ->> 'closing_date')::date,
      (v_move ->> 'due_date')::date,
      (v_move ->> 'reference_month')::date
    );
    update public.transactions t
    set invoice_id = v_invoice_id
    where t.id = (v_move ->> 'transaction_id')::uuid and t.credit_card_id = p_card_id;
  end loop;
end;
$$;

-- "Desfazer": recria o plano (se veio no snapshot) e as linhas com os mesmos ids
create or replace function public.restore_transactions(p_plan jsonb, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVALID_INPUT';
  end if;

  if p_plan is not null and jsonb_typeof(p_plan) = 'object' then
    insert into public.installment_plans (
      id, household_id, credit_card_id, category_id, description, total_amount_cents,
      installments_count, first_installment_number, purchase_date, first_closing_month
    )
    select
      r.id, r.household_id, r.credit_card_id, r.category_id, r.description, r.total_amount_cents,
      r.installments_count, r.first_installment_number, r.purchase_date, r.first_closing_month
    from jsonb_populate_record(null::public.installment_plans, p_plan) r;
  end if;

  insert into public.transactions (
    id, household_id, type, description, amount_cents, date, status, category_id, account_id,
    destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number,
    source, external_id, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.date, r.status, r.category_id, r.account_id,
    r.destination_account_id, r.credit_card_id, r.invoice_id, r.installment_plan_id, r.installment_number,
    coalesce(r.source, 'manual'), r.external_id, r.notes
  from jsonb_populate_recordset(null::public.transactions, p_rows) r;
end;
$$;

-- =====================================================================
-- Permissões e RLS
-- =====================================================================

revoke all on function public.credit_cards_check_refs() from public, anon, authenticated;
revoke all on function public.card_invoices_check_refs() from public, anon, authenticated;
revoke all on function public.installment_plans_check_refs() from public, anon, authenticated;

revoke all on function public.ensure_invoice(uuid, date, date, date, date) from public, anon;
revoke all on function public.create_card_purchase(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.apply_card_schedule(uuid, integer, integer, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.restore_transactions(jsonb, jsonb) from public, anon;
grant execute on function public.ensure_invoice(uuid, date, date, date, date) to authenticated;
grant execute on function public.create_card_purchase(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.apply_card_schedule(uuid, integer, integer, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.restore_transactions(jsonb, jsonb) to authenticated;

revoke all on public.credit_cards, public.card_invoices, public.installment_plans, public.v_invoice_totals from anon;
revoke truncate, references, trigger on public.credit_cards, public.card_invoices, public.installment_plans from authenticated;
grant select on public.v_invoice_totals to authenticated;

alter table public.credit_cards enable row level security;
alter table public.card_invoices enable row level security;
alter table public.installment_plans enable row level security;

create policy credit_cards_all on public.credit_cards
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy card_invoices_all on public.card_invoices
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy installment_plans_all on public.installment_plans
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
