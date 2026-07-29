-- =============================================================
-- Migration 2026-07-29
-- feed_pratos_comentarios — nutri edita e apaga o próprio comentário
-- =============================================================
-- A v1 (2026-07-23_feed_pratos_comentarios.sql) saiu só com SELECT e
-- INSERT: uma vez enviado, o comentário da nutri não podia ser corrigido
-- nem removido. O grant de DELETE até existia, mas sem policy de DELETE
-- a RLS bloqueava todo delete — e de UPDATE não havia nem grant nem
-- policy.
--
-- Escopo: só o comentário da NUTRI (autor = 'nutri') e só nas pacientes
-- dela. O comentário da paciente segue imutável — se for pra liberar,
-- é outra migration.
--
-- Idempotente. Não altera a tabela: só policies e um grant.
-- =============================================================

-- 1. POLICIES --------------------------------------------------

-- Editar: só o próprio comentário. O USING controla quais linhas ela
-- enxerga pra editar; o WITH CHECK controla como a linha pode ficar
-- DEPOIS. Os dois juntos impedem que um update "sequestre" a linha —
-- virar autor = 'paciente', ou mover o comentário pra uma paciente de
-- outra nutri.
drop policy if exists fpc_update_nutri on public.feed_pratos_comentarios;
create policy fpc_update_nutri on public.feed_pratos_comentarios
  for update
  using (
    autor = 'nutri'
    and paciente_id in (select id from public.pacientes where nutri_id = auth.uid())
  )
  with check (
    autor = 'nutri'
    and paciente_id in (select id from public.pacientes where nutri_id = auth.uid())
  );

-- Apagar: mesma regra de posse
drop policy if exists fpc_delete_nutri on public.feed_pratos_comentarios;
create policy fpc_delete_nutri on public.feed_pratos_comentarios
  for delete
  using (
    autor = 'nutri'
    and paciente_id in (select id from public.pacientes where nutri_id = auth.uid())
  );

-- 2. GRANT -----------------------------------------------------
-- delete já foi concedido em 2026-07-23; falta o update.
-- Sem 'anon' de propósito: as duas policies exigem auth.uid(), então
-- anon não passaria de qualquer forma, e o grant a menos evita
-- superfície desnecessária.
grant update on public.feed_pratos_comentarios to authenticated, service_role;

-- 3. CONFERÊNCIA (read-only, rodar depois) ---------------------
-- Deve listar 5 linhas: fpc_select (SELECT), fpc_insert_paciente
-- (INSERT), fpc_insert_nutri (INSERT), fpc_update_nutri (UPDATE),
-- fpc_delete_nutri (DELETE).
--
-- select policyname, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'feed_pratos_comentarios'
-- order by policyname;
