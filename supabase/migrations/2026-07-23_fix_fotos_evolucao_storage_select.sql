-- =============================================================
-- Migration 2026-07-23
-- Fix: fotos de evolução invisíveis para paciente de cadastro manual
-- =============================================================
-- As policies de SELECT e DELETE do bucket fotos_evolucao comparavam
-- a pasta do arquivo com auth.uid(), mas o upload grava sob
-- pacientes.id (Progresso.jsx:393). Para paciente de cadastro manual
-- (nutri cria primeiro, paciente ativa por token) vale
-- pacientes.id ≠ auth.uid() → ela sobe a foto e não consegue vê-la.
--
-- O INSERT já usa o subselect por user_id (§16.9) — por isso o upload
-- funciona e só a leitura falhava. Aqui adicionamos o mesmo ramo por
-- user_id ao SELECT e ao DELETE. Nenhum ramo é removido: ninguém que
-- hoje enxerga perde acesso. Mesma classe de correção que a §16.9 fez
-- no bucket fotos_pratos.
--
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================


-- ── SELECT ────────────────────────────────────────────────────
drop policy if exists fotos_evolucao_storage_select on storage.objects;
create policy fotos_evolucao_storage_select on storage.objects
  for select using (
    bucket_id = 'fotos_evolucao'
    and (
      -- paciente cujo pacientes.id = auth.uid() (cadastro próprio / backfill)
      split_part(name, '/', 1) = auth.uid()::text
      -- paciente de cadastro manual/lote: pacientes.id ≠ auth.uid()  [RAMO NOVO]
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where user_id = auth.uid()
      )
      -- nutri responsável
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where nutri_id = auth.uid()
      )
    )
  );


-- ── DELETE ────────────────────────────────────────────────────
drop policy if exists fotos_evolucao_storage_delete on storage.objects;
create policy fotos_evolucao_storage_delete on storage.objects
  for delete using (
    bucket_id = 'fotos_evolucao'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      -- [RAMO NOVO]
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where user_id = auth.uid()
      )
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where nutri_id = auth.uid()
      )
    )
  );
