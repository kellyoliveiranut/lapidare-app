-- =============================================================
-- Migration 2026-10-27b
-- pacientes.metas_evolucao — metas escolhidas pela nutri para a paciente
-- =============================================================
-- A nutri escolhe, num catálogo do app (src/lib/metasEvolucao.js), até 5 metas
-- para cada paciente; a paciente vê a lista na tela de evolução. Guarda só os
-- CÓDIGOS das metas (ex.: 'onco_atividade'), não o texto: o texto mora no
-- catálogo e pode ser revisado pela nutri sem mexer no banco. Código que o app
-- não conhece é ignorado na tela.
--
-- O recado livre (recado_evolucao, migration 2026-10-27) deixou de ser usado
-- pelo app a pedido da nutri. A coluna e o trigger continuam no banco, sem uso.
--
-- GUARD: pacientes_update deixa a paciente dar UPDATE na própria linha e RLS não
-- restringe coluna. Sem o trigger ela trocaria as próprias metas pela API.
-- Mesmo desenho de protege_recado_evolucao: só a nutri dona altera; auth.uid()
-- nulo (SQL Editor, service_role) passa de propósito.
--
-- Idempotente. Desfazer: supabase/desfazer/2026-10-27b_metas_evolucao_DESFAZER.sql
-- =============================================================

alter table public.pacientes
  add column if not exists metas_evolucao text[] not null default '{}';

alter table public.pacientes
  drop constraint if exists pacientes_metas_evolucao_tam_chk;
alter table public.pacientes
  add constraint pacientes_metas_evolucao_tam_chk
  check (coalesce(array_length(metas_evolucao, 1), 0) <= 5);

comment on column public.pacientes.metas_evolucao is
  'Códigos das metas escolhidas pela nutri (até 5), do catálogo src/lib/metasEvolucao.js. Só a nutri dona altera (trigger).';

create or replace function public.protege_metas_evolucao()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.nutri_id then
    raise exception 'Somente a nutricionista responsável pode alterar as metas da evolução.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_protege_metas_evolucao on public.pacientes;
create trigger trg_protege_metas_evolucao
  before update on public.pacientes
  for each row
  when (old.metas_evolucao is distinct from new.metas_evolucao)
  execute function public.protege_metas_evolucao();
