-- S22.0 — projetos salvos (docs/03-sessoes.md, S22). Rodar no SQL Editor do painel do Supabase ou com
-- `supabase db push`. Ver supabase/README.md.
--
-- `data` é o conteúdo do arquivo `<slug>.panelizer.json` (lib/editor/project-file.ts): o JSON do CLI mais a
-- leitura da IA em `$panelizer`. O mesmo formato roda em `panelizer build` e reabre no app.
--
-- Acesso de time: todo usuário autenticado lê e edita todos os projetos — é uma fábrica só e os usuários são
-- convidados pelo painel; o autor fica registrado em owner_id / owner_email (decisão de 2026-10-22).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  owner_email text,
  name text not null check (char_length(name) between 1 and 200),
  data jsonb not null,
  -- Concorrência otimista (S22.1): o cliente manda a revisão que carregou; a gravação só passa se ainda for a atual.
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_updated_at_idx on public.projects (updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "team can read projects"
on public.projects for select
to authenticated
using (true);

create policy "team can create projects"
on public.projects for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "team can update projects"
on public.projects for update
to authenticated
using (true)
with check (true);

create policy "team can delete projects"
on public.projects for delete
to authenticated
using (true);
