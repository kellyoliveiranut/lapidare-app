-- =============================================================
-- Migration 2026-07-29
-- search_path fixo nas funções de telefone
-- =============================================================
-- normalizar_telefone e sync_telefone_normalizado (2026-07-28) saíram com
-- proconfig nulo: sem search_path próprio, executam com o search_path de
-- quem chama. Funcionava, mas era frágil — a normalizar_telefone é chamada
-- de dentro da resolver_email_por_telefone, que roda com search_path vazio,
-- então qualquer referência não qualificada a algo em `public` que se
-- acrescentasse no corpo passaria a quebrar só naquele caminho de chamada.
--
-- resolver_email_por_telefone NÃO é tocada: já nasceu com search_path ''
-- e é a função do login.
--
-- Corpos transcritos sem uma vírgula de diferença; conferidos contra
-- pg_get_functiondef antes de aplicar. A ÚNICA mudança é a linha
-- `set search_path = ''` no cabeçalho de cada uma.
--
-- Seguro com search_path vazio:
--   normalizar_telefone       → só built-ins de pg_catalog (regexp_replace,
--                               length, left, substr, ||). pg_catalog está
--                               sempre no caminho, mesmo com search_path ''.
--   sync_telefone_normalizado → chama public.normalizar_telefone() já
--                               qualificado; o resto é atribuição em new.
--
-- Sem impacto em índice: pacientes_telefone_normalizado_idx é btree sobre a
-- coluna telefone_normalizado, não sobre expressão de função. E o trigger
-- trg_sync_telefone_normalizado não precisa ser recriado — create or replace
-- troca só o corpo, o oid da função continua o mesmo.
-- =============================================================

create or replace function public.normalizar_telefone(p_tel text)
returns text
language plpgsql
immutable
set search_path = ''
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

create or replace function public.sync_telefone_normalizado()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.telefone_normalizado := public.normalizar_telefone(new.telefone);
  return new;
end; $function$;


-- =============================================================
-- Conferência
--   select p.proname, p.prosecdef, p.provolatile, p.proconfig
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname like '%telefone%'
--    order by p.proname;
--   -- as três com proconfig = {search_path=""}
--
--   select public.normalizar_telefone('(11) 99999-8888'),
--          public.normalizar_telefone('+55 11 99999-8888'),
--          public.normalizar_telefone('011 99999-8888'),
--          public.normalizar_telefone('11999998888');
--   -- 5511999998888 nos quatro
--
-- Aplicada no Supabase em 2026-07-29.
-- =============================================================
