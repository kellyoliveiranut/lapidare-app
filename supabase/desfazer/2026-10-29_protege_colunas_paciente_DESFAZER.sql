-- DESFAZER da 2026-10-29. NÃO colocar em supabase/migrations/.
drop trigger if exists trg_protege_colunas_paciente on public.pacientes;
drop function if exists public.protege_colunas_paciente();
