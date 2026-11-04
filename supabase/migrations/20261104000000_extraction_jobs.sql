-- S24 — leituras da IA no banco (docs/03-sessoes.md, S24; diagnóstico A7 em docs/13-revisao-2026-11.md). Rodar no
-- SQL Editor do painel do Supabase ou com `supabase db push`, DEPOIS de 20261022000000_projects.sql (usa a função
-- `set_updated_at` de lá). Ver supabase/README.md.
--
-- Uma leitura dura ~10 min e custa ~US$ 1,50. Até a S24 o job (progresso e resultado) vivia num Map na memória do
-- servidor: deploy ou restart no meio perdia o resultado, e o Cloud Run tinha de rodar com uma instância só. Aqui o
-- job vira uma linha: a instância que roda a leitura grava o progresso com moderação (a cada ~5 s, não a cada
-- token) e o resultado no fim; qualquer instância responde ao progresso, ao cancelamento e à coleta do resultado.
--
-- Acesso POR DONO (não de time, como `projects`): o resultado ainda não é projeto de ninguém; só quem disparou a
-- leitura acompanha, cancela e recolhe. O app usa a sessão do usuário (chave publicável + cookie), nunca a secret.

create table public.extraction_jobs (
  -- Gerado no navegador (`crypto.randomUUID()`), para a tela acompanhar a leitura antes de a action responder.
  id text primary key check (id ~ '^[A-Za-z0-9-]{8,64}$'),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'cancelled')),
  phase text not null default 'preparing' check (phase in ('preparing', 'waiting', 'reading')),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- Mensagem de erro/cancelamento (status failed/cancelled).
  message text,
  -- O `ExtractOutcome` inteiro (packages/web/src/types/extract.ts), sucesso ou falha; entregue uma vez.
  result jsonb,
  -- Cancelar pode cair noutra instância: ela marca aqui, e a que roda a leitura aborta no próximo batimento.
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  -- Batimento: a instância que roda grava a cada ~5 s. `running` parado há minutos = a instância morreu.
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create index extraction_jobs_owner_idx on public.extraction_jobs (owner_id, updated_at desc);
create index extraction_jobs_updated_at_idx on public.extraction_jobs (updated_at);

create trigger extraction_jobs_set_updated_at
before update on public.extraction_jobs
for each row execute function public.set_updated_at();

alter table public.extraction_jobs enable row level security;

create policy "owner can read extraction jobs"
on public.extraction_jobs for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "owner can create extraction jobs"
on public.extraction_jobs for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "owner can update extraction jobs"
on public.extraction_jobs for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "owner can delete extraction jobs"
on public.extraction_jobs for delete
to authenticated
using (owner_id = (select auth.uid()));

-- Varredura global (o app só varre os jobs do próprio dono ao abrir uma leitura nova): tira os terminados há mais de
-- `ttl` e os `running` sem batimento há mais de `ttl` (instância morta). Chamada pelo agendamento de
-- 20261104000100_drawings_cleanup.sql (comentado). Só o dono do banco executa.
create or replace function public.sweep_extraction_jobs(ttl interval default interval '24 hours')
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.extraction_jobs
    where coalesce(ended_at, updated_at) < now() - ttl
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.sweep_extraction_jobs(interval) from public, anon, authenticated;
