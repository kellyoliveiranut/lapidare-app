-- ATENÇÃO: já aplicado em produção. Este arquivo é registro, não execução.
--
-- 2026-08-07: baseline de treinos_prescritos e treinos_registros
-- As duas tabelas existem desde 2026-06-05, mas as migrations que as descrevem
-- (2026-06-05b, 2026-06-05c, 2026-06-05d) divergem do banco real em tipo de
-- coluna, regra de exclusão de FK, conjunto de colunas e conjunto de policies.
-- Este arquivo registra a estrutura real, extraída do banco por query em
-- 2026-08-07 (pg_attribute, pg_constraint, pg_indexes, pg_policies, pg_trigger).
--
-- Ao contrário do baseline de vendas/parcelas, aqui o ON DELETE das foreign
-- keys FOI capturado — as definições abaixo vêm de pg_get_constraintdef, que
-- devolve a cláusula literal. Não há incerteza sobre a regra de exclusão.
--
-- Volume no momento da extração: treinos_prescritos 22 linhas,
-- treinos_registros 1 linha.
--
-- UMA DIVERGÊNCIA DELIBERADA em relação à extração: a coluna órfã
-- treinos_prescritos.objetivo, que existia no banco em 2026-08-07, não está no
-- create table abaixo. Ela foi dropada no mesmo dia pela migration
-- 2026-08-07b_drop_treinos_objetivo.sql. Ver o item 5 no fim do arquivo.


create table if not exists public.treinos_prescritos (
  id                    uuid                        not null default gen_random_uuid(),
  paciente_id           uuid,
  tipo                  text,
  intensidade           text,
  frequencia_semanal    integer,
  duracao_minutos       integer,
  fase_tratamento       text,
  observacoes           text,
  video_url             text,
  ativo                 boolean                     default true,
  created_at            timestamp without time zone default now(),
  dias_semana           text[],
  precaucoes            text,
  progressao            text,
  nutri_id              uuid,
  objetivo_treino       text,
  data_liberacao_video  date,
  constraint treinos_prescritos_pkey primary key (id),
  constraint treinos_prescritos_paciente_id_fkey
    foreign key (paciente_id) references pacientes(id) on delete cascade
);

create table if not exists public.treinos_registros (
  id                   uuid                        not null default gen_random_uuid(),
  paciente_id          uuid,
  treino_id            uuid,
  data_execucao        timestamp without time zone default now(),
  intensidade_sentida  text,
  como_se_sentiu       text,
  observacao           text,
  constraint treinos_registros_pkey primary key (id),
  constraint treinos_registros_paciente_id_fkey
    foreign key (paciente_id) references pacientes(id) on delete cascade,
  constraint treinos_registros_treino_id_fkey
    foreign key (treino_id) references treinos_prescritos(id) on delete cascade
);

-- Índices: apenas os UNIQUE das primary keys, criados implicitamente.
-- Nenhum índice secundário existe. Ver nota 6.

alter table public.treinos_prescritos enable row level security;
alter table public.treinos_registros  enable row level security;
-- Nenhuma das duas tem FORCE ROW LEVEL SECURITY.

drop policy if exists nutri_all_treinos_prescritos on public.treinos_prescritos;
create policy nutri_all_treinos_prescritos on public.treinos_prescritos
  for all
  using       (nutri_id = auth.uid())
  with check  (nutri_id = auth.uid());

drop policy if exists paciente_select_treinos_prescritos on public.treinos_prescritos;
create policy paciente_select_treinos_prescritos on public.treinos_prescritos
  for select using (
    paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
  );

drop policy if exists paciente_own_treinos_registros on public.treinos_registros;
create policy paciente_own_treinos_registros on public.treinos_registros
  for all using (
    paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
  );
-- Sem WITH CHECK. É assim no banco, e não é inofensivo — ver nota 3.

drop policy if exists nutri_read_treinos_registros on public.treinos_registros;
create policy nutri_read_treinos_registros on public.treinos_registros
  for select using (
    exists (
      select 1 from public.treinos_prescritos tp
      where tp.id = treinos_registros.treino_id
        and tp.nutri_id = auth.uid()
    )
  );

-- Nenhum trigger (não-interno) existe em qualquer das duas tabelas.

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTAS — divergências entre o banco real e as migrations 2026-06-05b/c/d
--
-- 1) created_at e data_execucao são `timestamp without time zone`, NÃO
--    `timestamptz` como a 2026-06-05b declara. Esta é a divergência de maior
--    consequência do arquivo, e ela é visível na tela da paciente hoje.
--
--    O default now() grava o relógio de parede da timezone da sessão — UTC, na
--    conexão do PostgREST — e descarta o offset. Na leitura, o PostgREST
--    serializa a coluna sem sufixo de zona ("2026-08-06T17:23:45.123"), e o
--    JavaScript, por especificação, interpreta data-hora ISO SEM offset como
--    hora LOCAL. O resultado é que a hora exibida vem adiantada do offset do
--    navegador. Em BRT (UTC−3), uma sessão registrada às 14:23 aparece como
--    "17:23" no histórico (src/app/paciente/Treinos.jsx:383-385).
--
--    O mesmo desencontro atinge o contador de adesão semanal
--    (Treinos.jsx:163-167): inicioSemana é a meia-noite LOCAL de domingo, e a
--    comparação é feita contra uma data já deslocada. Uma sessão de sábado às
--    21:30 BRT é gravada como domingo 00:30 UTC, lida como domingo 00:30 local,
--    e contada na semana seguinte — a paciente perde a sessão da barra de
--    progresso da semana em que treinou.
--
--    Com 1 registro na tabela, o estrago acumulado é nenhum. A correção certa é
--    alterar as duas colunas para timestamptz (o USING é direto, já que os
--    valores gravados são UTC: `alter table ... alter column data_execucao type
--    timestamptz using data_execucao at time zone 'UTC'`), mas alterar produção
--    é decisão separada de registrar o baseline. Enquanto não for feito, vale
--    lembrar da regra que já vale no resto do app: dataLocalISO() para coluna
--    date, toISOString() só para timestamptz.
--
-- 2) A FK treinos_registros.treino_id é ON DELETE CASCADE, não ON DELETE SET
--    NULL como a 2026-06-05b diz. Confirmado por pg_get_constraintdef.
--
--    Isso é o que dá sentido ao aviso do botão de excluir treino
--    (src/app/nutri/_Treinos.jsx:122-156): apagar o treino apaga junto o
--    histórico de execução da paciente. O código já está escrito em cima do
--    comportamento real — conta as sessões ANTES do confirm e aborta se a
--    contagem falhar — e o comentário em _Treinos.jsx:115-121 registra a mesma
--    divergência no ponto de uso.
--
--    Detalhe que não é óbvio: a nutri NÃO tem policy de delete em
--    treinos_registros (só o SELECT da nutri_read_treinos_registros), e mesmo
--    assim o cascade funciona. Ações de integridade referencial rodam como
--    dono da tabela e não passam por RLS. Se a FK um dia virar SET NULL, o
--    efeito não é "o histórico fica" — é que os registros ficam com treino_id
--    nulo e somem da visão da nutri, porque nutri_read_treinos_registros exige
--    um treino correspondente. Ficariam visíveis só para a paciente.
--
-- 3) paciente_own_treinos_registros é FOR ALL com USING e SEM WITH CHECK.
--    Funciona por comportamento implícito: quando uma policy FOR ALL não
--    declara WITH CHECK, o Postgres reaproveita a expressão do USING para
--    validar as linhas de INSERT e UPDATE. Na prática, hoje, a paciente só
--    consegue inserir registro com o próprio paciente_id — que é o desejado.
--
--    O risco não é o comportamento atual, é a fragilidade dele. A garantia de
--    escrita está apoiada em um default da linguagem, não em algo escrito. Uma
--    edição futura que afrouxe o USING para ampliar leitura afrouxa a escrita
--    junto, em silêncio, sem que a linha alterada mencione escrita. Declarar o
--    WITH CHECK explicitamente separa as duas coisas e torna a intenção legível.
--    Comparar com nutri_all_treinos_prescritos, que TEM o WITH CHECK explícito.
--
-- 4) As policies de treinos_prescritos são DUAS, e a 2026-06-05d descreve só
--    uma. O banco tem:
--      - nutri_all_treinos_prescritos     — FOR ALL,    nutri_id = auth.uid()
--      - paciente_select_treinos_prescritos — FOR SELECT, paciente_id = auth.uid()
--                                             or paciente_id = minha_paciente_id()
--
--    A 2026-06-05d afirma uma única policy FOR ALL com os três ramos juntos
--    (nutri_id, paciente_id, minha_paciente_id). O banco real separou: a nutri
--    tem ALL, a paciente tem só SELECT.
--
--    A separação é mais restritiva e mais correta do que o arquivo. Na versão
--    da 05d, o ramo `paciente_id = auth.uid()` dentro de um FOR ALL dava à
--    paciente permissão de INSERT, UPDATE e DELETE sobre a própria prescrição —
--    ela poderia editar ou apagar o treino que a nutri prescreveu. Do jeito que
--    está no banco, não pode. Policies permissivas se somam por OR, então as
--    duas juntas cobrem leitura da paciente e escrita da nutri sem sobreposição
--    indesejada. A pergunta que abri antes de ver a saída — se a policy de
--    select seria redundante — se responde sozinha: não é, ela é o ÚNICO
--    caminho de leitura da paciente, já que a nutri_all não tem mais ramo de
--    paciente.
--
-- 5) Duas colunas do banco não aparecem em migration nenhuma:
--
--    data_liberacao_video (date) — VIVA. Escrita em _Treinos.jsx:99 e lida em
--    Treinos.jsx:299 e 318, para segurar o vídeo até uma data. Foi adicionada à
--    mão em produção e nunca versionada.
--
--    objetivo (text) — era RESÍDUO MORTO e foi DROPADA. Confirmado que nenhum
--    SELECT a nomeava, nenhum INSERT ou UPDATE a escrevia e que a contagem de
--    linhas com valor não-nulo era zero. Removida pela migration
--    2026-08-07b_drop_treinos_objetivo.sql, que traz a investigação completa.
--
--    Por isso o create table acima NÃO a lista: este baseline descreve a
--    tabela como ela deve ser reconstruída, não como estava no instante da
--    extração. Recriar a coluna aqui anularia o drop num banco montado do
--    zero a partir das migrations.
--
-- 6) NÃO existe índice além dos UNIQUE implícitos das primary keys.
--    Toda consulta das duas telas filtra por paciente_id, e a contagem de
--    sessões do botão de excluir filtra treinos_registros por treino_id — todas
--    resolvidas por sequential scan. Com 22 e 1 linhas isso é irrelevante e
--    provavelmente será por muito tempo, já que o volume cresce com o número de
--    pacientes, não com tráfego.
--
--    Vale saber que treinos_registros.treino_id ser uma FK SEM índice também
--    afeta o cascade: cada exclusão de treino varre treinos_registros inteira
--    para achar as filhas. Se um dia doer, os índices a criar são
--    (paciente_id, created_at desc) em treinos_prescritos e
--    (paciente_id, data_execucao desc) + (treino_id) em treinos_registros.
--    Não criados agora para não alterar produção junto com um baseline.
--
-- 7) A ordem real das colunas de treinos_prescritos não é a da 2026-06-05b.
--    nutri_id está na posição 16, depois de dias_semana e progressao, e não na
--    5 como o create table sugere. Ou seja, a tabela em produção nunca foi
--    criada pelo arquivo como ele está escrito hoje — nutri_id entrou por um
--    ALTER posterior que também não foi versionado. A ordem acima reproduz a
--    do banco, não a do arquivo antigo.
--
-- 8) Sobre a qualificação de schema nas policies: pg_policies devolve o corpo
--    das policies chamando `minha_paciente_id()` sem schema, porque foram
--    criadas assim e resolvem via search_path. Este arquivo escreve
--    `public.minha_paciente_id()`. As duas formas são equivalentes enquanto
--    public estiver no search_path; a qualificada é a que se quer numa
--    reconstrução, e é a mesma escolha que a 2026-06-05d já fazia.
-- ─────────────────────────────────────────────────────────────────────────────
