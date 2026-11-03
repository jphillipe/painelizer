-- S22.3 — desenhos no Storage (docs/03-sessoes.md, S22.3). Rodar no SQL Editor do painel do Supabase ou com
-- `supabase db push`. Ver supabase/README.md.
--
-- Bucket privado `drawings`: os PDFs e imagens do passo 01, uma pasta por envio (`<uploadId>/<arquivo>`), subidos
-- direto do navegador (o pedido não passa pelo app, então o teto de 32 MB por pedido do Cloud Run não vale aqui).
-- O projeto guarda os caminhos em `data -> '$panelizer' -> 'reading' -> 'drawings'`. Painéis gerados não ficam
-- aqui: são reproduzíveis a partir do projeto.
--
-- 50 MB por arquivo é o teto do plano gratuito do Supabase (um objeto); acima disso é plano Pro com upload
-- retomável. Tipos: só o que o extract lê.
--
-- Acesso de time, como em `projects`: todo usuário autenticado lê, sobe, troca e apaga qualquer desenho.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drawings', 'drawings', false, 52428800, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "team can read drawings"
on storage.objects for select
to authenticated
using (bucket_id = 'drawings');

create policy "team can upload drawings"
on storage.objects for insert
to authenticated
with check (bucket_id = 'drawings');

create policy "team can replace drawings"
on storage.objects for update
to authenticated
using (bucket_id = 'drawings')
with check (bucket_id = 'drawings');

create policy "team can delete drawings"
on storage.objects for delete
to authenticated
using (bucket_id = 'drawings');
