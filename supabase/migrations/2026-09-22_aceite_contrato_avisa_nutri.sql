-- 2026-09-22 — aceitar_contrato_essentia passa a dizer se o aceite foi NOVO.
--
-- Por que DROP e nao CREATE OR REPLACE: o tipo de retorno muda (timestamptz ->
-- table), e o Postgres nao permite trocar o retorno com replace. O drop leva os
-- grants junto, por isso eles sao refeitos no fim.
--
-- Por que o booleano existe: o aceite ja era idempotente no banco (o passo 3
-- devolve o carimbo existente, e o `and aceito_em is null` do passo 7 impede
-- corrida). O que NAO era idempotente e o aviso para a nutri. Dois caminhos
-- reais disparavam um segundo push sem que nada tivesse mudado:
--
--   1. Duas abas ou dois aparelhos. A aba B carregou o gate antes de a aba A
--      aceitar; o botao da B continua vivo com um contrato_id velho.
--   2. Resposta perdida. A RPC commita, a conexao cai, o cliente mostra erro,
--      a paciente clica de novo.
--
-- Em ambos a RPC responde sem erro, e ate agora o cliente nao tinha como
-- distinguir isso de um aceite de verdade. Agora tem: `novo`.
--
-- Sem begin/commit: o SQL Editor do Supabase ja roda em transacao propria, e
-- um begin/commit manual ali pode virar rollback silencioso.
--
-- ORDEM DE SUBIDA: esta migration roda ANTES do deploy do codigo. Nessa ordem o
-- pior caso intermediario e o codigo velho ignorando a coluna nova — nada
-- quebra, a notificacao so ainda nao existe. Na ordem inversa, o codigo novo le
-- um retorno que ainda e escalar e o fallback `?? true` dispara push ate nos
-- replays.

drop function if exists public.aceitar_contrato_essentia(uuid, text, text);

create function public.aceitar_contrato_essentia(
  p_contrato_id uuid,
  p_cpf         text default null,
  p_rg          text default null
) returns table(aceito_em timestamptz, novo boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente_id uuid;
  v_c           record;
  v_primeira    timestamptz;
  v_cpf_novo    text;
  v_rg_novo     text;
  v_nome        text;
  v_cpf         text;
  v_rg          text;
  v_ident       text;
  v_aceito      timestamptz;
begin
  -- 1) Quem sou eu. Mesmo vinculo duplo do confirmar_consulta.
  select p.id into v_paciente_id
  from public.pacientes p
  where p.user_id = auth.uid() or p.id = auth.uid()
  limit 1;

  if v_paciente_id is null then
    raise exception 'Paciente não encontrada para o usuário atual' using errcode = '42501';
  end if;

  -- 2) O contrato tem que ser DELA. O id sozinho nao e prova.
  select c.valor, c.aceito_em, t.corpo_html
    into v_c
  from public.contratos_essentia c
  join public.contratos_templates t on t.id = c.template_id
  where c.id = p_contrato_id
    and c.paciente_id = v_paciente_id;

  if not found then
    raise exception 'Contrato não encontrado' using errcode = '42501';
  end if;

  -- 3) Ja aceito: devolve o carimbo existente, marcado como REPLAY. Clique
  --    repetido segue inofensivo para o banco; o `false` e o que impede o
  --    cliente de avisar a nutri uma segunda vez.
  --
  --    NOTA sobre ambiguidade: `aceito_em` agora tambem e nome de coluna de
  --    saida desta funcao. Toda referencia a COLUNA no corpo esta qualificada
  --    (v_c.aceito_em, c.aceito_em), e alvo de SET nunca e ambiguo. Se esta
  --    migration falhar com "column reference is ambiguous", e aqui que olhar.
  if v_c.aceito_em is not null then
    return query select v_c.aceito_em, false;
    return;
  end if;

  -- 4) Sem consulta datada nao ha data para carimbar no contrato.
  select c2.data_hora into v_primeira
  from public.consultas c2
  where c2.paciente_id = v_paciente_id
    and c2.status <> 'cancelada'
    and c2.data_hora is not null
  order by c2.data_hora
  limit 1;

  if not found then
    raise exception 'O contrato só pode ser aceito depois que a primeira consulta for marcada'
      using errcode = 'P0001';
  end if;

  -- 5) Valida o CPF que CHEGOU (nao o ja gravado, que nao e responsabilidade
  --    desta paciente e pode ter formato historico).
  v_cpf_novo := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_rg_novo  := nullif(btrim(coalesce(p_rg, '')), '');

  if v_cpf_novo is not null and v_cpf_novo !~ '^[0-9]{11}$' then
    raise exception 'CPF inválido — informe os 11 dígitos.' using errcode = 'P0001';
  end if;

  -- 6) Preenche SO o que falta. coalesce com o valor atual na frente: o que a
  --    nutri cadastrou nunca e sobrescrito pelo que a paciente digita.
  update public.pacientes p
     set cpf = coalesce(nullif(p.cpf, ''), v_cpf_novo),
         rg  = coalesce(nullif(p.rg,  ''), v_rg_novo)
   where p.id = v_paciente_id
  returning p.nome, nullif(p.cpf, ''), nullif(p.rg, '')
       into v_nome, v_cpf, v_rg;

  v_ident := case
    when v_rg  is not null then 'portador do RG nº '  || v_rg
    when v_cpf is not null then 'portador do CPF nº ' || public.formatar_cpf(v_cpf)
    else null
  end;

  if v_ident is null then
    raise exception 'Informe o RG ou o CPF para aceitar o contrato.' using errcode = 'P0001';
  end if;

  -- 7) Congela o snapshot. O `and aceito_em is null` no where impede que uma
  --    corrida sobrescreva um aceite ja gravado.
  update public.contratos_essentia c
     set texto_html = public.montar_contrato_html(
                        v_c.corpo_html, v_nome, v_ident, v_c.valor,
                        public.data_extenso_pt((v_primeira at time zone 'America/Belem')::date)),
         aceito_em  = now()
   where c.id = p_contrato_id
     and c.aceito_em is null
  returning c.aceito_em into v_aceito;

  if v_aceito is null then
    raise exception 'Não foi possível registrar o aceite.' using errcode = 'P0001';
  end if;

  -- Aceite NOVO. E so por este caminho que a nutri e avisada.
  return query select v_aceito, true;
end;
$$;

-- GRANTS ---------------------------------------------------------------
-- O drop acima levou os grants junto. O Postgres concede execute a `public` por
-- padrao em funcao nova, entao o revoke vem antes do grant — mesmo cuidado do
-- arquivo original (2026-08-22b_contrato_essentia.sql).
revoke all on function public.aceitar_contrato_essentia(uuid, text, text) from public, anon;
grant execute on function public.aceitar_contrato_essentia(uuid, text, text) to authenticated;

-- CONFERENCIA (rodar DEPOIS, em query separada) -------------------------
-- Prova que a funcao existe com o retorno novo e com os grants certos:
--
--   select p.proname,
--          pg_get_function_result(p.oid)          as retorno,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_ok,
--          has_function_privilege('anon',          p.oid, 'execute') as anon_ok
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'aceitar_contrato_essentia';
--
-- Esperado: 1 linha, retorno 'TABLE(aceito_em timestamp with time zone, novo boolean)',
-- authenticated_ok = true, anon_ok = false.
