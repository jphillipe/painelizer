-- S32 — times e papéis (docs/03-sessoes.md, S32). Rodar DEPOIS das migrações da S24 (20261104000000 e
-- 20261104000100) e ANTES de 20261104000300_projects_team.sql. Ver supabase/README.md, "S32 — aplicar".
--
-- Até aqui todo usuário autenticado lia e editava tudo (`using (true)`). Agora cada usuário pertence a um time
-- (`team_members`) com papel `admin` ou `editor`:
--   - editor: lê, cria, edita, manda para a lixeira e restaura os projetos do time;
--   - admin: o mesmo, mais convidar/adicionar pessoas, trocar papel, tirar do time e apagar da lixeira de vez.
-- Um time precisa ter sempre um admin (trigger abaixo).
--
-- Backfill: um time "National Lumber" e TODOS os usuários que já existem entram nele como admin — hoje todo mundo
-- pode tudo, e ninguém perde acesso no dia da migração (decisão de 2026-11-04 em docs/04-decisoes.md; o admin
-- rebaixa quem não deve ser admin pela tela /app/account).
--
-- As funções de checagem ficam no schema `private` (fora da API do PostgREST) e são `security definer`: as
-- políticas de `team_members` consultam a própria tabela, e sem isso a RLS entraria em recursão.

create schema if not exists private;
grant usage on schema private to authenticated;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Cópia do e-mail para a lista de membros (o cliente não lê `auth.users`). Gravada ao entrar no time.
  email text not null,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members (user_id, created_at);

-- Checagens usadas pelas políticas (aqui e em 20261104000300). `stable`: uma vez por comando, não por linha.
create or replace function private.is_team_member(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members m where m.team_id = team and m.user_id = (select auth.uid()));
$$;

create or replace function private.is_team_admin(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members m where m.team_id = team and m.user_id = (select auth.uid()) and m.role = 'admin');
$$;

-- Está em algum time (o bucket `drawings` não tem o time no caminho; ver 20261104000300).
create or replace function private.has_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members m where m.user_id = (select auth.uid()));
$$;

-- O time de quem grava: o mais antigo em que entrou. Default de `projects.team_id` — o app não precisa mandar o
-- time (um time por pessoa, por ora). `null` sem time: a inserção falha no `not null`, e o app explica.
create or replace function private.default_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.team_id from public.team_members m where m.user_id = (select auth.uid()) order by m.created_at, m.team_id limit 1;
$$;

revoke all on function private.is_team_member(uuid), private.is_team_admin(uuid), private.has_team(), private.default_team_id() from public, anon;
grant execute on function private.is_team_member(uuid), private.is_team_admin(uuid), private.has_team(), private.default_team_id() to authenticated;

-- Sempre um admin por time: rebaixar ou tirar o último admin é recusado. Não vale quando o time ou a conta estão
-- sendo apagados (cascata de `teams` ou de `auth.users`): aí a linha sai junto. `security definer`: lê `auth.users`,
-- que o papel `authenticated` não enxerga.
create or replace function private.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' and new.team_id = old.team_id then
    return new;
  end if;
  if not exists (select 1 from public.teams t where t.id = old.team_id) or not exists (select 1 from auth.users u where u.id = old.user_id) then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from public.team_members m where m.team_id = old.team_id and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception 'LAST_ADMIN: a team needs at least one admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end
$$;

create trigger team_members_keep_one_admin
before update or delete on public.team_members
for each row execute function private.keep_one_admin();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "members can read their team"
on public.teams for select
to authenticated
using ((select private.is_team_member(id)));

create policy "admins can rename their team"
on public.teams for update
to authenticated
using ((select private.is_team_admin(id)))
with check ((select private.is_team_admin(id)));

-- Times novos só por SQL (uma fábrica por enquanto); sem política de insert/delete.

create policy "members can read the member list"
on public.team_members for select
to authenticated
using ((select private.is_team_member(team_id)));

-- Entrar no time é pela função `add_team_member` (acha a conta pelo e-mail); insert direto também passa para admin.
create policy "admins can add members"
on public.team_members for insert
to authenticated
with check ((select private.is_team_admin(team_id)));

create policy "admins can change roles"
on public.team_members for update
to authenticated
using ((select private.is_team_admin(team_id)))
with check ((select private.is_team_admin(team_id)));

create policy "admins can remove members"
on public.team_members for delete
to authenticated
using ((select private.is_team_admin(team_id)));

-- Admin põe no time uma conta que já existe, pelo e-mail. Devolve 'added', 'already_member' ou 'no_account' (aí o
-- app convida por e-mail com a chave secret e chama de novo). 'forbidden' se quem chama não é admin do time.
create or replace function public.add_team_member(team uuid, member_email text, member_role text default 'editor')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  target_email text;
begin
  if not private.is_team_admin(team) then
    return 'forbidden';
  end if;
  if member_role not in ('admin', 'editor') then
    raise exception 'add_team_member: role must be admin or editor' using errcode = '22023';
  end if;
  select u.id, u.email into target, target_email from auth.users u where lower(u.email) = lower(trim(member_email)) limit 1;
  if target is null then
    return 'no_account';
  end if;
  if exists (select 1 from public.team_members m where m.team_id = team and m.user_id = target) then
    return 'already_member';
  end if;
  insert into public.team_members (team_id, user_id, email, role, invited_by)
  values (team, target, coalesce(target_email, lower(trim(member_email))), member_role, (select auth.uid()));
  return 'added';
end
$$;

revoke all on function public.add_team_member(uuid, text, text) from public, anon;
grant execute on function public.add_team_member(uuid, text, text) to authenticated;

-- Backfill: o time da fábrica e todo mundo que já tem conta, como admin.
with team as (
  insert into public.teams (name) values ('National Lumber') returning id
)
insert into public.team_members (team_id, user_id, email, role)
select team.id, u.id, coalesce(u.email, ''), 'admin'
from team cross join auth.users u;
