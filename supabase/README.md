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
4. **SQL Editor → New query**: cole `supabase/migrations/20261022000000_projects.sql` e **Run**.
   (Com a CLI: `supabase link` e `supabase db push`.)
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
