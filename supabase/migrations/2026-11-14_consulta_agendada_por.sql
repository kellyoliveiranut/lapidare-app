-- =============================================================
-- AGENDADA POR — registra quem criou a consulta: a nutri ou a secretária
-- =============================================================
-- Carimbado pelo BANCO na criação (não dá para o app informar outro valor) e
-- nunca muda depois (remarcar/editar não troca o "quem agendou").
--   'nutri'      = a Dra. logada
--   'secretaria' = a secretária ativa logada
--   null         = consultas antigas, criadas pelo sistema (sem login) ou pela paciente
-- Depende do passo 1 da secretária (função nutri_efetiva()).
-- Aditivo e idempotente. Desfazer: supabase/desfazer/2026-11-14_consulta_agendada_por_DESFAZER.sql
-- =============================================================
alter table public.consultas add column if not exists agendada_por text;

alter table public.consultas drop constraint if exists consultas_agendada_por_check;
alter table public.consultas
  add constraint consultas_agendada_por_check check (agendada_por in ('nutri','secretaria'));

create or replace function public.consultas_carimba_agendada_por()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.agendada_por := old.agendada_por;       -- imutável depois de criada
    return new;
  end if;
  if auth.uid() is null then
    new.agendada_por := null;                   -- sistema (service_role, SQL Editor)
  elsif auth.uid() = new.nutri_id then
    new.agendada_por := 'nutri';
  elsif public.nutri_efetiva() = new.nutri_id then
    new.agendada_por := 'secretaria';
  else
    new.agendada_por := null;                   -- paciente ou outro
  end if;
  return new;
end;
$$;

drop trigger if exists consultas_agendada_por_tg on public.consultas;
create trigger consultas_agendada_por_tg
  before insert or update on public.consultas
  for each row execute function public.consultas_carimba_agendada_por();
