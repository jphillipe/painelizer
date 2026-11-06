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
   `20261104000200_teams.sql` e `20261104000300_projects_team.sql` (times, S32), depois
   `20261106000000_accounts.sql` (nome, desativar e convites por link, S41). (Com a CLI: `supabase link` e
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
- Contas (S41, `20261106000000_accounts.sql`): `team_members.name` (nome de exibição; admin muda o de qualquer um,
  cada pessoa o próprio por `set_my_name`) e `team_members.disabled_at` (desativado pelo admin: fora de todas as
  checagens de `private`, na hora; só o servidor grava, com a chave secret, junto com o ban no Auth). Grant por
  coluna: `authenticated` só atualiza `role` e `name`. O último admin **ativo** não sai, não é rebaixado nem
  desativado. `team_invites`: convite por link — o banco guarda só o sha256 do token (`token_hash`), validade de 7
  dias, um pendente por e-mail e time; o admin lê, cria e revoga (grant só em `revoked_at`); aceitar é do servidor.

## S24 — aplicar (aplicado em 2026-11-05 pelo conector MCP)

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

## S32 — aplicar (migrações aplicadas em 2026-11-05 pelo conector MCP)

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
_Desde a S41 os passos 3 e 4 só servem ao "esqueci a senha" por e-mail do `/login` (e o e-mail embutido do Supabase
só entrega a membros da organização no Supabase); convite e link de nova senha saem do app, sem e-mail. O passo 5
(chave secret) passou a ser necessário para convidar quem não tem conta e para gerir contas — ver "S41 — aplicar"._

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

## S41 — aplicar (contas geridas pelo admin e convites por link)

**Antes do push do código da S41**: a tela de conta lê `team_members.name`/`disabled_at` e `team_invites` — sem a
migração, `/app/account` diz para aplicá-la (a lista de projetos e o editor não dependem dela).

1. `migrations/20261106000000_accounts.sql` (SQL Editor → Run, `supabase db push` ou o conector MCP).
2. Conferir: `select email, role, name, disabled_at from public.team_members;` (ninguém desativado);
   **Database → Tables → team_invites** com RLS e 3 políticas; **Advisors → Security** sem aviso novo.
3. **Chave secret** (necessária para o convite por link, o link de nova senha, desativar e apagar): Settings → API Keys
   → Secret keys → **New secret key** `panelizer-invites`, montada no Cloud Run como `SUPABASE_SECRET_KEY`
   (`docs/12-hospedagem-cloud-run.md`, "Chave secret do Supabase"). `/api/health` passa a dizer `"invites": true`.
4. Push / deploy. Conferir logado como admin em `/app/account`: "Add someone" com um e-mail sem conta mostra o link;
   aberto numa janela anônima, `/invite/<token>` cria a conta e entra; no menu da pessoa, "Disable account…" barra o
   login, "Enable account" devolve, "Password reset link" abre a conta dela em `/app/account?reset=1`.

Como funciona: o link do convite é `<site>/invite/<token>` (token de 32 bytes; o banco guarda o hash, então o link
aparece uma vez — perdeu, "New link"). Quem abre escolhe nome e senha; o servidor marca o convite como aceito
(atômico), cria a conta já confirmada (`auth.admin.createUser`; funciona com o cadastro público desligado) e põe no
time. O link de nova senha é o `hashed_token` de `auth.admin.generateLink` levado direto ao `/auth/confirm`; vale
pela expiração de OTP do Auth (1 hora por padrão; **Authentication → Providers → Email → Email OTP Expiration** muda).
Desativar = ban no Auth + `disabled_at`. Apagar = `auth.admin.deleteUser` (os projetos ficam; autor vira vazio). A
chave nunca age sobre a própria conta de quem pede nem sobre conta que esteja em outro time.

## Testes contra o Supabase local (S33)

`supabase/config.toml` + `supabase/seed.sql` descrevem um Supabase **local** (Docker) só para testes e
desenvolvimento: `supabase start` sobe Postgres 17, Auth, PostgREST e Storage, aplica `migrations/*.sql` em ordem e
roda o seed (o time "Rival Framing", para os testes de RLS entre times). Nada disto toca o projeto real — não há
`supabase link` e o `db push` não manda seed.

- **Contas de teste**: `admin@panelizer.test` (admin do "National Lumber"), `editor@panelizer.test` (editor),
  `outsider@panelizer.test` (sem time), `rival@panelizer.test` (admin do "Rival Framing"), todas com a senha
  `panelizer-local-only`. Criadas pela API de admin com a chave secret LOCAL (`packages/web/testing/local-supabase.ts`,
  `seedAccounts`), não por INSERT em `auth.users` — tabela interna do Auth que muda entre versões da CLI. O setup do
  Playwright e cada arquivo de integração chamam `seedAccounts`, que também desfaz o que um teste interrompido deixou.
- **Chaves**: `supabase status -o env | node packages/web/testing/supabase-env.mjs` imprime `TEST_SUPABASE_URL`,
  `TEST_SUPABASE_PUBLISHABLE_KEY` e `TEST_SUPABASE_SECRET_KEY` (no CI vão para `$GITHUB_ENV`; no Git Bash,
  `eval "$(… --export)"`). A URL precisa ser da máquina (`127.0.0.1`/`localhost`): os testes recusam outra, para uma
  chave copiada do `.env.local` nunca apagar dados reais.
- **Rodar**: `pnpm test:integration` (adaptadores `projects-table`, `team-table`, `drawings-store` e as políticas de
  RLS direto pelo cliente) e `pnpm e2e` (Playwright: login, sample, editar, F5, gerar, PDF, lista e lixeira). Sem as
  variáveis, a integração pula tudo e o e2e roda só os fluxos sem login.
- **Caixa de e-mail**: convites e "esqueci a senha" chegam no Mailpit, `http://127.0.0.1:54324`.
- **CI**: job `e2e` em `.github/workflows/ci.yml` (CLI 3.0.0, `supabase start` sem Studio/Realtime/Edge, `supabase stop
  --no-backup` no fim). Só confere o que o banco local aceita: o projeto real ainda precisa das migrações aplicadas à
  mão (seções "S24 — aplicar" e "S32 — aplicar").
