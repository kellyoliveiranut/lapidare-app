-- =============================================================
-- Migration 2026-08-22b
-- Contrato de prestação de serviços — aceite digital da paciente
-- =============================================================
-- Diferença central em relação ao TermoConsentimento (pacientes.termo_versao):
-- aquele grava só o NÚMERO da versão, porque o texto é igual para todas e o
-- git guarda o histórico. Este documento traz nome, RG/CPF, valor e data DA
-- PACIENTE dentro do corpo — gravar "aceitou a 1.0" não provaria o que foi
-- combinado com ELA. Por isso o aceite congela um SNAPSHOT do HTML final.
--
-- POR QUE O TEXTO É MONTADO NO SERVIDOR: o snapshot é a peça probatória, e
-- não pode ter origem no lado que ele deveria vincular. Se o cliente enviasse
-- o texto, a paciente poderia mandar qualquer valor e o banco gravaria como
-- "o contrato que ela aceitou". A prévia e o aceite chamam a MESMA função de
-- montagem — é isso que garante que o texto lido e o texto gravado são o
-- mesmo. O valor nunca aparece na assinatura das funções: sai da linha.
--
-- POR QUE OS VALORES SUBSTITUÍDOS SÃO ESCAPADOS: a paciente digita CPF e RG, e
-- eles entram num HTML renderizado depois com dangerouslySetInnerHTML — na
-- tela dela e na da nutri. Um RG com <script> seria XSS armazenado contra a
-- nutri. O corpo do template NÃO é escapado: é HTML confiável, escrito pela
-- nutri; só os quatro marcadores passam por escapar_html.
--
-- O GATE É A PRIMEIRA CONSULTA DATADA, não a existência de consulta:
-- consultas.data_hora é NULÁVEL (o "A definir" veio do rascunho que derrubou o
-- not null, e o modal do pacote de 6 tem a caixa "criar sem datas"). Uma
-- paciente pode ter 6 consultas com data_hora nulo — o contrato apareceria sem
-- ter data para carimbar. Gate e renderização olham a MESMA linha, então o
-- contrato só aparece quando existe data real.
--
-- SEM COLUNA DE "GRANDFATHER": a ausência de linha em contratos_essentia já é
-- o corte. As pacientes Essentia atuais não têm contrato e não são bloqueadas.
-- Um gate por created_at seria um segundo critério, capaz de discordar do
-- primeiro, e impediria gerar contrato para paciente antiga numa renovação.
--
-- SEM TRANSAÇÃO ENVOLVENDO: o SQL Editor do Supabase pode fazer rollback
-- silencioso de um begin/commit colado. Ctrl+A antes do Run.
--
-- Idempotente: create table/index if not exists, drop+create policy,
-- create or replace function, seed com on conflict do nothing.
-- =============================================================


-- 1. TABELAS -----------------------------------------------------------

-- 1.1 Templates versionados. O texto do contrato mora AQUI, não no bundle JS:
--     assim a versão fica imutável e datada, e o template usado por um
--     contrato aponta para uma linha real. Trocar uma cláusula é insert de
--     versão nova + trocar o ativo.
create table if not exists public.contratos_templates (
  id         uuid primary key default gen_random_uuid(),
  nutri_id   uuid not null references public.nutris(id) on delete cascade,
  versao     text not null,
  corpo_html text not null,
  ativo      boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists contratos_templates_versao_unq
  on public.contratos_templates (nutri_id, versao);

-- No máximo um ativo por nutri: é o que o Cadastrar.jsx usa ao criar contrato
-- novo, e dois ativos deixariam a escolha ao acaso do order by.
create unique index if not exists contratos_templates_ativo_unq
  on public.contratos_templates (nutri_id)
  where ativo;

comment on column public.contratos_templates.corpo_html is
  'HTML confiavel, escrito pela nutri. NAO passa por escapar_html — so os
   marcadores {{NOME}}, {{IDENTIFICACAO}}, {{VALOR}} e {{DATA_EXTENSO}} passam.';


-- 1.2 O contrato de cada paciente.
create table if not exists public.contratos_essentia (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  nutri_id    uuid not null references public.nutris(id) on delete cascade,
  template_id uuid not null references public.contratos_templates(id) on delete restrict,
  valor       numeric(10,2) not null check (valor > 0),
  texto_html  text,
  aceito_em   timestamptz,
  created_at  timestamptz not null default now(),

  -- Os dois andam juntos: contrato pendente nao tem snapshot (nada foi
  -- acordado ainda), e contrato aceito nunca fica sem o texto que provou o
  -- acordo. Separados, um bug deixaria "aceito sem prova" passar despercebido.
  constraint contratos_essentia_snapshot_coerente
    check ((aceito_em is null) = (texto_html is null))
);

-- No maximo UM pendente por paciente: o wrapper busca "o pendente", e dois
-- tornariam a pergunta ambigua. Aceitos podem ser varios (renovacao).
create unique index if not exists contratos_essentia_pendente_unq
  on public.contratos_essentia (paciente_id)
  where aceito_em is null;

create index if not exists contratos_essentia_nutri_idx
  on public.contratos_essentia (nutri_id, created_at desc);

comment on column public.contratos_essentia.texto_html is
  'Snapshot do HTML exato que a paciente leu e aceitou. Congelado: corrigir um
   dado depois NAO conserta contrato assinado — o certo e emitir outro.';


-- 2. RLS ---------------------------------------------------------------
alter table public.contratos_templates enable row level security;
alter table public.contratos_essentia  enable row level security;

-- Templates: so a nutri. A paciente NUNCA le esta tabela — o texto chega a ela
-- ja renderizado, pelas funcoes security definer abaixo.
drop policy if exists contratos_templates_nutri on public.contratos_templates;
create policy contratos_templates_nutri on public.contratos_templates
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

drop policy if exists contratos_essentia_nutri on public.contratos_essentia;
create policy contratos_essentia_nutri on public.contratos_essentia
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

-- Paciente: SELECT, e so no proprio. Sem UPDATE — a escrita do aceite passa
-- exclusivamente pelo RPC. Mesmo raciocinio do confirmar_consulta: RLS no
-- PostgREST nao restringe COLUNA, entao UPDATE na tabela deixaria ela mandar
-- valor, texto_html e aceito_em no mesmo payload.
-- O `user_id = auth.uid() or id = auth.uid()` e o vinculo duplo que cobre as
-- pacientes antigas, anteriores a coluna user_id.
drop policy if exists contratos_essentia_paciente_select on public.contratos_essentia;
create policy contratos_essentia_paciente_select on public.contratos_essentia
  for select using (
    paciente_id in (
      select p.id from public.pacientes p
      where p.user_id = auth.uid() or p.id = auth.uid()
    )
  );


-- 3. HELPERS PUROS -----------------------------------------------------

create or replace function public.escapar_html(p_txt text)
returns text language sql immutable set search_path = public as $$
  select replace(replace(replace(replace(replace(
           coalesce(p_txt, ''),
           '&', '&amp;'),    -- PRIMEIRO: senao reescreveria o & das entidades
           '<', '&lt;'),
           '>', '&gt;'),
           '"', '&quot;'),
           '''', '&#39;');
$$;

create or replace function public.formatar_cpf(p_cpf text)
returns text language sql immutable set search_path = public as $$
  select case when p_cpf ~ '^[0-9]{11}$'
    then substr(p_cpf,1,3)||'.'||substr(p_cpf,4,3)||'.'||substr(p_cpf,7,3)||'-'||substr(p_cpf,10,2)
    else p_cpf
  end;
$$;

-- Mes por extenso a partir de array, NAO de to_char(d,'TMMonth'): aquele
-- depende do lc_time do servidor, que no Supabase sai em ingles ("August").
create or replace function public.data_extenso_pt(p_data date)
returns text language sql immutable set search_path = public as $$
  select extract(day from p_data)::int::text
      || ' de '
      || (array['janeiro','fevereiro','março','abril','maio','junho',
                'julho','agosto','setembro','outubro','novembro','dezembro'])
           [extract(month from p_data)::int]
      || ' de '
      || extract(year from p_data)::int::text;
$$;

-- Nucleo da montagem: puramente mecanico, sem regra de negocio e sem tocar
-- tabela. A identificacao ja chega PRONTA (RG ou CPF, nunca os dois) porque o
-- CASE que decide isso e regra de negocio e vive nas duas funcoes de baixo.
create or replace function public.montar_contrato_html(
  p_corpo_html    text,
  p_nome          text,
  p_identificacao text,
  p_valor         numeric,
  p_data_extenso  text
) returns text language sql immutable set search_path = public as $$
  select replace(replace(replace(replace(
           p_corpo_html,
           '{{NOME}}',          public.escapar_html(p_nome)),
           '{{IDENTIFICACAO}}', public.escapar_html(p_identificacao)),
           -- to_char com , e . LITERAIS (nao G/D, que dependem de lc_numeric)
           -- da o formato en-US fixo; o translate troca os dois de uma vez e
           -- entrega pt-BR de forma deterministica: 2700.00 -> 2.700,00
           '{{VALOR}}',         public.escapar_html(
                                  translate(to_char(p_valor, 'FM999,999,990.00'), ',.', '.,'))),
           '{{DATA_EXTENSO}}',  public.escapar_html(p_data_extenso));
$$;


-- 4. PRÉVIA ------------------------------------------------------------
-- Devolve NULL quando ainda nao ha consulta datada — e o sinal de "o contrato
-- espera em silencio". A regra do gate mora AQUI, num lugar so: se o cliente
-- decidisse por conta propria quando bloquear, poderia bloquear num momento em
-- que esta funcao nao consegue renderizar.
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
  select c.paciente_id, c.nutri_id, c.valor, t.corpo_html,
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

  select c2.data_hora into v_primeira
  from public.consultas c2
  where c2.paciente_id = v_c.paciente_id
    and c2.status <> 'cancelada'
    and c2.data_hora is not null
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


-- 5. ACEITE ------------------------------------------------------------
create or replace function public.aceitar_contrato_essentia(
  p_contrato_id uuid,
  p_cpf         text default null,
  p_rg          text default null
) returns timestamptz
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

  -- 3) Ja aceito: devolve o carimbo existente. Clique repetido e inofensivo,
  --    mesmo comportamento do confirmar_consulta.
  if v_c.aceito_em is not null then
    return v_c.aceito_em;
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

  return v_aceito;
end;
$$;


-- 6. GRANTS ------------------------------------------------------------
-- O Postgres concede execute a `public` por padrao em funcao nova, entao o
-- revoke vem antes do grant — mesmo cuidado da confirmar_consulta.
revoke all on function public.previa_contrato_essentia(uuid, text, text)  from public, anon;
revoke all on function public.aceitar_contrato_essentia(uuid, text, text) from public, anon;
grant execute on function public.previa_contrato_essentia(uuid, text, text)  to authenticated;
grant execute on function public.aceitar_contrato_essentia(uuid, text, text) to authenticated;


-- 7. SEED DO TEMPLATE 1.0 ----------------------------------------------
-- Sem UUID chumbado: casa por e-mail em nutris, igual lojas_parceiras. Se a
-- nutri nao existir, o insert nao faz nada em vez de quebrar.
-- Dollar-quoting no corpo para nao ter que escapar aspas do HTML.
insert into public.contratos_templates (nutri_id, versao, corpo_html, ativo)
select n.id, '1.0', $html$
<h2>CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS EM NUTRIÇÃO</h2>

<p>
  Pelo presente instrumento, e na melhor forma de direito, doravante denominada
  NUTRICIONISTA, Kelly Cristina Oliveira Albuquerque, Estado civil: casada, do
  RG.: 4591186, inscrita no CPF:82652996215 e no CRN nº 3801, residente e
  domiciliada em: Travessa Rui Barbosa, número 1797, Edifício Paola, apartamento
  1102, Belém, PA. Doravante denominada cliente, {{NOME}}, {{IDENTIFICACAO}},
  decidem celebrar o presente contrato de prestação de serviços de NUTRIÇÃO, nos
  seguintes termos:
</p>

<h3>CLÁUSULA PRIMEIRA. DA PRESTAÇÃO DE SERVIÇOS.</h3>
<p>
  O serviço abrangido pelo presente contrato será o de prestação de serviços de
  nutrição, visando à melhora no perfil nutricional, auxílio no tratamento
  oncológico e melhora na qualidade de vida e desenvolvimento de plano e/ou
  estratégia para o alcance dos objetivos do tratamento nutricional oncológico,
  de forma a aumentar seus resultados positivos.
</p>

<h3>CLÁUSULA SEGUNDA. DO SIGILO PROFISSIONAL.</h3>
<p>
  O PROFISSIONAL obriga-se a manter o sigilo de todas as informações a que tenha
  acesso, em razão da prestação dos serviços ora convencionados, objeto deste
  contrato, sob as penas da lei, com as ressalvas legais.
</p>
<p>
  Parágrafo único. O PROFISSIONAL se reserva ao direito de comentar assuntos
  tratados nas consultas com outros profissionais, também da área de nutrição ou
  outros profissionais de saúde como médicos visando buscar opiniões diversas, a
  fim de melhor orientar o CLIENTE para o alcance de seus objetivos.
</p>

<h3>CLÁUSULA TERCEIRA. DO PAGAMENTO PELOS SERVIÇOS PRESTADOS.</h3>
<p>
  Em remuneração aos serviços prestados, o CLIENTE pagará o valor de total de
  R$ {{VALOR}} pelo acompanhamento, composto por 6 consultas por 3 meses
  prestados, pelo prazo previsto na cláusula sétima.
</p>
<p>FORMA DE PAGAMENTO: Pix ou cartão de crédito</p>
<p>FORMA DE PARCELAMENTO: Parcelamento via cartão de crédito em até 10x.</p>

<h3>CLÁUSULA QUARTA. DO LOCAL DE PAGAMENTO.</h3>
<p>
  O pagamento a que se refere à cláusula anterior será realizado por meio de
  dinheiro, pix, débito ou por meio de cartão de crédito.
</p>

<h3>CLÁUSULA QUINTA. OUTRAS OBRIGAÇÕES DO CLIENTE.</h3>
<p>
  I – A contratação, quando necessário, de outros serviços que não abrangidos
  pelos serviços prestados, e que sejam essenciais para o alcance das metas
  estipuladas durante as consultas.
</p>
<p>
  II – Comprometer-se a comparecer às consultas, de acordo com as datas e
  horários pré-agendados, sejam estas presenciais ou à distância, estando ciente
  de que o seu comprometimento é um fator fundamental ao processo.
</p>

<h3>CLÁUSULA SEXTA. CANCELAMENTOS.</h3>
<p>
  O cancelamento das consultas agendadas junto ao PROFISSIONAL deverá ser feito
  com, no mínimo, 24 horas de antecedência, podendo a mesma a ser remarcada para
  um horário diverso, sem ônus para o CLIENTE.
</p>
<p>
  §1º. No caso de não comparecimento às consultas agendadas, sem aviso
  antecipado, por duas vezes consecutivas, entender-se-á que a mesma foi
  realizada.
</p>
<p>
  O CLIENTE terá o direito a remarcar 10% das consultas, sem ônus. Além deste
  limite estabelecido, a sessão não será cobrada, porém será contabilizada como
  realizada.
</p>

<h3>DISPOSIÇÕES FINAIS. CLÁUSULA SÉTIMA. DA DURAÇÃO E RESCISÃO DO CONTRATO.</h3>
<p>
  O contrato terá duração de 6 Consultas num período de 3 meses, a serem
  contados (as) da data de assinatura do presente instrumento. Qualquer serviço
  de assessoria prestado após o encerramento deste contrato não estará incluído
  nas obrigações decorrentes do presente instrumento, a não ser por renovação de
  contrato.
</p>
<p>
  § 1º. Na hipótese de rescisão deste contrato, enquanto ainda por prazo
  determinado, a parte interessada deverá informar a parte contrária de sua
  decisão no prazo mínimo de 7(sete) dias, sujeita a penalidades.
</p>
<p>
  § 2º. Se o CLIENTE, por ato de vontade, manifestado por escrito, rescindir o
  contrato antes de seu término, após 7 dias datadas do início da contratação,
  não acarretará com a devolução do valor.
</p>
<p>
  § 3º. A impossibilidade superveniente de cumprimento de obrigações que tenham
  a natureza personalíssima poderá, a critério das partes contratantes,
  extinguirem o presente contrato sem nenhum ônus para o PROFISSIONAL ou para o
  CLIENTE.
</p>
<p>
  § 4º. Em razão do caráter personalizado e da execução imediata dos serviços do
  acompanhamento— que demandam tempo técnico, conhecimento especializado e
  estrutura profissional — os valores pagos não serão devolvidos, total ou
  parcialmente, em caso de falecimento do(a) contratante.
</p>
<p>
  A contratação implica o início imediato da prestação do serviço,
  caracterizando obrigação profissional já iniciada e recursos técnicos já
  empregados. Os materiais e planejamentos eventualmente disponibilizados
  poderão permanecer acessíveis ao familiar ou responsável previamente indicado,
  apenas para consulta, sendo vedada sua transferência ou comercialização.
</p>
<p>
  Esta cláusula é estabelecida com base nos princípios da boa-fé, transparência
  e segurança jurídica na relação contratual.
</p>

<h3>CLÁUSULA OITAVA. ASPECTOS GERAIS DA PRESTAÇÃO DE SERVIÇOS.</h3>
<p>
  Para resolução de qualquer controvérsia oriundas deste CONTRATO, as partes
  elegem o foro da comarca de Belém-PA.
</p>

<p style="margin-top:28px">BELÉM, {{DATA_EXTENSO}}</p>

<p style="margin-top:28px">NUTRICIONISTA</p>
<p style="margin-top:20px">CLIENTE</p>
$html$, true
from public.nutris n
where n.email = 'kellynut01@gmail.com'
on conflict (nutri_id, versao) do nothing;


-- =============================================================
-- Conferência (rode depois do Run)
--
--   -- as duas tabelas com RLS ligada?
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public'
--      and tablename in ('contratos_templates','contratos_essentia');
--
--   -- tres policies (duas da nutri, uma de select da paciente)?
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public'
--      and tablename in ('contratos_templates','contratos_essentia')
--    order by tablename, policyname;
--
--   -- o template 1.0 entrou e esta ativo?
--   select versao, ativo, length(corpo_html) as tamanho
--     from public.contratos_templates order by versao;
--
--   -- as funcoes de aceite sao definer? os helpers sao immutable?
--   select proname, prosecdef, provolatile, proconfig from pg_proc
--    where proname in ('previa_contrato_essentia','aceitar_contrato_essentia',
--                      'montar_contrato_html','escapar_html','data_extenso_pt',
--                      'formatar_cpf')
--    order by proname;
--   -- previa/aceitar: prosecdef = true; os quatro helpers: provolatile = 'i'
--
--   -- so authenticated executa as duas expostas?
--   select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--    where routine_name in ('previa_contrato_essentia','aceitar_contrato_essentia');
--
--   -- teste da data por extenso (sem depender de locale):
--   select public.data_extenso_pt(date '2026-08-22');   -- 22 de agosto de 2026
--
--   -- teste do valor (deve sair 2.700,00, nao 2,700.00):
--   select public.montar_contrato_html('{{VALOR}}', '', '', 2700.00, '');
-- =============================================================
