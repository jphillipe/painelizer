-- S32 — projetos por time, quem gravou, lixeira e histórico (docs/03-sessoes.md, S32). Rodar DEPOIS de
-- 20261104000200_teams.sql. Ver supabase/README.md, "S32 — aplicar".
--
--   1. `projects.team_id` (backfill: o time criado em 20261104000200), `updated_by`/`updated_by_email` (trigger, da
--      sessão de quem grava), `deleted_at`/`deleted_by` (lixeira).
--   2. RLS por time no lugar de `using (true)`. Apagar de vez só da lixeira e só admin.
--   3. `project_revisions`: um retrato a cada 20 gravações (e na criação), os 20 mais recentes por projeto.
--   4. Bucket `drawings`: só quem está num time (o caminho não leva o time; ver abaixo).
--   5. `orphan_drawings` passa a ler também `$drawings` (desenhos de projeto sem leitura, S32).
--   6. `sweep_trashed_projects(ttl)`: apaga de vez o que está na lixeira há mais de 30 dias (para o agendamento).

-- 1. Colunas -----------------------------------------------------------------------------------------------------

alter table public.projects
  add column team_id uuid references public.teams (id) on delete restrict,
  add column updated_by uuid references auth.users (id) on delete set null,
  add column updated_by_email text,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null;

update public.projects
set team_id = (select t.id from public.teams t order by t.created_at limit 1),
    updated_by = owner_id,
    updated_by_email = owner_email;

alter table public.projects
  alter column team_id set not null,
  alter column team_id set default private.default_team_id();

-- A lista (S32): do time, fora da lixeira, por `updated_at` (paginação por cursor).
drop index if exists public.projects_updated_at_idx;
create index projects_team_updated_idx on public.projects (team_id, updated_at desc, id desc) where deleted_at is null;
create index projects_team_trash_idx on public.projects (team_id, deleted_at desc) where deleted_at is not null;

-- Quem gravou por último vem da sessão (JWT), não do app: o cliente não consegue gravar em nome de outro. Sem
-- sessão (SQL Editor, chave secret) fica o que estava.
create or replace function private.stamp_project_editor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is not null then
    new.updated_by := uid;
    new.updated_by_email := (select auth.jwt()) ->> 'email';
    if new.deleted_at is not null and (tg_op = 'INSERT' or old.deleted_at is null) then
      new.deleted_by := uid;
    end if;
  end if;
  if new.deleted_at is null then
    new.deleted_by := null;
  end if;
  return new;
end
$$;

create trigger projects_stamp_editor
before insert or update on public.projects
for each row execute function private.stamp_project_editor();

-- 2. RLS por time -------------------------------------------------------------------------------------------------

drop policy "team can read projects" on public.projects;
drop policy "team can create projects" on public.projects;
drop policy "team can update projects" on public.projects;
drop policy "team can delete projects" on public.projects;

create policy "members can read team projects"
on public.projects for select
to authenticated
using ((select private.is_team_member(team_id)));

create policy "members can create team projects"
on public.projects for insert
to authenticated
with check (owner_id = (select auth.uid()) and (select private.is_team_member(team_id)));

-- Editar, mandar para a lixeira e restaurar: qualquer membro. O `with check` impede levar o projeto a outro time.
create policy "members can update team projects"
on public.projects for update
to authenticated
using ((select private.is_team_member(team_id)))
with check ((select private.is_team_member(team_id)));

create policy "admins can delete trashed projects"
on public.projects for delete
to authenticated
using (deleted_at is not null and (select private.is_team_admin(team_id)));

-- 3. Histórico ----------------------------------------------------------------------------------------------------
-- O retrato guarda o projeto SEM `$panelizer` (a leitura da IA, centenas de KB, que não muda depois de criada) e
-- SEM `$underlay` (a planta de fundo em data URL, até ~400 KB): restaurar junta os dois da linha atual. Assim 20
-- retratos de um projeto ficam em dezenas de KB cada, não em 10 MB.

create table public.project_revisions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  revision integer not null check (revision >= 1),
  name text not null,
  data jsonb not null,
  saved_by uuid references auth.users (id) on delete set null,
  saved_by_email text,
  created_at timestamptz not null default now(),
  unique (project_id, revision)
);

create index project_revisions_project_idx on public.project_revisions (project_id, revision desc);

alter table public.project_revisions enable row level security;

create policy "members can read team project revisions"
on public.project_revisions for select
to authenticated
using ((select private.is_team_member(team_id)));

-- Sem insert/update/delete para o cliente: só o trigger escreve.

create or replace function private.snapshot_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  every constant integer := 20;
  keep constant integer := 20;
begin
  if tg_op = 'UPDATE' and (new.revision = old.revision or new.revision % every <> 0) then
    return new;
  end if;
  insert into public.project_revisions (project_id, team_id, revision, name, data, saved_by, saved_by_email)
  values (new.id, new.team_id, new.revision, new.name, new.data - '$panelizer' - '$underlay', new.updated_by, new.updated_by_email)
  on conflict (project_id, revision) do nothing;
  delete from public.project_revisions r
  where r.project_id = new.id
    and r.id not in (select r2.id from public.project_revisions r2 where r2.project_id = new.id order by r2.revision desc limit keep);
  return new;
end
$$;

create trigger projects_snapshot
after insert or update of revision on public.projects
for each row execute function private.snapshot_project();

-- 4. Bucket `drawings` --------------------------------------------------------------------------------------------
-- O caminho é `<uploadId>/<arquivo>`, sem o time: o envio sobe antes de o projeto existir. A RLS passa a exigir que
-- a pessoa esteja em algum time (quem sai do time perde o acesso); o isolamento entre times fica no id aleatório da
-- pasta. Com um time só, é o mesmo que antes. Pasta por time fica para quando houver um segundo time.

drop policy "team can read drawings" on storage.objects;
drop policy "team can upload drawings" on storage.objects;
drop policy "team can replace drawings" on storage.objects;
drop policy "team can delete drawings" on storage.objects;

create policy "team members can read drawings"
on storage.objects for select
to authenticated
using (bucket_id = 'drawings' and (select private.has_team()));

create policy "team members can upload drawings"
on storage.objects for insert
to authenticated
with check (bucket_id = 'drawings' and (select private.has_team()));

create policy "team members can replace drawings"
on storage.objects for update
to authenticated
using (bucket_id = 'drawings' and (select private.has_team()))
with check (bucket_id = 'drawings' and (select private.has_team()));

create policy "team members can delete drawings"
on storage.objects for delete
to authenticated
using (bucket_id = 'drawings' and (select private.has_team()));

-- 5. Órfãos: `$drawings` também segura a pasta ------------------------------------------------------------------
-- Mesma função de 20261104000100, com uma fonte a mais: os desenhos postos num projeto aberto de arquivo ou sample
-- ("Add drawings", S32) vão em `data -> '$drawings'`, não na leitura. Projeto na lixeira continua segurando.

create or replace function public.orphan_drawings(min_age interval default interval '24 hours')
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  with referenced as (
    select split_part(d ->> 'path', '/', 1) as folder
    from public.projects p
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p.data #> array['$panelizer', 'reading', 'drawings']) = 'array'
        then p.data #> array['$panelizer', 'reading', 'drawings'] else '[]'::jsonb end
    ) d
    union
    select split_part(d ->> 'path', '/', 1)
    from public.projects p
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p.data -> '$drawings') = 'array' then p.data -> '$drawings' else '[]'::jsonb end
    ) d
    union
    select split_part(d ->> 'path', '/', 1)
    from public.extraction_jobs j
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(j.result -> 'drawings') = 'array' then j.result -> 'drawings' else '[]'::jsonb end
    ) d
  ),
  folders as (
    select split_part(o.name, '/', 1) as folder, max(coalesce(o.updated_at, o.created_at)) as last_change
    from storage.objects o
    where o.bucket_id = 'drawings'
    group by 1
  )
  select o.name
  from storage.objects o
  join folders f on f.folder = split_part(o.name, '/', 1)
  where o.bucket_id = 'drawings'
    and f.last_change < now() - min_age
    and not exists (select 1 from referenced r where r.folder = f.folder)
  order by o.name;
$$;

revoke all on function public.orphan_drawings(interval) from public, anon, authenticated;

-- 6. Lixeira velha ------------------------------------------------------------------------------------------------
-- Apaga de vez o que está na lixeira há mais de `ttl`; os desenhos ficam órfãos e saem na varredura do bucket
-- (`sweep_orphan_drawings`). Só o dono do banco executa. Para o agendamento de 20261104000100 (comentado):
--   select cron.schedule('panelizer-drawings-cleanup', '17 7 * * *',
--     $job$ select public.sweep_trashed_projects(); select public.sweep_orphan_drawings(); select public.sweep_extraction_jobs(); $job$);
create or replace function public.sweep_trashed_projects(ttl interval default interval '30 days')
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.projects
    where deleted_at is not null and deleted_at < now() - ttl
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.sweep_trashed_projects(interval) from public, anon, authenticated;
