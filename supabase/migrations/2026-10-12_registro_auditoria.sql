-- Auditoria da confirmação do registro (12/10/2026).
-- Só acrescenta colunas e um gatilho. Nenhuma linha existente é alterada.
alter table public.tratamentos_oncologicos
  add column if not exists registro_confirmado_em timestamptz,
  add column if not exists registro_confirmado_por text,
  add column if not exists registro_confirmado_fonte text;

comment on column public.tratamentos_oncologicos.registro_confirmado_em is
  'Momento (servidor) em que o registro passou de pendente a confirmado.';
comment on column public.tratamentos_oncologicos.registro_confirmado_por is
  'Nome e registro profissional de quem conferiu, digitado na confirmação (a conta de login é compartilhada).';
comment on column public.tratamentos_oncologicos.registro_confirmado_fonte is
  'Fonte da conferência (prontuário, prescrição, equipe...), digitada na confirmação.';

create or replace function public.trat_onco_registro_auditoria()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.registro_pendente is not distinct from false then
    if tg_op = 'UPDATE' and old.registro_pendente is not distinct from false then
      -- já estava confirmado: a conferência registrada não muda sem voltar a pendente
      new.registro_confirmado_em := old.registro_confirmado_em;
      new.registro_confirmado_por := old.registro_confirmado_por;
      new.registro_confirmado_fonte := old.registro_confirmado_fonte;
    else
      new.registro_confirmado_em := now();
      new.registro_confirmado_por := nullif(btrim(new.registro_confirmado_por), '');
      new.registro_confirmado_fonte := nullif(btrim(new.registro_confirmado_fonte), '');
    end if;
  else
    -- pendente (true ou nulo): nada de conferência guardada
    new.registro_confirmado_em := null;
    new.registro_confirmado_por := null;
    new.registro_confirmado_fonte := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trat_onco_registro_auditoria on public.tratamentos_oncologicos;
create trigger trg_trat_onco_registro_auditoria
  before insert or update on public.tratamentos_oncologicos
  for each row execute function public.trat_onco_registro_auditoria();
