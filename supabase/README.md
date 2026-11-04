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
   `20261104000100_drawings_cleanup.sql` (limpeza do bucket; o agendamento fica desligado — ver abaixo), depois
   `20261104000200_teams.sql` e `20261104000300_projects_team.sql` (times, S32). (Com a CLI: `supabase link` e
   `supabase db push`.) Num projeto novo, faça os passos 5 e 6 ANTES das migrações da S32: o backfill põe no time
   as contas que já existem — conta criada depois entra pelo convite do app (`/app/account`).
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
- RLS (até a S32): qualquer usuário autenticado lê, cria (como autor), edita e apaga. **Desde a S32, por time** (abaixo).
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
- Times (S32, `20261104000200_teams.sql`): `teams` e `team_members` (`role` = `admin` | `editor`, `email` copiado
  para a lista). Checagens `private.is_team_member/is_team_admin/has_team/default_team_id` (schema `private`, fora
  da API). Um time sempre tem um admin (trigger `keep_one_admin`). `add_team_member(team, email, role)` põe no time
  uma conta que já existe (só admin). Backfill: time "National Lumber" com **todas as contas existentes como admin**.
- Projetos por time (S32, `20261104000300_projects_team.sql`): `team_id` (default = o time de quem grava),
  `updated_by`/`updated_by_email` (trigger, do JWT), lixeira `deleted_at`/`deleted_by`. Membro lê, cria, edita, manda
  para a lixeira e restaura; **apagar de vez só da lixeira e só admin**. `project_revisions`: retrato na criação e a
  cada 20 gravações (os 20 mais recentes), sem `$panelizer` nem `$underlay`; só leitura para o cliente.
  `sweep_trashed_projects(ttl)` apaga o que está na lixeira há 30 dias. Bucket `drawings`: só quem está num time.
  `orphan_drawings` também conta `data -> '$drawings'` (desenhos postos num projeto sem leitura).

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

## S32 — aplicar (passos do humano; nada disto foi aplicado)

**Antes do push do código da S32.** O deploy passa a depender destas migrações: a lista de projetos filtra por
`deleted_at` e o editor só grava em projeto fora da lixeira — sem as colunas, a lista e a gravação falham (o
`/api/health` raso continua verde; o `?deep=1` mostra o que falta). Ordem: as duas da S24 (seção acima), depois
estas duas.

1. SQL Editor → cole `migrations/20261104000200_teams.sql` → **Run**; depois `migrations/20261104000300_projects_team.sql`
   → **Run**. (Ou `supabase db push`.)
2. Conferir:
   - `select t.name, m.email, m.role from public.team_members m join public.teams t on t.id = m.team_id;` — todas as
     contas no "National Lumber" como admin. Rebaixe para editor quem não deve gerenciar o time (pela tela
     `/app/account` depois do deploy, ou `update public.team_members set role = 'editor' where email = '…';`).
   - `select count(*) from public.projects where team_id is null;` → 0.
   - **Database → Tables**: `teams`, `team_members`, `project_revisions` com RLS ligada; **Advisors → Security** sem
     aviso novo (as funções de `private` são `security definer` de propósito: o schema não é exposto pela API).
3. **Authentication → URL Configuration**: **Site URL** = a URL do Cloud Run (`https://panelizer-….run.app`); em
   **Redirect URLs** acrescente `https://panelizer-….run.app/auth/confirm**` e `http://localhost:3000/auth/confirm**`.
4. **Authentication → Emails → Templates** (os links do app abrem a sessão por `token_hash`, que funciona em qualquer
   navegador; o modelo padrão manda `code`, que só funciona no mesmo navegador que pediu):
   - **Invite user**: o link vira
     `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/app/account?welcome=1">Accept the invitation</a>`
   - **Reset password**: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/app/account?reset=1">Choose a new password</a>`
   - O e-mail embutido do Supabase manda poucos e-mails por hora (plano gratuito); para o time da fábrica basta. SMTP
     próprio é **Authentication → Emails → SMTP Settings**, se precisar.
5. **Convites para quem ainda não tem conta** (opcional; sem isto, o admin adiciona só contas já criadas no painel):
   **Settings → API Keys → Secret keys → New secret key** `panelizer-invites`, guardada no Secret Manager e montada
   no serviço como `SUPABASE_SECRET_KEY` (`docs/12-hospedagem-cloud-run.md`, "Chave secret do Supabase"). Só a action de
   convite a usa (`packages/web/src/lib/supabase/admin.ts`); localmente, a mesma variável no `packages/web/.env.local`.
6. Push / deploy. Conferir logado: `/api/health?deep=1` com `"supabase": "ok"`, `team` com o nome e o papel, e cada
   tabela `ok`. Depois: `/app/account` lista o time; um convite de teste chega e leva a `/app/account?welcome=1`.
7. (Opcional) Agendamento: trocar o job de limpeza para incluir a lixeira —
   `select cron.unschedule('panelizer-drawings-cleanup');` e
   `select cron.schedule('panelizer-drawings-cleanup', '17 7 * * *', $job$ select public.sweep_trashed_projects(); select public.sweep_orphan_drawings(); select public.sweep_extraction_jobs(); $job$);`

**Conta nova criada no painel** (Authentication → Users) depois da migração não entra em time sozinha: um admin a
adiciona em `/app/account` pelo e-mail. Até lá a pessoa entra no app, mas não vê nem grava projetos (a tela de conta
explica). **Tirar alguém do time** não apaga a conta nem impede o login; para bloquear de vez, apague ou bana o usuário
em Authentication → Users.

**Desfazer** (se precisar voltar ao código anterior à S32 com o banco já migrado): o código antigo funciona com as
colunas novas (ignora `deleted_at`), mas a RLS por time vale para ele também — quem não está em time não vê nada.

