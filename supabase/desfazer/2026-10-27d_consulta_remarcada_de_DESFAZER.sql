-- DESFAZER da 2026-10-27d. NÃO colocar em supabase/migrations/.
-- Some o registro de "era dia X". Antes, publicar o app sem remarcada_de.
alter table public.consultas drop column if exists remarcada_de;
