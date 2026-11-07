-- Registra QUEM aceitou o contrato Essentia: a paciente ou o cuidador dela.
-- O contrato é da paciente; quem estiver com o acesso pode aceitar (o gate do
-- app aparece para os dois, pois é a mesma ficha). Esta migração só guarda o
-- fato — não muda o texto do contrato nem o fluxo de aceite. Idempotente.
alter table public.contratos_essentia add column if not exists aceito_por_papel   text;
alter table public.contratos_essentia add column if not exists aceito_por_user_id uuid;
alter table public.contratos_essentia add column if not exists aceito_por_nome    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contratos_aceito_por_papel_ck') then
    alter table public.contratos_essentia
      add constraint contratos_aceito_por_papel_ck
      check (aceito_por_papel is null or aceito_por_papel in ('paciente', 'cuidador'));
  end if;
end $$;

create or replace function public.contrato_registra_quem_aceitou()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cuidador uuid;
  v_nome_cuidador text;
  v_nome_paciente text;
begin
  -- Só na transição pendente -> aceito, e só com usuário logado (auth.uid() nulo
  -- = manutenção pelo painel: não inventa autoria).
  if old.aceito_em is null and new.aceito_em is not null and auth.uid() is not null then
    select p.cuidador_user_id, p.cuidador_nome, p.nome
      into v_cuidador, v_nome_cuidador, v_nome_paciente
    from public.pacientes p
    where p.id = new.paciente_id;

    new.aceito_por_user_id := auth.uid();
    if v_cuidador is not null and v_cuidador = auth.uid() then
      new.aceito_por_papel := 'cuidador';
      new.aceito_por_nome  := v_nome_cuidador;
    else
      new.aceito_por_papel := 'paciente';
      new.aceito_por_nome  := v_nome_paciente;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_contrato_registra_quem_aceitou on public.contratos_essentia;
create trigger trg_contrato_registra_quem_aceitou
  before update on public.contratos_essentia
  for each row
  execute function public.contrato_registra_quem_aceitou();
