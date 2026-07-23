-- =============================================================
-- Migration 2026-07-23
-- Marca quais suplementos são fórmulas manipuladas (vão pra farmácia)
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================

-- 1. Coluna: só os manipulados entram no envio à farmácia
alter table public.suplementos
  add column if not exists manipulado boolean not null default false;

-- 2. Backfill dos já cadastrados (Lipeshot / Moroshot)
update public.suplementos
set manipulado = true
where manipulado = false
  and (nome ilike '%lipeshot%' or nome ilike '%moroshot%');
