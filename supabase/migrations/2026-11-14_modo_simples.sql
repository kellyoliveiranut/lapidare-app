-- =============================================================
-- MODO SIMPLES — versão enxuta do app para pacientes que preferem
-- menos opções (letra maior, 4 botões grandes). Ligado pela nutri
-- na ficha da paciente. Aditivo e idempotente; não mexe em RLS
-- (a nutri já atualiza `pacientes` pelas políticas atuais).
-- Desfazer: supabase/desfazer/2026-11-14_modo_simples_DESFAZER.sql
-- =============================================================
alter table public.pacientes
  add column if not exists modo_simples boolean not null default false;
