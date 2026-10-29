-- Trava colunas sensíveis de `pacientes` contra edição pela própria paciente.
-- A policy pacientes_update_self deixa a paciente dar UPDATE na própria linha e
-- o RLS não restringe coluna: pela API ela poderia trocar o próprio plano
-- (tipo_plano), reativar-se (status_paciente), mudar de nutri (nutri_id) ou
-- zerar os controles de lembrete. O app da paciente só grava apelido,
-- avatar_url, termo_aceito_em, termo_versao e ultimo_acesso, e as funções
-- security definer (aceite de contrato etc.) mexem em cpf/rg, não nestas.
--
-- Quem passa: sem JWT (service_role, SQL Editor, funções do Netlify,
-- trigger de cadastro) → auth.uid() é null; e a nutri dona da paciente.
-- Mesmo desenho do protege_acesso_pausado. A cláusula WHEN deixa os UPDATEs
-- comuns (apelido, ultimo_acesso…) fora do alcance da função.
--
-- Idempotente. Ctrl+A antes do Run.
create or replace function public.protege_colunas_paciente()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.nutri_id then
    raise exception 'Somente a nutricionista responsável pode alterar estes dados da paciente.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_protege_colunas_paciente on public.pacientes;
create trigger trg_protege_colunas_paciente
  before update on public.pacientes
  for each row
  when (
    old.nutri_id               is distinct from new.nutri_id
    or old.user_id             is distinct from new.user_id
    or old.tipo_plano          is distinct from new.tipo_plano
    or old.status_paciente     is distinct from new.status_paciente
    or old.volta_app_enviado_em is distinct from new.volta_app_enviado_em
    or old.volta_app_envios    is distinct from new.volta_app_envios
    or old.aniversario_felicitado_em is distinct from new.aniversario_felicitado_em
  )
  execute function public.protege_colunas_paciente();

-- Conferência: deve listar também trg_protege_colunas_paciente.
select tgname from pg_trigger where tgrelid = 'public.pacientes'::regclass and not tgisinternal order by tgname;
