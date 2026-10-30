-- Andamento das metas da paciente: um registro por meta e por semana ("cumpri esta semana").
-- A paciente marca; a nutri apenas acompanha. Sem prazo, sem número-alvo (CFN 856).
-- Idempotente. Desfazer: supabase/desfazer/2026-10-30_metas_cumprimento_DESFAZER.sql

create table if not exists public.metas_cumprimento (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  meta_id     text not null check (char_length(meta_id) between 1 and 60),
  semana      date not null,                 -- segunda-feira da semana
  created_at  timestamptz not null default now(),
  unique (paciente_id, meta_id, semana)
);
create index if not exists metas_cumprimento_paciente_idx
  on public.metas_cumprimento(paciente_id, semana desc);

alter table public.metas_cumprimento enable row level security;

-- A paciente lê e escreve só o que é dela; a nutri lê o das suas pacientes.
drop policy if exists metas_cumprimento_select on public.metas_cumprimento;
create policy metas_cumprimento_select on public.metas_cumprimento for select using (
  paciente_id = auth.uid()
  or exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
);
drop policy if exists metas_cumprimento_write_paciente on public.metas_cumprimento;
create policy metas_cumprimento_write_paciente on public.metas_cumprimento for all
  using (paciente_id = auth.uid()) with check (paciente_id = auth.uid());

grant select, insert, update, delete on public.metas_cumprimento to authenticated, service_role;
