-- =============================================================
-- RENOVAÇÃO DO ESSENTIA — modelo de contrato próprio (2026-11-26)
-- =============================================================
-- Renovar = novo acompanhamento de 6 consultas ("Renovação 1" a "Renovação 6",
-- tipos renovacao_1…6 em consultas.tipo, que não tem CHECK). O contrato da
-- renovação é um contrato PENDENTE cujo template é do tipo 'renovacao'.
--
-- O QUE ESTA MIGRATION FAZ
--   1. contratos_templates.tipo ('essentia' | 'renovacao', padrão 'essentia'):
--      os existentes viram 'essentia'. O índice de "no máximo um ativo por
--      nutri" passa a valer POR TIPO — senão o modelo de renovação ativo
--      derrubaria o Essentia.
--   2. previa_contrato_essentia e aceitar_contrato_essentia: iguais às versões
--      em vigor (2026-08-22b e 2026-09-22), com UMA diferença — no contrato de
--      renovação a data carimbada e o gate olham a primeira consulta do ciclo
--      novo (renovacao_*), não a primeira consulta da paciente. Contrato
--      Essentia comum: comportamento idêntico ao de hoje.
--   3. Cria o modelo "renovação" a partir do template Essentia ATIVO, por
--      substituição mecânica: troca o título e acrescenta UM parágrafo de
--      abertura. Nenhuma cláusula é reescrita. O PARÁGRAFO NOVO PRECISA DA
--      APROVAÇÃO DA KELLY antes de gerar contratos reais (texto abaixo).
--
-- NÃO afeta contrato já assinado (snapshot em contratos_essentia.texto_html).
-- ORDEM: publicar o app ANTES, depois rodar este SQL (o app tolera a coluna
-- ainda não existir; o modelo de renovação só passa a existir aqui).
-- Idempotente. Ctrl+A antes do Run. Desfazer:
--   supabase/desfazer/2026-11-26_renovacao_contrato_DESFAZER.sql
-- =============================================================

-- 1. TIPO DO TEMPLATE --------------------------------------------------
alter table public.contratos_templates add column if not exists tipo text not null default 'essentia';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contratos_templates_tipo_ck') then
    alter table public.contratos_templates
      add constraint contratos_templates_tipo_ck check (tipo in ('essentia', 'renovacao'));
  end if;
end $$;

drop index if exists public.contratos_templates_ativo_unq;
create unique index if not exists contratos_templates_ativo_tipo_unq
  on public.contratos_templates (nutri_id, tipo)
  where ativo;

-- 2. PRÉVIA E ACEITE (data do ciclo novo na renovação) -----------------
create or replace function public.previa_contrato_essentia(
  p_contrato_id uuid,
  p_cpf         text default null,
  p_rg          text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c        record;
  v_primeira timestamptz;
  v_cpf      text;
  v_rg       text;
  v_ident    text;
begin
  select c.paciente_id, c.nutri_id, c.valor, t.corpo_html, t.tipo as template_tipo,
         p.nome as paciente_nome, p.cpf as paciente_cpf, p.rg as paciente_rg
    into v_c
  from public.contratos_essentia c
  join public.contratos_templates t on t.id = c.template_id
  join public.pacientes p           on p.id = c.paciente_id
  where c.id = p_contrato_id;

  if not found then
    raise exception 'Contrato não encontrado' using errcode = '42501';
  end if;

  -- security definer ignora RLS, entao a autorizacao e explicita aqui.
  if not (
      v_c.nutri_id = auth.uid()
      or exists (select 1 from public.pacientes p2
                  where p2.id = v_c.paciente_id
                    and (p2.user_id = auth.uid() or p2.id = auth.uid()))
  ) then
    raise exception 'Sem permissão para ver este contrato' using errcode = '42501';
  end if;

  -- Contrato de RENOVAÇÃO: a data carimbada é a da primeira consulta do ciclo
  -- novo (renovacao_1…6), não a da primeira consulta da paciente na vida.
  select c2.data_hora into v_primeira
  from public.consultas c2
  where c2.paciente_id = v_c.paciente_id
    and c2.status <> 'cancelada'
    and c2.data_hora is not null
    and (v_c.template_tipo <> 'renovacao' or c2.tipo like 'renovacao%')
  order by c2.data_hora
  limit 1;

  if not found then
    return null;
  end if;

  -- O que ja esta gravado VENCE o que veio por parametro: dado conferido pela
  -- nutri nao e sobrescrito pelo que a paciente digita.
  v_cpf := coalesce(nullif(v_c.paciente_cpf, ''),
                    nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), ''));
  v_rg  := coalesce(nullif(v_c.paciente_rg, ''),
                    nullif(btrim(coalesce(p_rg, '')), ''));

  v_ident := case
    when v_rg  is not null then 'portador do RG nº '  || v_rg
    when v_cpf is not null then 'portador do CPF nº ' || public.formatar_cpf(v_cpf)
    -- Nem um nem outro: linha em branco, como campo nao preenchido de
    -- formulario. So aparece antes de a paciente digitar; a tela rechama esta
    -- funcao conforme ela preenche, e a frase se materializa.
    else '____________'
  end;

  return public.montar_contrato_html(
    v_c.corpo_html,
    v_c.paciente_nome,
    v_ident,
    v_c.valor,
    public.data_extenso_pt((v_primeira at time zone 'America/Belem')::date)
  );
end;
$$;

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
  select c.valor, c.aceito_em, t.corpo_html, t.tipo as template_tipo
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
  --    Contrato de RENOVAÇÃO: vale a primeira consulta do ciclo novo.
  select c2.data_hora into v_primeira
  from public.consultas c2
  where c2.paciente_id = v_paciente_id
    and c2.status <> 'cancelada'
    and c2.data_hora is not null
    and (v_c.template_tipo <> 'renovacao' or c2.tipo like 'renovacao%')
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

revoke all on function public.aceitar_contrato_essentia(uuid, text, text) from public, anon;
grant execute on function public.aceitar_contrato_essentia(uuid, text, text) to authenticated;
revoke all on function public.previa_contrato_essentia(uuid, text, text) from public, anon;
grant execute on function public.previa_contrato_essentia(uuid, text, text) to authenticated;

-- 3. MODELO DE RENOVAÇÃO -----------------------------------------------
-- Parágrafo novo (A KELLY APROVA): 
--   "O presente instrumento renova o acompanhamento nutricional contratado
--    anteriormente entre as partes, dando início a um novo ciclo de 6 (seis)
--    consultas, no período de 3 (três) meses, contados da data de assinatura
--    deste instrumento, nos termos das cláusulas a seguir."
-- Todo o resto do corpo é copiado do template Essentia ativo, sem alteração.
insert into public.contratos_templates (nutri_id, versao, corpo_html, ativo, tipo)
select t.nutri_id,
       t.versao || '-renovacao',
       replace(
         t.corpo_html,
         '<h2>CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS EM NUTRIÇÃO</h2>',
         '<h2>CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS EM NUTRIÇÃO — RENOVAÇÃO</h2>'
         || chr(10)
         || '<p>O presente instrumento renova o acompanhamento nutricional contratado anteriormente entre as partes, dando início a um novo ciclo de 6 (seis) consultas, no período de 3 (três) meses, contados da data de assinatura deste instrumento, nos termos das cláusulas a seguir.</p>'
       ),
       true,
       'renovacao'
  from public.contratos_templates t
  join public.nutris n on n.id = t.nutri_id
 where n.email = 'kellynut01@gmail.com'
   and t.ativo
   and t.tipo = 'essentia'
on conflict (nutri_id, versao) do nothing;

-- CONFERÊNCIA (rodar DEPOIS, em query separada) ------------------------
--   select versao, tipo, ativo,
--          position('— RENOVAÇÃO</h2>' in corpo_html) > 0 as titulo_trocado,
--          position('renova o acompanhamento' in corpo_html) > 0 as paragrafo_novo
--     from public.contratos_templates order by tipo, versao;
--   -- esperado: o Essentia ativo (tipo essentia) e a linha "-renovacao"
--   -- (tipo renovacao, ativo true) com titulo_trocado = true e paragrafo_novo = true.
