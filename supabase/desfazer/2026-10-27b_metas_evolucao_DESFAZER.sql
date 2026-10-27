-- DESFAZER da 2026-10-27b. NÃO colocar em supabase/migrations/. Rodar só se for preciso reverter.
-- ATENÇÃO: apaga as metas já escolhidas para as pacientes. Tirar do app o uso da coluna antes.
drop trigger if exists trg_protege_metas_evolucao on public.pacientes;
drop function if exists public.protege_metas_evolucao();
alter table public.pacientes drop constraint if exists pacientes_metas_evolucao_tam_chk;
alter table public.pacientes drop column if exists metas_evolucao;
