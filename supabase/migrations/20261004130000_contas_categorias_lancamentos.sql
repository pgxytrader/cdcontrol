-- Fase 2 — Contas, categorias e lançamentos.

-- =====================================================================
-- Contas
-- =====================================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  institution text check (institution is null or char_length(institution) <= 60),
  type text not null check (type in ('checking', 'savings', 'cash', 'investment')),
  initial_balance_cents bigint not null default 0,
  initial_balance_date date not null,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_household_id_idx on public.accounts (household_id);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Categorias
-- =====================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  -- NO ACTION (padrão): impede excluir mãe com filhas, mas permite apagar a casa em cascata
  parent_id uuid references public.categories (id),
  icon text not null check (char_length(icon) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  is_default boolean not null default false,
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_household_id_idx on public.categories (household_id);
create index categories_parent_id_idx on public.categories (parent_id);
create unique index categories_unique_name_idx on public.categories (
  household_id,
  kind,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create or replace function public.categories_check_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.categories%rowtype;
begin
  if tg_op = 'UPDATE' and new.kind <> old.kind then
    raise exception 'CATEGORY_KIND_MISMATCH';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'INVALID_PARENT';
  end if;

  select * into v_parent from public.categories c where c.id = new.parent_id;
  if not found
     or v_parent.household_id <> new.household_id
     or v_parent.kind <> new.kind
     or v_parent.parent_id is not null then
    raise exception 'INVALID_PARENT';
  end if;

  -- Uma categoria que já tem filhas não pode virar subcategoria
  if exists (select 1 from public.categories c where c.parent_id = new.id) then
    raise exception 'INVALID_PARENT';
  end if;

  return new;
end;
$$;

create trigger categories_check_parent
  before insert or update on public.categories
  for each row execute function public.categories_check_parent();

-- =====================================================================
-- Lançamentos
-- =====================================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  date date not null,
  status text not null check (status in ('paid', 'pending')),
  -- NO ACTION (padrão): 23503 ao excluir conta/categoria com lançamentos
  category_id uuid references public.categories (id),
  account_id uuid not null references public.accounts (id),
  destination_account_id uuid references public.accounts (id),
  source text not null default 'manual' check (source in ('manual', 'recurrence', 'property', 'import')),
  external_id text,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_shape check (
    (type in ('income', 'expense') and category_id is not null and destination_account_id is null)
    or (type = 'transfer' and category_id is null and destination_account_id is not null
        and destination_account_id <> account_id)
  )
);

create index transactions_household_date_idx on public.transactions (household_id, date);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_destination_account_id_idx on public.transactions (destination_account_id);
create index transactions_category_id_idx on public.transactions (category_id);
create unique index transactions_external_id_idx on public.transactions (household_id, external_id)
  where external_id is not null;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create or replace function public.transactions_check_refs()
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
    select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
  end if;

  if new.destination_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.destination_account_id and a.household_id = new.household_id
  ) then
    raise exception 'INVALID_ACCOUNT';
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

create trigger transactions_check_refs
  before insert or update on public.transactions
  for each row execute function public.transactions_check_refs();

-- =====================================================================
-- Última conta usada por pessoa
-- =====================================================================

alter table public.profiles
  add column last_account_id uuid references public.accounts (id) on delete set null;

grant update (last_account_id) on public.profiles to authenticated;

-- =====================================================================
-- Saldo por conta
-- =====================================================================

create view public.v_account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.household_id,
  (a.initial_balance_cents + coalesce(sum(
    case
      when t.type = 'income' and t.account_id = a.id then t.amount_cents
      when t.type = 'expense' and t.account_id = a.id then -t.amount_cents
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

-- =====================================================================
-- Categorias padrão (PRD 5.6) — mesma lista de lib/categories.ts
-- =====================================================================

create or replace function public.seed_default_categories(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.categories c where c.household_id = p_household_id and c.is_default) then
    return;
  end if;

  insert into public.categories (household_id, name, kind, icon, color, is_default)
  values
    (p_household_id, 'Moradia', 'expense', 'house', '#3b82f6', true),
    (p_household_id, 'Mercado', 'expense', 'shopping-cart', '#22c55e', true),
    (p_household_id, 'Alimentação fora', 'expense', 'utensils-crossed', '#f97316', true),
    (p_household_id, 'Transporte', 'expense', 'car', '#eab308', true),
    (p_household_id, 'Saúde', 'expense', 'heart-pulse', '#ef4444', true),
    (p_household_id, 'Educação', 'expense', 'graduation-cap', '#a855f7', true),
    (p_household_id, 'Lazer', 'expense', 'gamepad-2', '#ec4899', true),
    (p_household_id, 'Assinaturas', 'expense', 'repeat', '#14b8a6', true),
    (p_household_id, 'Vestuário', 'expense', 'shirt', '#f59e0b', true),
    (p_household_id, 'Pets', 'expense', 'paw-print', '#f97316', true),
    (p_household_id, 'Presentes', 'expense', 'gift', '#ec4899', true),
    (p_household_id, 'Viagem', 'expense', 'plane', '#3b82f6', true),
    (p_household_id, 'Imóvel', 'expense', 'building-2', '#14b8a6', true),
    (p_household_id, 'Outros', 'expense', 'circle-ellipsis', '#64748b', true),
    (p_household_id, 'Salário', 'income', 'briefcase', '#22c55e', true),
    (p_household_id, 'Freelance', 'income', 'laptop', '#3b82f6', true),
    (p_household_id, 'Rendimentos', 'income', 'trending-up', '#14b8a6', true),
    (p_household_id, 'Reembolso', 'income', 'undo-2', '#a855f7', true),
    (p_household_id, 'Outros', 'income', 'circle-ellipsis', '#64748b', true);
end;
$$;

-- create_household (Fase 1) agora também semeia as categorias
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

  return v_household_id;
end;
$$;

-- Casas que já existem (ex.: a de vocês)
select public.seed_default_categories(h.id) from public.households h;

-- =====================================================================
-- Permissões e RLS
-- =====================================================================

revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke all on function public.categories_check_parent() from public, anon, authenticated;
revoke all on function public.transactions_check_refs() from public, anon, authenticated;

revoke all on public.accounts, public.categories, public.transactions, public.v_account_balances from anon;
revoke truncate, references, trigger on public.accounts, public.categories, public.transactions from authenticated;
grant select on public.v_account_balances to authenticated;

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy accounts_all on public.accounts
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy categories_all on public.categories
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy transactions_all on public.transactions
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
