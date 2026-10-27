-- DESFAZER da 2026-10-27f. NÃO colocar em supabase/migrations/.
-- Antes: remover a função volta-ao-app do netlify.toml e publicar.
alter table public.pacientes drop column if exists volta_app_envios;
alter table public.pacientes drop column if exists volta_app_enviado_em;
