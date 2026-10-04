-- Fase 1 — Fundação: casas, membros, convites e perfis.

-- =====================================================================
-- Utilitários
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- Tabelas
-- =====================================================================

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_invites_household_id_idx on public.household_invites (household_id);

create trigger household_invites_set_updated_at
  before update on public.household_invites
  for each row execute function public.set_updated_at();

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Perfil automático para cada usuário do Auth
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuários criados antes desta migration
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- =====================================================================
-- Helpers de RLS (security definer evita recursão nas policies)
-- =====================================================================

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.shares_household_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;

-- =====================================================================
-- RPCs
-- =====================================================================

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

  -- Serializa chamadas do mesmo usuário (evita duas casas num duplo clique)
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if exists (select 1 from public.household_members m where m.user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.households (name, created_by)
  values (v_name, v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_uid, 'owner');

  return v_household_id;
end;
$$;

create or replace function public.create_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_code text;
  v_expires_at timestamptz := now() + interval '7 days';
  v_bytes bytea;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select m.household_id into v_household_id
  from public.household_members m
  where m.user_id = v_uid
  limit 1;

  if v_household_id is null then
    raise exception 'NO_HOUSEHOLD';
  end if;

  -- Trava a casa: serializa convites e resgates da mesma casa
  perform 1 from public.households h where h.id = v_household_id for update;

  if (select count(*) from public.household_members m where m.household_id = v_household_id) >= 2 then
    raise exception 'HOUSEHOLD_FULL';
  end if;

  -- Só um convite ativo por casa
  update public.household_invites i
     set expires_at = now()
   where i.household_id = v_household_id
     and i.used_at is null
     and i.expires_at > now();

  loop
    -- gen_random_uuid() usa gerador criptográfico; os 6 primeiros bytes são aleatórios
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for k in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, k) % length(v_alphabet)), 1);
    end loop;

    begin
      insert into public.household_invites (household_id, code, expires_at, created_by)
      values (v_household_id, v_code, v_expires_at, v_uid);
      exit;
    exception when unique_violation then
      -- colisão de código: tenta outro
    end;
  end loop;

  return query select v_code, v_expires_at;
end;
$$;

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_household_id uuid;
  v_invite public.household_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if exists (select 1 from public.household_members m where m.user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  select i.household_id into v_household_id
  from public.household_invites i
  where i.code = v_code;

  if v_household_id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  -- Mesma ordem de travas do create_invite (casa, depois convite) para evitar deadlock
  perform 1 from public.households h where h.id = v_household_id for update;

  select * into v_invite
  from public.household_invites i
  where i.code = v_code
  for update;

  if v_invite.used_at is not null then
    raise exception 'INVITE_USED';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'INVITE_EXPIRED';
  end if;
  if (select count(*) from public.household_members m where m.household_id = v_household_id) >= 2 then
    raise exception 'HOUSEHOLD_FULL';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_uid, 'member');

  update public.household_invites i
     set used_at = now(), used_by = v_uid
   where i.id = v_invite.id;

  return v_household_id;
end;
$$;

-- =====================================================================
-- Permissões
-- =====================================================================

revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.shares_household_with(uuid) from public, anon;
revoke all on function public.create_household(text) from public, anon;
revoke all on function public.create_invite() from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;

revoke all on public.households, public.household_members, public.household_invites, public.profiles from anon;

-- Escrita só pelas RPCs; update apenas nas colunas editáveis
revoke insert, update, delete on public.households, public.household_members, public.household_invites, public.profiles
  from authenticated;
grant update (name) on public.households to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.profiles enable row level security;

create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy household_members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

create policy household_invites_select on public.household_invites
  for select to authenticated
  using (public.is_household_member(household_id));

create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.shares_household_with(user_id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
