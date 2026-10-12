-- DESFAZER da 2026-10-12d. NÃO colocar em supabase/migrations/. Apaga as fases definidas.
drop table if exists public.panorama_fases;
drop function if exists public.trg_panorama_fases_atualizado();
