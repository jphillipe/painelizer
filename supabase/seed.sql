-- Seed do Supabase local (S33). Roda depois das migrações em `supabase start` e `supabase db reset`; nunca no
-- projeto real (o `db push` não manda seed).
--
-- A migração 20261104000200 já cria o time "National Lumber" (vazio num banco novo). Aqui entra um segundo time,
-- "Rival Framing", com id fixo, para os testes de RLS conferirem que um time não vê os projetos do outro.
--
-- As contas (admin, editor, sem time, do time rival) NÃO são inseridas aqui: `auth.users` é tabela interna do
-- Supabase Auth (colunas de token que não aceitam NULL, `auth.identities`, hash da senha), e um INSERT à mão quebra
-- quando a CLI troca a versão do Auth. `packages/web/testing/local-supabase.ts` (`seedAccounts`) as cria pela API
-- de admin, idempotente, e põe cada uma no seu time — chamado pelo setup do Playwright e dos testes de integração.

insert into public.teams (id, name)
values ('5eed0000-0000-4000-8000-000000000001', 'Rival Framing')
on conflict (id) do nothing;
