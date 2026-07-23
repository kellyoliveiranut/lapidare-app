-- =============================================================
-- Migration 2026-07-23
-- chat_anexos — envio de foto no chat (paciente <-> nutri)
-- =============================================================
-- Imagem opcional em mensagens + bucket privado com policies de 3 ramos
-- (auth.uid / user_id da paciente / nutri responsável), mesmo padrão do
-- 2026-07-23_fix_fotos_evolucao_storage_select.sql. Idempotente.
-- =============================================================

-- 1. MENSAGENS: imagem opcional; texto deixa de ser obrigatório -------
alter table public.mensagens add column if not exists imagem_path text;
alter table public.mensagens alter column texto drop not null;
alter table public.mensagens drop constraint if exists mensagens_conteudo_check;
alter table public.mensagens add constraint mensagens_conteudo_check
  check (texto is not null or imagem_path is not null);

-- 2. BUCKET privado pra anexos do chat --------------------------------
insert into storage.buckets (id, name, public)
values ('chat_anexos', 'chat_anexos', false)
on conflict (id) do nothing;

-- 3. POLICIES do bucket -----------------------------------------------
-- Pasta do arquivo = pacientes.id (a "dona" da conversa).
-- SELECT/DELETE: 3 ramos. INSERT: por papel (paciente user_id / nutri).

drop policy if exists chat_anexos_storage_select on storage.objects;
create policy chat_anexos_storage_select on storage.objects
  for select using (
    bucket_id = 'chat_anexos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(name, '/', 1) in (select id::text from public.pacientes where user_id  = auth.uid())
      or split_part(name, '/', 1) in (select id::text from public.pacientes where nutri_id = auth.uid())
    )
  );

drop policy if exists chat_anexos_storage_insert_paciente on storage.objects;
create policy chat_anexos_storage_insert_paciente on storage.objects
  for insert with check (
    bucket_id = 'chat_anexos'
    and split_part(name, '/', 1) in (select id::text from public.pacientes where user_id = auth.uid())
  );

drop policy if exists chat_anexos_storage_insert_nutri on storage.objects;
create policy chat_anexos_storage_insert_nutri on storage.objects
  for insert with check (
    bucket_id = 'chat_anexos'
    and split_part(name, '/', 1) in (select id::text from public.pacientes where nutri_id = auth.uid())
  );

drop policy if exists chat_anexos_storage_delete on storage.objects;
create policy chat_anexos_storage_delete on storage.objects
  for delete using (
    bucket_id = 'chat_anexos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(name, '/', 1) in (select id::text from public.pacientes where user_id  = auth.uid())
      or split_part(name, '/', 1) in (select id::text from public.pacientes where nutri_id = auth.uid())
    )
  );
