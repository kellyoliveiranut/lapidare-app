-- Executar APÓS revisão. O front novo lê estas colunas: aplicar a migração ANTES de publicar o front.
--
-- Confirmação da data de uma aplicação futura (decisão da Kelly, 13/10/2026).
-- Distingue data PREVISTA (linha cadastrada, não confirmada), AGENDADA
-- (confirmada com a equipe/hospital) e REALIZADA (data_quimio <= hoje).
-- Só acrescenta colunas, um check e um gatilho. Nenhuma linha existente é
-- alterada: as três colunas nascem nulas = "não confirmada".
alter table public.ciclos_quimio
  add column if not exists agendamento_confirmado_em timestamptz,
  add column if not exists agendamento_confirmado_por text,
  add column if not exists agendamento_confirmado_fonte text;

comment on column public.ciclos_quimio.agendamento_confirmado_em is
  'Data confirmada com equipe/hospital; preenchida pelo gatilho; nula = prevista (não confirmada).';
comment on column public.ciclos_quimio.agendamento_confirmado_por is
  'Nome e registro profissional de quem conferiu a data com a equipe/hospital; digitado na confirmação.';
comment on column public.ciclos_quimio.agendamento_confirmado_fonte is
  'Fonte da conferência da data (contato com a equipe, agendamento do hospital); digitada na confirmação.';

-- Os três nulos, ou os três preenchidos. Mesmos limites do
-- trat_onco_registro_conferencia_chk (2026-10-12b): por 5–120, fonte 5–300.
alter table public.ciclos_quimio
  drop constraint if exists ciclos_quimio_agendamento_conferencia_chk;
alter table public.ciclos_quimio
  add constraint ciclos_quimio_agendamento_conferencia_chk check (
    (
      agendamento_confirmado_em is null
      and agendamento_confirmado_por is null
      and agendamento_confirmado_fonte is null
    )
    or (
      agendamento_confirmado_em is not null
      and char_length(btrim(coalesce(agendamento_confirmado_por, ''))) between 5 and 120
      and char_length(btrim(coalesce(agendamento_confirmado_fonte, ''))) between 5 and 300
    )
  );

create or replace function public.ciclos_agendamento_auditoria()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- linha nova nasce sempre não confirmada
  if tg_op = 'INSERT' then
    new.agendamento_confirmado_em := null;
    new.agendamento_confirmado_por := null;
    new.agendamento_confirmado_fonte := null;
    return new;
  end if;

  -- data nova exige nova confirmação
  if new.data_quimio is distinct from old.data_quimio then
    new.agendamento_confirmado_em := null;
    new.agendamento_confirmado_por := null;
    new.agendamento_confirmado_fonte := null;
    return new;
  end if;

  -- por e fonte vazios: desfazer a confirmação
  if nullif(btrim(new.agendamento_confirmado_por), '') is null
     and nullif(btrim(new.agendamento_confirmado_fonte), '') is null then
    new.agendamento_confirmado_em := null;
    new.agendamento_confirmado_por := null;
    new.agendamento_confirmado_fonte := null;
    return new;
  end if;

  -- já estava confirmada: a conferência registrada não muda sem desfazer antes
  if old.agendamento_confirmado_em is not null then
    new.agendamento_confirmado_em := old.agendamento_confirmado_em;
    new.agendamento_confirmado_por := old.agendamento_confirmado_por;
    new.agendamento_confirmado_fonte := old.agendamento_confirmado_fonte;
    return new;
  end if;

  -- de não confirmada para confirmada. Só um dos dois preenchido: o check rejeita.
  new.agendamento_confirmado_em := now();
  new.agendamento_confirmado_por := nullif(btrim(new.agendamento_confirmado_por), '');
  new.agendamento_confirmado_fonte := nullif(btrim(new.agendamento_confirmado_fonte), '');
  return new;
end;
$$;

drop trigger if exists trg_ciclos_agendamento_auditoria on public.ciclos_quimio;
create trigger trg_ciclos_agendamento_auditoria
  before insert or update on public.ciclos_quimio
  for each row execute function public.ciclos_agendamento_auditoria();
