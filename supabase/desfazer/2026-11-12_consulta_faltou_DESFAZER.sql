-- Desfaz 2026-11-12_consulta_faltou.sql (apaga as marcações de falta).
drop trigger if exists consultas_limpa_faltou_tg on public.consultas;
drop function if exists public.consultas_limpa_faltou();
alter table public.consultas drop constraint if exists consultas_faltou_por_check;
alter table public.consultas drop column if exists faltou_por;
alter table public.consultas drop column if exists faltou_em;
