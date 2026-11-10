-- Desfaz 2026-11-10_lembretes_nutri_obs.sql. APAGA as observações já gravadas nas tarefas.
alter table public.lembretes_nutri drop column if exists obs;
