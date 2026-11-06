-- S41 — contas geridas pelo admin e convites por link (docs/03-sessoes.md, S41). Rodar DEPOIS das migrações da
-- S32 (20261104000200_teams.sql e 20261104000300_projects_team.sql). Ver supabase/README.md, "S41 — aplicar".
--
-- O que muda:
--   - `team_members.name`: nome de exibição. O admin muda o de qualquer membro (política "admins can change roles");
--     cada pessoa muda o próprio por `set_my_name`.
--   - `team_members.disabled_at`: conta desativada pelo admin. Quem está desativado deixa de contar como membro em
--     todas as checagens de RLS, na hora (o ban no Supabase Auth só barra tokens novos). Só o servidor grava esta
--     coluna, com a chave secret (o app desativa = ban + `disabled_at`).
--   - Grant por coluna: `authenticated` só atualiza `role` e `name` em `team_members`; e-mail, time, conta e
--     `disabled_at` ficam fora do alcance do cliente.
--   - `team_invites`: convite por link. O app guarda só o sha256 do token; o link aparece uma vez para o admin, que
--     o manda à pessoa. Quem aceita é o servidor (chave secret): cria a conta e põe no time.
--   - O último admin ATIVO não sai, não é rebaixado e não é desativado.

alter table public.team_members
  add column name text check (name is null or char_length(name) between 1 and 80),
  add column disabled_at timestamptz;

revoke update on public.team_members from authenticated;
grant update (role, name) on public.team_members to authenticated;

-- Checagens: membro desativado não conta.
create or replace function private.is_team_member(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members m where m.team_id = team and m.user_id = (select auth.uid()) and m.disabled_at is null);
$$;

create or replace function private.is_team_admin(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members m where m.team_id = team and m.user_id = (select auth.uid()) and m.role = 'admin' and m.disabled_at is null);
$$;

create or replace function private.has_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members m where m.user_id = (select auth.uid()) and m.disabled_at is null);
$$;

create or replace function private.default_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.team_id from public.team_members m where m.user_id = (select auth.uid()) and m.disabled_at is null order by m.created_at, m.team_id limit 1;
$$;

-- Sempre um admin ativo por time. Recusa: tirar, rebaixar ou desativar o último admin ativo. Não vale quando o time
-- ou a conta estão sendo apagados (cascata): aí a linha sai junto.
create or replace function private.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Só importa quem era admin ativo.
  if old.role <> 'admin' or old.disabled_at is not null then
    return coalesce(new, old);
  end if;
  -- Continua admin ativo no mesmo time (troca de nome, por exemplo).
  if tg_op = 'UPDATE' and new.role = 'admin' and new.disabled_at is null and new.team_id = old.team_id then
    return new;
  end if;
  if not exists (select 1 from public.teams t where t.id = old.team_id) or not exists (select 1 from auth.users u where u.id = old.user_id) then
    return coalesce(new, old);
  end if;
  if not exists (
    select 1 from public.team_members m
    where m.team_id = old.team_id and m.role = 'admin' and m.disabled_at is null and m.user_id <> old.user_id
  ) then
    raise exception 'LAST_ADMIN: a team needs at least one admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end
$$;

-- O próprio nome (qualquer membro ativo). Vazio vira null. Não toca em papel nem em nada mais.
create or replace function public.set_my_name(new_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text := nullif(btrim(coalesce(new_name, '')), '');
  changed integer;
begin
  if cleaned is not null and char_length(cleaned) > 80 then
    raise exception 'set_my_name: at most 80 characters' using errcode = '22023';
  end if;
  update public.team_members m set name = cleaned where m.user_id = (select auth.uid()) and m.disabled_at is null;
  get diagnostics changed = row_count;
  return changed > 0;
end
$$;

revoke all on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;

-- Convites por link.
create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  name text check (name is null or char_length(name) between 1 and 80),
  role text not null default 'editor' check (role in ('admin', 'editor')),
  -- sha256 (hex) do token do link; o token em si não é guardado.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);

-- Um convite pendente por e-mail e time (o app revoga o anterior antes de gerar outro).
create unique index team_invites_pending_idx on public.team_invites (team_id, email) where accepted_at is null and revoked_at is null;
create index team_invites_team_idx on public.team_invites (team_id, created_at);

alter table public.team_invites enable row level security;

create policy "admins can read the team's invites"
on public.team_invites for select
to authenticated
using ((select private.is_team_admin(team_id)));

create policy "admins can create invites"
on public.team_invites for insert
to authenticated
with check ((select private.is_team_admin(team_id)) and created_by = (select auth.uid()) and accepted_at is null and accepted_by is null and revoked_at is null);

create policy "admins can revoke invites"
on public.team_invites for update
to authenticated
using ((select private.is_team_admin(team_id)))
with check ((select private.is_team_admin(team_id)));

-- O cliente só revoga (aceitar é do servidor, com a chave secret).
revoke update on public.team_invites from authenticated;
grant update (revoked_at) on public.team_invites to authenticated;
revoke all on public.team_invites from anon;
