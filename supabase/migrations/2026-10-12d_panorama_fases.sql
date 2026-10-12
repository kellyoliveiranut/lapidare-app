-- 2026-10-12d — Fase atual do "Panorama do tratamento" (1 a 6), definida só pela nutri.
-- Idempotente. Tabela nova; não mexe em dados existentes.
-- Desfazer: supabase/desfazer/2026-10-12d_panorama_fases_DESFAZER.sql

create table if not exists public.panorama_fases (
  paciente_id uuid primary key references public.pacientes(id) on delete cascade,
  nutri_id uuid not null references public.nutris(id) on delete cascade,
  fase smallint not null check (fase between 1 and 6),
  atualizado_em timestamptz not null default now()
);

alter table public.panorama_fases enable row level security;

drop policy if exists panorama_nutri_all on public.panorama_fases;
create policy panorama_nutri_all on public.panorama_fases
  for all
  using (nutri_id = auth.uid())
  with check (
    nutri_id = auth.uid()
    and exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
  );

-- A paciente só LÊ a própria fase; nunca grava.
drop policy if exists panorama_paciente_select on public.panorama_fases;
create policy panorama_paciente_select on public.panorama_fases
  for select
  using (paciente_id = public.minha_paciente_id());

create or replace function public.trg_panorama_fases_atualizado()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists panorama_fases_atualizado on public.panorama_fases;
create trigger panorama_fases_atualizado
  before insert or update on public.panorama_fases
  for each row execute function public.trg_panorama_fases_atualizado();
