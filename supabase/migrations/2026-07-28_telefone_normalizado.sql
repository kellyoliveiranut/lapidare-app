-- =============================================================
-- Migration 2026-07-28
-- pacientes — telefone normalizado e resolução de e-mail (documentação retroativa)
-- =============================================================
-- Estruturas criadas direto no Supabase e nunca versionadas. Este arquivo NÃO
-- muda nada em produção: é transcrição fiel do que já está lá
-- (pg_get_functiondef / pg_get_triggerdef), para o banco poder ser recriado do
-- zero sem perder nem a normalização nem o login por telefone.
--
-- PARA QUE SERVE: telefone é digitado à mão em vários caminhos (cadastro,
-- perfil, importação de CSV) e chega em formatos diferentes — "(11) 99999-9999",
-- "+55 11 99999-9999", "011 9 9999-9999". A coluna normalizada guarda a forma
-- canônica 55DDD9XXXXXXXX, o índice cobre ela, e é assim que o login por
-- telefone acha a paciente sem varrer a tabela aplicando regex linha a linha.
--
-- A REGRA DO NONO DÍGITO: número nacional de 10 dígitos ganha um '9' depois do
-- DDD, mas só quando o primeiro dígito do número é 8 ou 9 (celular antigo).
-- Fixo continua com 10. Entrada que não casa com formato conhecido volta só com
-- os dígitos, sem prefixo — deliberadamente, para não inventar DDI.
--
-- Transcrito exatamente como está no banco, inclusive as inconsistências entre
-- as funções (search_path, volatilidade). Ver a nota no bloco 4.
--
-- Idempotente: add column if not exists / create index if not exists /
-- create or replace / drop+create do trigger. Rodar de novo é no-op.
-- =============================================================

-- 1. COLUNA E ÍNDICE --------------------------------------------------
alter table public.pacientes
  add column if not exists telefone_normalizado text;

create index if not exists pacientes_telefone_normalizado_idx
  on public.pacientes using btree (telefone_normalizado);

comment on column public.pacientes.telefone_normalizado is
  'Telefone em forma canônica 55DDD9XXXXXXXX. Derivada: escrita só pelo trigger.';


-- 2. NORMALIZAÇÃO -----------------------------------------------------
-- IMMUTABLE: mesma entrada, mesma saída, não lê tabela nenhuma.
create or replace function public.normalizar_telefone(p_tel text)
returns text
language plpgsql
immutable
as $function$
declare
  d   text;
  nac text;
  res text;
begin
  if p_tel is null then return null; end if;
  d := regexp_replace(p_tel, '\D', '', 'g');
  if d = '' then return null; end if;
  if length(d) in (12,13) and left(d,2) = '55' then
    nac := substr(d, 3);
  elsif length(d) in (10,11) then
    nac := d;
  else
    return d;
  end if;
  if length(nac) = 11 then
    res := nac;
  else
    if substr(nac, 3, 1) in ('8','9') then
      res := substr(nac,1,2) || '9' || substr(nac,3);
    else
      res := nac;
    end if;
  end if;
  return '55' || res;
end;
$function$;


-- 3. SINCRONIZAÇÃO ----------------------------------------------------
create or replace function public.sync_telefone_normalizado()
returns trigger
language plpgsql
as $function$
begin
  new.telefone_normalizado := public.normalizar_telefone(new.telefone);
  return new;
end; $function$;

-- UPDATE OF telefone: só dispara quando a coluna entra no SET, então salvar
-- nome ou objetivo não paga o custo da normalização.
drop trigger if exists trg_sync_telefone_normalizado on public.pacientes;
create trigger trg_sync_telefone_normalizado
  before insert or update of telefone on public.pacientes
  for each row
  execute function public.sync_telefone_normalizado();


-- 4. RESOLUÇÃO DE E-MAIL PELO TELEFONE --------------------------------
-- Duas funções fazendo o mesmo trabalho, uma delas legada.
--
-- resolver_email_por_telefone é a EM USO: chamada em
-- netlify/functions/login-telefone.js com a service key, dentro do login por
-- telefone (rate-limit por IP+telefone antes, e-mail nunca volta pro cliente,
-- timing normalizado quando não há match). Usa telefone_normalizado, então
-- aproveita o índice do bloco 1, e junta em auth.users para pegar o e-mail de
-- autenticação — por isso search_path '' e os nomes qualificados.
--
-- buscar_email_por_telefone é a ANTERIOR e NÃO é referenciada em nenhum ponto
-- do repo (verificado em 2026-07-28). Ela recalcula o regex linha a linha no
-- WHERE, o que impede o uso do índice, e lê pacientes.email em vez de
-- auth.users. Mantida aqui porque existe no banco e este arquivo documenta o
-- que existe — dropar é decisão à parte, numa migration que altere a produção.
--
-- Nota de inconsistência, transcrita e não "corrigida": normalizar_telefone não
-- declara search_path, buscar_email_por_telefone usa 'public' e
-- resolver_email_por_telefone usa ''. As duas últimas são SECURITY DEFINER.

create or replace function public.buscar_email_por_telefone(p_telefone text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_in    text;
  v_email text;
BEGIN
  v_in := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
  IF length(v_in) > 11 AND left(v_in, 2) = '55' THEN
    v_in := substring(v_in from 3);
  END IF;
  IF length(v_in) < 10 THEN
    RETURN NULL;
  END IF;
  SELECT p.email INTO v_email
  FROM pacientes p
  WHERE CASE
          WHEN length(regexp_replace(COALESCE(p.telefone,''), '\D','','g')) > 11
           AND left(regexp_replace(COALESCE(p.telefone,''), '\D','','g'), 2) = '55'
          THEN substring(regexp_replace(COALESCE(p.telefone,''), '\D','','g') from 3)
          ELSE regexp_replace(COALESCE(p.telefone,''), '\D','','g')
        END = v_in
  LIMIT 1;
  RETURN v_email;
END;
$function$;

create or replace function public.resolver_email_por_telefone(p_telefone text)
returns text
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_norm text := public.normalizar_telefone(p_telefone); v_email text;
begin
  if v_norm is null or length(v_norm) < 12 then return null; end if;
  select u.email into v_email
  from public.pacientes p
  join auth.users u on u.id = p.user_id
  where p.telefone_normalizado = v_norm
  limit 1;
  return v_email;
end; $function$;


-- =============================================================
-- Conferência
--   select telefone, telefone_normalizado from public.pacientes
--    where telefone is not null limit 10;
--
-- BACKFILL (fora da migration): num banco recriado do zero não há linha
-- nenhuma, e na produção já foi feito quando a coluna nasceu. Se um dia sobrar
-- linha com telefone preenchido e normalizado nulo, o trigger cobre com:
--   update public.pacientes set telefone = telefone
--    where telefone is not null and telefone_normalizado is null;
-- =============================================================
