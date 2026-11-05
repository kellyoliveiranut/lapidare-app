-- Hemograma completo (outros parâmetros) na oncologia: uma coluna jsonb com
-- Ht, hemácias, VCM, HCM, CHCM, RDW, eosinófilos, basófilos, monócitos e bastões.
-- Chaves em src/data/exames_referencia.js (CAMPOS_EXAME_EXTRA). Idempotente.
-- Desfazer: supabase/desfazer/2026-11-05_exames_valores_extra_DESFAZER.sql
alter table public.exames_laboratoriais
  add column if not exists valores_extra jsonb;
