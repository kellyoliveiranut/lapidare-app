-- DESFAZER da 2026-10-27e. NÃO colocar em supabase/migrations/.
-- Publicar antes o app sem primeiro_horario_tarde (o select da Agenda a lê).
alter table public.locais_atendimento drop constraint if exists locais_primeiro_horario_tarde_chk;
alter table public.locais_atendimento drop column if exists primeiro_horario_tarde;
