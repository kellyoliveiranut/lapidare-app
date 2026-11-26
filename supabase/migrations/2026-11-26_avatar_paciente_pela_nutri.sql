-- =============================================================
-- FOTO DA PACIENTE PELA NUTRI (perfil da paciente)
-- =============================================================
-- Até aqui só a própria paciente podia enviar a foto (policies do bucket
-- avatares_pacientes exigem a pasta dela). Estas três policies deixam a nutri
-- responsável enviar, trocar e remover a foto das SUAS pacientes. A pasta é
-- o id da ficha (pacientes.id), igual ao que o app da paciente já usa.
-- Leitura continua pública (bucket público), como antes.
--
-- Idempotente. Ctrl+A antes do Run. Desfazer:
--   supabase/desfazer/2026-11-26_avatar_paciente_pela_nutri_DESFAZER.sql
-- =============================================================
drop policy if exists avatares_pacientes_nutri_insert on storage.objects;
create policy avatares_pacientes_nutri_insert on storage.objects
  for insert with check (
    bucket_id = 'avatares_pacientes'
    and split_part(name, '/', 1) in (
      select p.id::text from public.pacientes p where p.nutri_id = auth.uid()
    )
  );

drop policy if exists avatares_pacientes_nutri_update on storage.objects;
create policy avatares_pacientes_nutri_update on storage.objects
  for update using (
    bucket_id = 'avatares_pacientes'
    and split_part(name, '/', 1) in (
      select p.id::text from public.pacientes p where p.nutri_id = auth.uid()
    )
  );

drop policy if exists avatares_pacientes_nutri_delete on storage.objects;
create policy avatares_pacientes_nutri_delete on storage.objects
  for delete using (
    bucket_id = 'avatares_pacientes'
    and split_part(name, '/', 1) in (
      select p.id::text from public.pacientes p where p.nutri_id = auth.uid()
    )
  );

-- Conferência: devem aparecer as 3 policies novas.
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'avatares_pacientes%' order by policyname;
