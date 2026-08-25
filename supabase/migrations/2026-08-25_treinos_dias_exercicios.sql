-- =============================================================
-- Migration 2026-08-25
-- treinos — dias e exercícios, e o registro sabendo qual dia foi feito
-- =============================================================
-- Até aqui um treino era UMA linha em treinos_prescritos, com dias_semana
-- text[] e nenhuma estrutura de exercício. O plano vinha por PDF e era
-- transcrito à mão para os campos livres. Esta migration cria as duas tabelas
-- que faltavam e liga o registro da paciente ao dia que ela fez.
--
-- O QUE ESTA MIGRATION FAZ:
--   1. treinos_dias        — os dias do plano (Treino A, Treino B, ...)
--   2. treinos_exercicios  — os exercícios de cada dia
--   3. treinos_prescritos  — três colunas de contexto que o PDF já traz
--   4. treinos_registros   — dia_id, para saber QUAL dia foi feito
--   5. treinos_registros   — data_execucao vira timestamptz (bug de fuso)
--   6. índices             — inclusive dois que faltavam desde sempre
--   7. RLS das tabelas novas
--
-- POR QUE dia_id JUNTO de treino_id, e não no lugar: a policy
-- nutri_read_treinos_registros resolve a permissão da nutri por
-- `exists (... tp.id = treinos_registros.treino_id and tp.nutri_id = auth.uid())`.
-- Um registro sem treino_id sairia da visão dela. treino_id continua sendo o
-- vínculo estrutural e continua ON DELETE CASCADE; dia_id é rótulo, é nulável
-- e é ON DELETE SET NULL — apagar um dia do plano não pode apagar a sessão que
-- a paciente registrou.
--
-- POR QUE text EM series/repeticoes/intensidade/intervalo: o PDF escreve
-- "3", "3-4", "12/10/8", "até a falha", "20 cada perna", "30s", "1-2 min",
-- "RPE 7", "60% 1RM". Nada disso cabe em integer sem perda, e o app NUNCA
-- calcula com esses valores — lê do PDF, a nutri confere, a paciente vê
-- literalmente. Converter para número obrigaria a IA a chutar precisão que o
-- documento não tem, exatamente no campo que a nutri iria conferir.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled
-- e uma transação explícita pode terminar em rollback SILENCIOSO — o editor
-- reporta sucesso e nada é aplicado. Rode tudo de uma vez, Ctrl+A antes do Run
-- (o editor executa só o texto selecionado quando há seleção).
--
-- Idempotente: create table if not exists, add column if not exists,
-- drop+add constraint, drop+create policy, create index if not exists, e o
-- alter type do bloco 5 protegido por DO $$ que checa o tipo atual.
-- =============================================================


-- 1. treinos_dias ------------------------------------------------------
-- nome é livre (Treino A, Superiores, Full body) porque é o rótulo que o
-- professor escreveu no PDF — forçar A/B perderia informação.
-- dias_semana repete o formato text[] que treinos_prescritos.dias_semana já
-- usa: mesmo vocabulário, mesma leitura no cliente.
create table if not exists public.treinos_dias (
  id           uuid        not null default gen_random_uuid(),
  treino_id    uuid        not null,
  nome         text        not null,
  dias_semana  text[],
  ordem        smallint    not null default 0,
  created_at   timestamptz not null default now(),
  constraint treinos_dias_pkey primary key (id),
  constraint treinos_dias_treino_id_fkey
    foreign key (treino_id) references public.treinos_prescritos(id) on delete cascade
);

comment on table public.treinos_dias is
  'Dias de um treino prescrito (Treino A, Treino B). Um treino sem linhas aqui
   e um plano no formato antigo, de linha unica em treinos_prescritos.';
comment on column public.treinos_dias.ordem is
  'Sequencia na tela. O PDF quase sempre vem numerado.';


-- 2. treinos_exercicios ------------------------------------------------
create table if not exists public.treinos_exercicios (
  id           uuid        not null default gen_random_uuid(),
  dia_id       uuid        not null,
  nome         text        not null,
  series       text,
  repeticoes   text,
  intensidade  text,
  intervalo    text,
  observacao   text,
  ordem        smallint    not null default 0,
  created_at   timestamptz not null default now(),
  constraint treinos_exercicios_pkey primary key (id),
  constraint treinos_exercicios_dia_id_fkey
    foreign key (dia_id) references public.treinos_dias(id) on delete cascade
);

comment on column public.treinos_exercicios.series is
  'TEXT de proposito — o PDF escreve 3, 3-4, 12/10/8, ate a falha. Ver o
   cabecalho desta migration.';
comment on column public.treinos_exercicios.intensidade is
  'Carga ou percepcao de esforco, como estiver escrito: 60% 1RM, RPE 7, 12kg.';


-- 3. treinos_prescritos — contexto que o PDF já traz --------------------
-- Todas nulaveis e sem default: as linhas existentes nao sao tocadas.
alter table public.treinos_prescritos
  add column if not exists contexto_clinico    text,
  add column if not exists local_equipamentos  text,
  add column if not exists divisao             text;

comment on column public.treinos_prescritos.contexto_clinico is
  'Situacao clinica que a prescricao assume: em quimio, pos-cirurgico,
   linfedema no braco direito. Antes isso caia em observacoes, misturado.';
comment on column public.treinos_prescritos.local_equipamentos is
  'Onde treina e com o que: casa sem equipamento, academia, elastico e halter
   de 2kg. Muda o que da para prescrever, e o PDF traz no cabecalho.';
comment on column public.treinos_prescritos.divisao is
  'Rotulo da divisao (A/B, ABC, Full body). Redundante com a contagem de
   treinos_dias, mas e o nome que o professor deu e a tela mostra.';


-- 4. treinos_registros — qual dia foi feito ----------------------------
alter table public.treinos_registros
  add column if not exists dia_id uuid;

-- ON DELETE SET NULL, e NAO cascade como o treino_id ao lado: apagar um dia
-- do plano nao pode apagar a sessao que a paciente registrou. O historico de
-- adesao sobrevive e perde so o rotulo de qual dia foi.
alter table public.treinos_registros
  drop constraint if exists treinos_registros_dia_id_fkey;
alter table public.treinos_registros
  add constraint treinos_registros_dia_id_fkey
    foreign key (dia_id) references public.treinos_dias(id) on delete set null;

comment on column public.treinos_registros.dia_id is
  'Qual dia do plano a paciente fez. Nulo nos registros anteriores a esta
   migration e nos treinos sem dias cadastrados.';


-- 5. data_execucao: timestamp without time zone -> timestamptz ---------
-- O BUG: a coluna e `timestamp without time zone` com default now(). O now()
-- grava relogio UTC sem offset, o PostgREST devolve string sem Z, e o JS le
-- ISO-sem-offset como hora LOCAL. Sessao das 14:23 BRT aparece como 17:23 no
-- historico (paciente/Treinos.jsx), e sessao de sabado a noite escorrega para
-- a semana seguinte no contador de frequencia.
--
-- O `using data_execucao at time zone 'UTC'` E A PECA QUE NAO PODE FALTAR.
-- Aplicado a um timestamp SEM fuso, esse operador significa "este relogio esta
-- em UTC" e devolve o timestamptz correspondente — que e exatamente o caso,
-- porque todas as linhas vieram do default now().
--
-- Sem o `using`, o Postgres interpretaria o valor no TimeZone da SESSAO. No
-- Supabase isso costuma ser UTC, entao daria certo por acidente — e daria
-- errado em silencio numa sessao em America/Sao_Paulo, deslocando o historico
-- inteiro em 3 horas. Ser explicito remove a dependencia de configuracao.
--
-- DUAS CONDICOES QUE SUSTENTAM ESSE `using`, conferidas em 2026-08-25:
--   a) Nenhuma linha foi inserida com timestamp do cliente. O unico ponto que
--      escreve nesta tabela e o insert em paciente/Treinos.jsx, que manda
--      quatro colunas e data_execucao NAO e uma delas.
--   b) Volume 8 linhas, current_setting('TimeZone') = UTC.
--
-- EFEITO VISIVEL, e e o esperado: depois disto o historico passa a exibir
-- horas DIFERENTES das de antes nas linhas antigas. Nao e regressao, e a
-- correcao aparecendo.
--
-- O DO $$ existe porque `alter column ... type` NAO e idempotente: rodar de
-- novo numa coluna ja convertida estoura. O bloco checa o tipo atual em
-- pg_attribute e vira no-op na segunda execucao.
do $$
begin
  if exists (
    select 1
      from pg_attribute a
      join pg_class     c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'treinos_registros'
       and a.attname = 'data_execucao'
       and a.attnum  > 0
       and not a.attisdropped
       and a.atttypid = 'timestamp without time zone'::regtype
  ) then
    alter table public.treinos_registros
      alter column data_execucao type timestamptz
      using data_execucao at time zone 'UTC';
    raise notice 'data_execucao convertida para timestamptz (valores lidos como UTC)';
  else
    raise notice 'data_execucao ja e timestamptz — nada a fazer';
  end if;
end;
$$;

-- Redeclarado depois do alter type: agora o now() e nativo da coluna, sem o
-- cast implicito para timestamp que existia antes.
alter table public.treinos_registros
  alter column data_execucao set default now();


-- 6. Índices -----------------------------------------------------------
-- O baseline de 2026-08-07 registrou ZERO indices secundarios nas duas tabelas
-- antigas. Os dois primeiros sao da feature nova; os dois ultimos sao divida
-- antiga que cabe aqui — treinos_registros.treino_id e uma FK sem indice, e e
-- por ela que o CASCADE varre a cada exclusao de treino.
create index if not exists treinos_dias_treino_id_idx
  on public.treinos_dias (treino_id, ordem);
create index if not exists treinos_exercicios_dia_id_idx
  on public.treinos_exercicios (dia_id, ordem);
create index if not exists treinos_registros_dia_id_idx
  on public.treinos_registros (dia_id);
create index if not exists treinos_registros_treino_id_idx
  on public.treinos_registros (treino_id);


-- 7. RLS das tabelas novas ---------------------------------------------
-- Permissao por `exists` na tabela pai, como nutri_read_treinos_registros ja
-- faz, em vez de duplicar nutri_id/paciente_id nas filhas — coluna duplicada
-- e coluna que pode dessincronizar.
--
-- WITH CHECK EXPLICITO nas duas policies de escrita, sem repetir o
-- paciente_own_treinos_registros, que e FOR ALL sem WITH CHECK e so funciona
-- porque o Postgres reaproveita o USING. Garantia apoiada em default da
-- linguagem nao e garantia escrita.
alter table public.treinos_dias       enable row level security;
alter table public.treinos_exercicios enable row level security;

drop policy if exists nutri_all_treinos_dias on public.treinos_dias;
create policy nutri_all_treinos_dias on public.treinos_dias
  for all
  using (exists (
    select 1 from public.treinos_prescritos tp
     where tp.id = treinos_dias.treino_id and tp.nutri_id = auth.uid()))
  with check (exists (
    select 1 from public.treinos_prescritos tp
     where tp.id = treinos_dias.treino_id and tp.nutri_id = auth.uid()));

drop policy if exists paciente_select_treinos_dias on public.treinos_dias;
create policy paciente_select_treinos_dias on public.treinos_dias
  for select
  using (exists (
    select 1 from public.treinos_prescritos tp
     where tp.id = treinos_dias.treino_id
       and (tp.paciente_id = auth.uid()
            or tp.paciente_id = public.minha_paciente_id())));

drop policy if exists nutri_all_treinos_exercicios on public.treinos_exercicios;
create policy nutri_all_treinos_exercicios on public.treinos_exercicios
  for all
  using (exists (
    select 1 from public.treinos_dias td
      join public.treinos_prescritos tp on tp.id = td.treino_id
     where td.id = treinos_exercicios.dia_id and tp.nutri_id = auth.uid()))
  with check (exists (
    select 1 from public.treinos_dias td
      join public.treinos_prescritos tp on tp.id = td.treino_id
     where td.id = treinos_exercicios.dia_id and tp.nutri_id = auth.uid()));

drop policy if exists paciente_select_treinos_exercicios on public.treinos_exercicios;
create policy paciente_select_treinos_exercicios on public.treinos_exercicios
  for select
  using (exists (
    select 1 from public.treinos_dias td
      join public.treinos_prescritos tp on tp.id = td.treino_id
     where td.id = treinos_exercicios.dia_id
       and (tp.paciente_id = auth.uid()
            or tp.paciente_id = public.minha_paciente_id())));


-- =============================================================
-- FORA DESTA MIGRATION, DE PROPOSITO
--
--   * Desativar o plano anterior no import por PDF — decidido fazer no
--     CLIENTE, nao por trigger: e regra do fluxo de importacao, nao
--     invariante da tabela. Como trigger, importar um plano de teste sem
--     desativar o vigente deixaria de ser possivel.
--   * Unique de duplicata por dia em treinos_registros — dois cliques ainda
--     contam duas sessoes na meta semanal. Fora de escopo agora.
--   * Migracao das 22 linhas antigas de treinos_prescritos para o formato de
--     dias/exercicios — trabalho de tela, junto da reescrita do _Treinos.jsx.
-- =============================================================


-- =============================================================
-- Conferência (rode depois do Run)
--
--   -- as duas tabelas novas existem?
--   select table_name from information_schema.tables
--    where table_schema='public'
--      and table_name in ('treinos_dias','treinos_exercicios')
--    order by table_name;
--
--   -- as tres colunas novas de treinos_prescritos entraram?
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='treinos_prescritos'
--      and column_name in ('contexto_clinico','local_equipamentos','divisao')
--    order by column_name;
--
--   -- data_execucao virou timestamptz? (esperado: timestamp with time zone)
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='treinos_registros'
--      and column_name in ('data_execucao','dia_id')
--    order by column_name;
--
--   -- as 8 linhas sobreviveram e o horario faz sentido?
--   -- (data_execucao_utc deve ser IDENTICA ao valor que estava la antes)
--   select count(*) as total,
--          min(data_execucao at time zone 'UTC') as mais_antiga_utc,
--          max(data_execucao at time zone 'UTC') as mais_recente_utc
--     from public.treinos_registros;
--
--   -- as FKs, com o ON DELETE literal (cascade no treino_id, set null no dia_id)
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.treinos_registros'::regclass and contype='f'
--    order by conname;
--
--   -- RLS ligado nas duas novas? (esperado: t e t)
--   select relname, relrowsecurity from pg_class
--    where relnamespace='public'::regnamespace
--      and relname in ('treinos_dias','treinos_exercicios')
--    order by relname;
--
--   -- as quatro policies novas, com USING e WITH CHECK
--   select tablename, policyname, cmd, qual, with_check from pg_policies
--    where schemaname='public'
--      and tablename in ('treinos_dias','treinos_exercicios')
--    order by tablename, policyname;
--
--   -- os quatro indices
--   select tablename, indexname from pg_indexes
--    where schemaname='public'
--      and indexname in ('treinos_dias_treino_id_idx','treinos_exercicios_dia_id_idx',
--                        'treinos_registros_dia_id_idx','treinos_registros_treino_id_idx')
--    order by indexname;
-- =============================================================
