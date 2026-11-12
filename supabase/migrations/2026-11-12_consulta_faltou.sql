-- =============================================================
-- FALTOU — marca que a paciente não compareceu a uma consulta
-- =============================================================
-- Eixo próprio, igual à confirmação: NÃO mexe em `status`
-- (agendada|realizada|cancelada), então os filtros da Agenda, do relatório de
-- evolução e do banner da paciente seguem como estão. A consulta continua
-- 'agendada' com faltou_em preenchido. Aviso em cima da hora = cancelamento
-- (status 'cancelada'), não falta. Sem cobrança nem reposição.
--
-- RLS: nada a mudar (consultas_write_nutri já cobre colunas novas; a paciente
-- segue só com SELECT).
-- Aditivo e idempotente: colunas nuláveis, sem default e sem backfill.
-- Desfazer: supabase/desfazer/2026-11-12_consulta_faltou_DESFAZER.sql
-- =============================================================

alter table public.consultas add column if not exists faltou_em  timestamptz;
alter table public.consultas add column if not exists faltou_por text;

alter table public.consultas drop constraint if exists consultas_faltou_por_check;
alter table public.consultas
  add constraint consultas_faltou_por_check
  check (faltou_por is null or faltou_por in ('nutri'));

comment on column public.consultas.faltou_em is
  'Quando a nutri registrou que a paciente não veio. NULL = sem falta registrada. Independente de status.';

-- Reagendar (data_hora muda) apaga a falta: ela era sobre OUTRO horário.
-- Mesma ideia do consultas_limpa_confirmacao_tg. Se o próprio UPDATE mexe em
-- faltou_em, respeita o valor que veio.
create or replace function public.consultas_limpa_faltou()
returns trigger
language plpgsql
as $$
begin
  if new.data_hora is distinct from old.data_hora
     and new.faltou_em is not distinct from old.faltou_em then
    new.faltou_em  := null;
    new.faltou_por := null;
  end if;
  return new;
end;
$$;

drop trigger if exists consultas_limpa_faltou_tg on public.consultas;
create trigger consultas_limpa_faltou_tg
  before update of data_hora on public.consultas
  for each row
  execute function public.consultas_limpa_faltou();

-- Conferência
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='consultas'
--      and column_name in ('faltou_em','faltou_por');
