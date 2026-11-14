drop trigger if exists consultas_agendada_por_tg on public.consultas;
drop function if exists public.consultas_carimba_agendada_por();
alter table public.consultas drop constraint if exists consultas_agendada_por_check;
alter table public.consultas drop column if exists agendada_por;
