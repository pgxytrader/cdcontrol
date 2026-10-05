-- Fase 4 — Recorrência e orçamento.

-- =====================================================================
-- Recorrências (o modelo da série)
-- =====================================================================

create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  -- NO ACTION (padrão): 23503 ao excluir conta/cartão/categoria usados por uma série
  category_id uuid references public.categories (id),
  account_id uuid references public.accounts (id),
  destination_account_id uuid references public.accounts (id),
  credit_card_id uuid references public.credit_cards (id),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  start_date date not null,
  end_date date,
  generated_until date not null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrences_dates check (end_date is null or end_date >= start_date),
  constraint recurrences_shape check (
    (
      type in ('income', 'expense')
      and category_id is not null
      and destination_account_id is null
      and (
        (account_id is not null and credit_card_id is null)
        or (account_id is null and credit_card_id is not null and type = 'expense')
      )
    )
    or (
      type = 'transfer'
      and category_id is null
      and credit_card_id is null
      and account_id is not null
      and destination_account_id is not null
      and destination_account_id <> account_id
    )
  )
);

create index recurrences_household_id_idx on public.recurrences (household_id);
create index recurrences_account_id_idx on public.recurrences (account_id);
create index recurrences_destination_account_id_idx on public.recurrences (destination_account_id);
create index recurrences_credit_card_id_idx on public.recurrences (credit_card_id);
create index recurrences_category_id_idx on public.recurrences (category_id);

create trigger recurrences_set_updated_at
  before update on public.recurrences
  for each row execute function public.set_updated_at();

create or replace function public.recurrences_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_household_id uuid;
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

create trigger recurrences_check_refs
  before insert or update on public.recurrences
  for each row execute function public.recurrences_check_refs();

-- =====================================================================
-- Lançamentos: ligação com a série
-- =====================================================================

alter table public.transactions
  add column recurrence_id uuid references public.recurrences (id) on delete set null,
  add column occurrence_date date;

alter table public.transactions add constraint transactions_recurrence_shape check (
  recurrence_id is null
  or (occurrence_date is not null and installment_plan_id is null and type <> 'invoice_payment')
);

create index transactions_recurrence_id_idx on public.transactions (recurrence_id);
-- Duas sessões gerando a mesma janela não duplicam ocorrências
create unique index transactions_recurrence_occurrence_idx
  on public.transactions (recurrence_id, occurrence_date)
  where recurrence_id is not null;

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

  if new.recurrence_id is not null and not exists (
    select 1 from public.recurrences r where r.id = new.recurrence_id and r.household_id = new.household_id
  ) then
    raise exception 'INVALID_RECURRENCE';
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
-- Orçamento — limite efetivo calculado no app (lib/finance/budget.ts)
-- =====================================================================

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents >= 0),
  repeats boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_category_month unique (category_id, month)
);

create index budgets_household_id_idx on public.budgets (household_id);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

create or replace function public.budgets_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.categories c
    where c.id = new.category_id
      and c.household_id = new.household_id
      and c.kind = 'expense'
      and c.parent_id is null
  ) then
    raise exception 'INVALID_BUDGET_CATEGORY';
  end if;
  return new;
end;
$$;

create trigger budgets_check_refs
  before insert or update on public.budgets
  for each row execute function public.budgets_check_refs();

-- =====================================================================
-- RPCs (security invoker: o RLS vale para quem chama)
-- =====================================================================

-- Grava ocorrências de uma série. Linha com "id" é um lançamento regravado (sem on conflict: conflito desfaz tudo);
-- sem "id", ocorrência nova que já exista é ignorada.
create or replace function public.insert_recurrence_rows(p_recurrence_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_row jsonb;
  v_card_id uuid;
  v_invoice_id uuid;
begin
  select r.household_id into v_household_id from public.recurrences r where r.id = p_recurrence_id;
  if not found then
    raise exception 'INVALID_RECURRENCE';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_card_id := (v_row ->> 'credit_card_id')::uuid;
    v_invoice_id := null;
    if v_card_id is not null then
      v_invoice_id := public.ensure_invoice(
        v_card_id,
        (v_row ->> 'closing_month')::date,
        (v_row ->> 'closing_date')::date,
        (v_row ->> 'due_date')::date,
        (v_row ->> 'reference_month')::date
      );
    end if;

    if v_row ? 'id' then
      insert into public.transactions (
        id, household_id, type, description, amount_cents, date, status, category_id, account_id,
        destination_account_id, credit_card_id, invoice_id, recurrence_id, occurrence_date, source, notes
      )
      values (
        (v_row ->> 'id')::uuid,
        v_household_id,
        v_row ->> 'type',
        v_row ->> 'description',
        (v_row ->> 'amount_cents')::bigint,
        (v_row ->> 'date')::date,
        v_row ->> 'status',
        (v_row ->> 'category_id')::uuid,
        (v_row ->> 'account_id')::uuid,
        (v_row ->> 'destination_account_id')::uuid,
        v_card_id,
        v_invoice_id,
        p_recurrence_id,
        (v_row ->> 'occurrence_date')::date,
        'recurrence',
        v_row ->> 'notes'
      );
    else
      insert into public.transactions (
        household_id, type, description, amount_cents, date, status, category_id, account_id,
        destination_account_id, credit_card_id, invoice_id, recurrence_id, occurrence_date, source, notes
      )
      values (
        v_household_id,
        v_row ->> 'type',
        v_row ->> 'description',
        (v_row ->> 'amount_cents')::bigint,
        (v_row ->> 'date')::date,
        v_row ->> 'status',
        (v_row ->> 'category_id')::uuid,
        (v_row ->> 'account_id')::uuid,
        (v_row ->> 'destination_account_id')::uuid,
        v_card_id,
        v_invoice_id,
        p_recurrence_id,
        (v_row ->> 'occurrence_date')::date,
        'recurrence',
        v_row ->> 'notes'
      )
      on conflict (recurrence_id, occurrence_date) where recurrence_id is not null do nothing;
    end if;
  end loop;
end;
$$;

-- Série nova: modelo + ocorrências numa transação só
create or replace function public.create_recurrence(p_recurrence jsonb, p_rows jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.recurrences (
    household_id, type, description, amount_cents, category_id, account_id, destination_account_id,
    credit_card_id, frequency, start_date, end_date, generated_until, notes
  )
  values (
    (p_recurrence ->> 'household_id')::uuid,
    p_recurrence ->> 'type',
    p_recurrence ->> 'description',
    (p_recurrence ->> 'amount_cents')::bigint,
    (p_recurrence ->> 'category_id')::uuid,
    (p_recurrence ->> 'account_id')::uuid,
    (p_recurrence ->> 'destination_account_id')::uuid,
    (p_recurrence ->> 'credit_card_id')::uuid,
    p_recurrence ->> 'frequency',
    (p_recurrence ->> 'start_date')::date,
    (p_recurrence ->> 'end_date')::date,
    (p_recurrence ->> 'generated_until')::date,
    p_recurrence ->> 'notes'
  )
  returning id into v_id;

  perform public.insert_recurrence_rows(v_id, p_rows);
  return v_id;
end;
$$;

-- Geração ao abrir o app: idempotente (on conflict) e generated_until nunca volta
create or replace function public.generate_recurrence_occurrences(p_recurrence_id uuid, p_rows jsonb, p_generated_until date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.insert_recurrence_rows(p_recurrence_id, coalesce(p_rows, '[]'::jsonb));
  update public.recurrences r
  set generated_until = greatest(r.generated_until, p_generated_until)
  where r.id = p_recurrence_id;
end;
$$;

-- "Este e os próximos", tela Recorrências e encerrar (calculado em lib/finance/recurrence.ts).
-- p_patch traz o estado completo da série; end_date < start_date apaga a série.
create or replace function public.apply_recurrence_change(
  p_recurrence_id uuid,
  p_patch jsonb,
  p_delete_ids uuid[],
  p_rows jsonb,
  p_generated_until date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start date := (p_patch ->> 'start_date')::date;
  v_end date := (p_patch ->> 'end_date')::date;
begin
  if not exists (select 1 from public.recurrences r where r.id = p_recurrence_id) then
    raise exception 'INVALID_RECURRENCE';
  end if;

  delete from public.transactions t
  where t.recurrence_id = p_recurrence_id and t.id = any (coalesce(p_delete_ids, '{}'::uuid[]));

  if v_end is not null and v_end < v_start then
    -- Os lançamentos que ficaram (pagos) continuam, sem série (on delete set null)
    delete from public.recurrences r where r.id = p_recurrence_id;
    return;
  end if;

  update public.recurrences r
  set
    type = p_patch ->> 'type',
    description = p_patch ->> 'description',
    amount_cents = (p_patch ->> 'amount_cents')::bigint,
    category_id = (p_patch ->> 'category_id')::uuid,
    account_id = (p_patch ->> 'account_id')::uuid,
    destination_account_id = (p_patch ->> 'destination_account_id')::uuid,
    credit_card_id = (p_patch ->> 'credit_card_id')::uuid,
    frequency = p_patch ->> 'frequency',
    start_date = v_start,
    end_date = v_end,
    notes = p_patch ->> 'notes',
    generated_until = p_generated_until
  where r.id = p_recurrence_id;

  perform public.insert_recurrence_rows(p_recurrence_id, coalesce(p_rows, '[]'::jsonb));
end;
$$;

-- "Desfazer" de "excluir este e os próximos": recria ou restaura a série e as linhas com os mesmos ids
create or replace function public.restore_recurrence(p_recurrence jsonb, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.recurrences (
    id, household_id, type, description, amount_cents, category_id, account_id, destination_account_id,
    credit_card_id, frequency, start_date, end_date, generated_until, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.category_id, r.account_id, r.destination_account_id,
    r.credit_card_id, r.frequency, r.start_date, r.end_date, r.generated_until, r.notes
  from jsonb_populate_record(null::public.recurrences, p_recurrence) r
  on conflict (id) do update set
    type = excluded.type,
    description = excluded.description,
    amount_cents = excluded.amount_cents,
    category_id = excluded.category_id,
    account_id = excluded.account_id,
    destination_account_id = excluded.destination_account_id,
    credit_card_id = excluded.credit_card_id,
    frequency = excluded.frequency,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    generated_until = excluded.generated_until,
    notes = excluded.notes;

  insert into public.transactions (
    id, household_id, type, description, amount_cents, date, status, category_id, account_id,
    destination_account_id, credit_card_id, invoice_id, installment_plan_id, installment_number,
    recurrence_id, occurrence_date, source, external_id, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.date, r.status, r.category_id, r.account_id,
    r.destination_account_id, r.credit_card_id, r.invoice_id, r.installment_plan_id, r.installment_number,
    r.recurrence_id, r.occurrence_date, coalesce(r.source, 'recurrence'), r.external_id, r.notes
  from jsonb_populate_recordset(null::public.transactions, coalesce(p_rows, '[]'::jsonb)) r;
end;
$$;

-- "Desfazer" de qualquer exclusão (Fase 3), agora também com a ligação à série
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
    recurrence_id, occurrence_date, source, external_id, notes
  )
  select
    r.id, r.household_id, r.type, r.description, r.amount_cents, r.date, r.status, r.category_id, r.account_id,
    r.destination_account_id, r.credit_card_id, r.invoice_id, r.installment_plan_id, r.installment_number,
    r.recurrence_id, r.occurrence_date, coalesce(r.source, 'manual'), r.external_id, r.notes
  from jsonb_populate_recordset(null::public.transactions, p_rows) r;
end;
$$;

-- Orçamento: upserts e meses a apagar numa transação (calculado por budgetChange)
create or replace function public.apply_budget_change(p_category_id uuid, p_upserts jsonb, p_delete_months date[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select c.household_id into v_household_id from public.categories c where c.id = p_category_id;
  if not found then
    raise exception 'INVALID_BUDGET_CATEGORY';
  end if;

  delete from public.budgets b
  where b.category_id = p_category_id and b.month = any (coalesce(p_delete_months, '{}'::date[]));

  insert into public.budgets (household_id, category_id, month, amount_cents, repeats)
  select
    v_household_id,
    p_category_id,
    (x.value ->> 'month')::date,
    (x.value ->> 'amount_cents')::bigint,
    (x.value ->> 'repeats')::boolean
  from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) as x
  on conflict (category_id, month) do update set amount_cents = excluded.amount_cents, repeats = excluded.repeats;
end;
$$;

-- =====================================================================
-- Permissões e RLS
-- =====================================================================

revoke all on function public.recurrences_check_refs() from public, anon, authenticated;
revoke all on function public.budgets_check_refs() from public, anon, authenticated;

revoke all on function public.insert_recurrence_rows(uuid, jsonb) from public, anon;
revoke all on function public.create_recurrence(jsonb, jsonb) from public, anon;
revoke all on function public.generate_recurrence_occurrences(uuid, jsonb, date) from public, anon;
revoke all on function public.apply_recurrence_change(uuid, jsonb, uuid[], jsonb, date) from public, anon;
revoke all on function public.restore_recurrence(jsonb, jsonb) from public, anon;
revoke all on function public.apply_budget_change(uuid, jsonb, date[]) from public, anon;
-- insert_recurrence_rows é interna, mas os RPCs são invoker: quem chama precisa de execute
grant execute on function public.insert_recurrence_rows(uuid, jsonb) to authenticated;
grant execute on function public.create_recurrence(jsonb, jsonb) to authenticated;
grant execute on function public.generate_recurrence_occurrences(uuid, jsonb, date) to authenticated;
grant execute on function public.apply_recurrence_change(uuid, jsonb, uuid[], jsonb, date) to authenticated;
grant execute on function public.restore_recurrence(jsonb, jsonb) to authenticated;
grant execute on function public.apply_budget_change(uuid, jsonb, date[]) to authenticated;

revoke all on public.recurrences, public.budgets from anon;
revoke truncate, references, trigger on public.recurrences, public.budgets from authenticated;

alter table public.recurrences enable row level security;
alter table public.budgets enable row level security;

create policy recurrences_all on public.recurrences
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy budgets_all on public.budgets
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
