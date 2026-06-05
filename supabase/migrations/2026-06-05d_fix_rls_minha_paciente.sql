-- =============================================================
-- Migration 2026-06-05d
-- Corrige RLS para usar minha_paciente_id() em todas as tabelas
-- que ainda usavam paciente_id = auth.uid() diretamente.
-- Necessário para pacientes criadas via cadastro manual (nutri
-- cria primeiro, depois a paciente ativa via token), onde
-- pacientes.id ≠ auth.uid().
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================


-- ── EBOOKS ────────────────────────────────────────────────────

drop policy if exists ebooks_select on public.ebooks;
create policy ebooks_select on public.ebooks
  for select using (
    nutri_id = auth.uid()
    or exists (
      select 1 from public.ebooks_pacientes ep
      where ep.ebook_id = id
        and (ep.paciente_id = auth.uid()
             or ep.paciente_id = public.minha_paciente_id())
    )
  );

drop policy if exists ebooks_pacientes_select on public.ebooks_pacientes;
create policy ebooks_pacientes_select on public.ebooks_pacientes
  for select using (
    paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
    or exists (
      select 1 from public.ebooks e
      where e.id = ebook_id and e.nutri_id = auth.uid()
    )
  );

-- Storage: paciente pode baixar arquivos dos seus ebooks
drop policy if exists ebooks_storage_select on storage.objects;
create policy ebooks_storage_select on storage.objects
  for select using (
    bucket_id = 'ebooks'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1 from public.ebooks e
        join public.ebooks_pacientes ep on ep.ebook_id = e.id
        where e.storage_path = name
          and (ep.paciente_id = auth.uid()
               or ep.paciente_id = public.minha_paciente_id())
      )
    )
  );


-- ── TREINOS ───────────────────────────────────────────────────

drop policy if exists "nutri_all_treinos_prescritos" on public.treinos_prescritos;
create policy "nutri_all_treinos_prescritos" on public.treinos_prescritos
  for all using (
    nutri_id = auth.uid()
    or paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
  );

drop policy if exists "paciente_own_treinos_registros" on public.treinos_registros;
create policy "paciente_own_treinos_registros" on public.treinos_registros
  for all using (
    paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
  );


-- ── SUPLEMENTOS ───────────────────────────────────────────────

drop policy if exists suplementos_select on public.suplementos;
create policy suplementos_select on public.suplementos
  for select using (
    paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
    or nutri_id = auth.uid()
  );

drop policy if exists suplementos_logs_select on public.suplementos_logs;
create policy suplementos_logs_select on public.suplementos_logs
  for select using (
    paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
    or exists (
      select 1 from public.pacientes p
      where p.id = paciente_id and p.nutri_id = auth.uid()
    )
  );

drop policy if exists suplementos_logs_write_paciente on public.suplementos_logs;
create policy suplementos_logs_write_paciente on public.suplementos_logs
  for all
  using (
    paciente_id = auth.uid() or paciente_id = public.minha_paciente_id()
  )
  with check (
    paciente_id = auth.uid() or paciente_id = public.minha_paciente_id()
  );
