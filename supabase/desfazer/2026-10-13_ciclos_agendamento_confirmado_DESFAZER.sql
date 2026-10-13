-- DESFAZER da 2026-10-13. NÃO colocar em supabase/migrations/. Rodar só se for preciso reverter.
-- ATENÇÃO: apaga as confirmações de data já gravadas (quando, quem e fonte). As datas dos ciclos não mudam.
drop trigger if exists trg_ciclos_agendamento_auditoria on public.ciclos_quimio;
drop function if exists public.ciclos_agendamento_auditoria();
alter table public.ciclos_quimio drop constraint if exists ciclos_quimio_agendamento_conferencia_chk;
alter table public.ciclos_quimio
  drop column if exists agendamento_confirmado_em,
  drop column if exists agendamento_confirmado_por,
  drop column if exists agendamento_confirmado_fonte;
