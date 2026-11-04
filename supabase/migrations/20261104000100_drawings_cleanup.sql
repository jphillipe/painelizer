-- S24 — lixo do bucket `drawings` (docs/03-sessoes.md, S24; docs/05-pendencias.md, "Storage"). Rodar DEPOIS de
-- 20261103000000_drawings.sql e 20261104000000_extraction_jobs.sql. Ver supabase/README.md.
--
-- O navegador sobe os desenhos ao bucket antes da leitura (uma pasta `<uploadId>/` por envio). Leitura cancelada,
-- falha, aba fechada antes de criar o projeto, "Start over": a pasta fica sem dono. Esta migração define:
--
--   1. `orphan_drawings(min_age)`: os objetos de pastas que nenhum projeto referencia
--      (`projects.data -> '$panelizer' -> 'reading' -> 'drawings'[*].path`) nem nenhum job de leitura guardado
--      (`extraction_jobs.result -> 'drawings'`), cuja última mudança tem mais de `min_age` (24 h). Só lê.
--   2. `sweep_orphan_drawings(min_age, max_objects)`: apaga esses objetos PELA API DE STORAGE (pg_net, um DELETE
--      por objeto), não por `delete from storage.objects` — apagar a linha por SQL deixa o arquivo no disco do
--      Storage, inacessível e cobrado (docs do Supabase, "Delete Objects"). Precisa de pg_net e de dois segredos
--      no Vault (abaixo). Devolve quantos pedidos de DELETE enfileirou.
--   3. O agendamento diário (pg_cron), COMENTADO no fim: só ligar depois de conferir `orphan_drawings()` à mão.
--
-- Janela de 24 h: um envio vira projeto em minutos (leitura de ~10 min + criação); 24 h cobre leitura retomada
-- depois de F5, job guardado (TTL de 24 h, 20261104000000) e quem fecha o notebook no meio. Uma sessão só no
-- navegador (projeto nunca gravado no banco) perde a planta de fundo depois de 24 h; com o Supabase ligado o app
-- grava o projeto ao abrir a leitura, então isso só acontece se a gravação falhar.

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

-- Segredos esperados no Vault (criar uma vez no SQL Editor; NUNCA neste arquivo):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<chave secret sb_secret_…>', 'drawings_cleanup_key');
-- A chave vai só no cabeçalho `apikey` (chave secret não é JWT; não vai em Authorization).
create or replace function public.sweep_orphan_drawings(min_age interval default interval '24 hours', max_objects integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  key text := (select decrypted_secret from vault.decrypted_secrets where name = 'drawings_cleanup_key');
  obj record;
  queued integer := 0;
begin
  if base is null or key is null then
    raise exception 'sweep_orphan_drawings: faltam os segredos project_url e drawings_cleanup_key no Vault';
  end if;
  for obj in select o.name from public.orphan_drawings(min_age) o limit max_objects loop
    -- Os nomes saem de `safeDrawingName` (lib/drawings.ts): só A-Z a-z 0-9 . _ - e uma barra. Outro formato não é
    -- deste app; fica para um humano olhar.
    continue when obj.name !~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$';
    perform net.http_delete(
      url := rtrim(base, '/') || '/storage/v1/object/drawings/' || obj.name,
      headers := jsonb_build_object('apikey', key),
      timeout_milliseconds := 10000
    );
    queued := queued + 1;
  end loop;
  return queued;
end
$$;

revoke all on function public.sweep_orphan_drawings(interval, integer) from public, anon, authenticated;

-- Agendamento (NÃO ATIVO). Para ligar, no SQL Editor, depois de conferir `select * from public.orphan_drawings();`:
--   create extension if not exists pg_net;
--   create extension if not exists pg_cron;
--   -- os dois segredos do Vault acima
--   select cron.schedule('panelizer-drawings-cleanup', '17 7 * * *',
--     $job$ select public.sweep_orphan_drawings(); select public.sweep_extraction_jobs(); $job$);
-- 07:17 UTC = madrugada nos EUA (fábrica), fora do horário de uso. Conferir depois:
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select status_code, error_msg, created from net._http_response order by created desc limit 20;
-- Desligar: select cron.unschedule('panelizer-drawings-cleanup');
