# Supabase (S22)

Backend do app: login, tabela `projects` e, na S22.3, os desenhos no Storage. O esquema vive em
`supabase/migrations/*.sql`; o app lê as chaves de `packages/web/.env.local`.

## Projeto em uso

Criado em 2026-10-22 pelo conector MCP do Supabase: `panelizer`, ref `sulbendliqbfibvmzcpz`, região `us-east-1`,
organização "jphillipe's Org", plano gratuito. Migração `projects` aplicada e conferida (RLS ligada, sem avisos de
segurança). As chaves já estão em `packages/web/.env.local`; cadastro desligado e primeira conta criada no painel
(passos 5 e 6, que o conector não cobre). Login real conferido em 2026-10-23.

## Criar o projeto (uma vez)

1. Em [supabase.com](https://supabase.com) → **New project**: organização, nome (`panelizer`), senha do banco
   (guarde num gerenciador de senhas; o app não a usa) e região perto da fábrica (East US).
2. **Project Settings → API Keys**: copie a **Project URL** e a chave **publishable** (`sb_publishable_…`).
   A chave *secret* não entra no app.
3. Em `packages/web/.env.local` (fora do git):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
   ```
4. **SQL Editor → New query**: cole `supabase/migrations/20261022000000_projects.sql` e **Run**; depois
   `20261103000000_drawings.sql` (bucket dos desenhos), `20261104000000_extraction_jobs.sql` (leituras da IA) e
   `20261104000100_drawings_cleanup.sql` (limpeza do bucket; o agendamento fica desligado — ver abaixo). (Com a
   CLI: `supabase link` e `supabase db push`.)
5. **Authentication → Sign In / Providers → Email**: deixe ligado. Em **Authentication → Settings**, desligue
   **Allow new users to sign up** — o app não tem cadastro; as contas são criadas aqui.
6. **Authentication → Users → Add user → Create new user**: e-mail, senha e **Auto Confirm User** marcado.
   Uma conta por pessoa da equipe.
7. Reinicie `pnpm web`. `/app` passa a pedir login em `/login`.

## Sem as chaves

Sem `NEXT_PUBLIC_SUPABASE_URL` e a chave, o app roda **sem login** em desenvolvimento (testes, CLI, demo
local). Em produção (`NODE_ENV=production`) sem as chaves, `/app` é bloqueado e `/login` explica que o
login não foi configurado — para um deploy esquecido não expor a chave da API da Anthropic.

## O que o esquema define

- `projects`: `id`, `owner_id`/`owner_email` (quem criou), `name`, `data jsonb` (o `.panelizer.json` inteiro),
  `revision` (concorrência otimista), `created_at`, `updated_at` (trigger).
- RLS: qualquer usuário autenticado lê, cria (como autor), edita e apaga — acesso de time.
- Bucket `drawings` (S22.3, privado, 50 MB por objeto, só PDF e imagens): os desenhos do passo 01, uma pasta por
  envio (`<uploadId>/<arquivo>`), subidos direto do navegador; o projeto guarda os caminhos em
  `data -> '$panelizer' -> 'reading' -> 'drawings'`. RLS de time em `storage.objects` para esse bucket. Aplicada
  em 2026-11-03 pelo conector MCP.
- `extraction_jobs` (S24): uma leitura da IA por linha — `status`, `phase`, tokens, `message`, `result jsonb` (o
  resultado inteiro, entregue uma vez), `cancel_requested`, `created_at`/`updated_at` (trigger; batimento a cada
  ~5 s da instância que roda)/`ended_at`. **RLS por dono** (`owner_id = auth.uid()`), não de time: só quem disparou
  acompanha, cancela e recolhe. `sweep_extraction_jobs(ttl)` tira os sem atividade há 24 h (só o dono do banco).
- Limpeza de `drawings` (S24): `orphan_drawings(min_age)` lista os objetos de pastas sem referência em projeto nem
  em job guardado, paradas há mais de 24 h; `sweep_orphan_drawings()` apaga pela API de Storage (pg_net). Nenhuma
  das duas é executável por `authenticated`/`anon`.

## S24 — aplicar (passos do humano; nada disto foi aplicado)

**Antes do push do código da S24** (o deploy pelo Actions sai no push da `main`): sem a tabela, a leitura roda mas
o job não é gravado e, com uma instância, o F5 durante a leitura deixa de recolher o resultado.

1. SQL Editor → cole `migrations/20261104000000_extraction_jobs.sql` → **Run**. Depois
   `migrations/20261104000100_drawings_cleanup.sql` → **Run**. (Ou `supabase db push`.)
2. Conferir: **Database → Tables → extraction_jobs** com RLS ligada e 4 políticas; **Advisors → Security** sem aviso
   novo. `select * from public.orphan_drawings();` lista o que a limpeza apagaria (não apaga nada).
3. Push / deploy. Depois de uma leitura real, `select id, status, phase, output_tokens, updated_at from
   public.extraction_jobs order by created_at desc limit 5;` mostra a linha.
4. (Opcional) `--max-instances` acima de 1 — `docs/12-hospedagem-cloud-run.md`, "Mais de uma instância".

**Ligar a limpeza agendada** (quando quiser; até lá o bucket só cresce, como antes):

1. **Database → Extensions**: ligar `pg_net` e `pg_cron`.
2. **Settings → API Keys → Secret keys → New secret key** chamada `drawings-cleanup` (só para isto; a chave não
   entra no app nem no repositório).
3. SQL Editor (os valores vão só aqui):
   ```sql
   select vault.create_secret('https://sulbendliqbfibvmzcpz.supabase.co', 'project_url');
   select vault.create_secret('<sb_secret_… da chave drawings-cleanup>', 'drawings_cleanup_key');
   ```
4. Teste à mão: `select public.sweep_orphan_drawings();` (devolve quantos DELETE enfileirou) e, um minuto depois,
   `select status_code, error_msg from net._http_response order by created desc limit 20;` — esperado 200.
5. Agendar (o bloco comentado no fim de `20261104000100_drawings_cleanup.sql`):
   `select cron.schedule('panelizer-drawings-cleanup', '17 7 * * *', $job$ select public.sweep_orphan_drawings(); select public.sweep_extraction_jobs(); $job$);`
