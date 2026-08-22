-- =============================================================
-- Migration 2026-08-22
-- Box de boas-vindas — estoque por item, receita por tipo, montagem
-- =============================================================
-- Três tabelas e uma função. O app não tinha NADA de estoque nem de
-- composição de itens antes disto (varredura em src/ e supabase/ não achou
-- 'estoque', 'insumo' nem receita no sentido de lista de componentes — as
-- ocorrências de "receita" são culinária, na Biblioteca, e faturamento, no
-- Cérebro). Então não há padrão anterior a seguir aqui, só o das tabelas
-- simples da nutri: lojas_parceiras e locais_atendimento.
--
-- POR QUE ESTOQUE POR ITEM, E NÃO POR BOX: a nutri compra componentes
-- avulsos e monta a box na hora de entregar. Guardar "tenho 3 boxes" perderia
-- a informação de qual item está acabando, que é justamente o que ela precisa
-- saber para comprar. Quantas boxes dá para montar é DERIVADO, nunca gravado:
-- é o mínimo de (estoque do item / quantidade que a receita pede), o item
-- limitante.
--
-- POR QUE box_tipo É TEXTO COM CHECK, E NÃO UMA TABELA `boxes`: são dois
-- tipos, colados nos dois objetivos clínicos, e os valores são os MESMOS de
-- src/lib/objetivos.js ('Emagrecimento' e 'Oncologia' estão na lista canônica
-- de oito objetivos da paciente). Casar a grafia abre caminho para, um dia,
-- derivar o tipo da box do objetivo da paciente sem tabela de-para. Uma
-- tabela `boxes` daria um terceiro tipo pela tela, sem migration, mas custa um
-- join em toda consulta por uma flexibilidade que ainda não é necessária. Se
-- aparecer uma terceira box, a migração é barata: o CHECK vira FK e os dois
-- valores viram linhas.
--
-- POR QUE estoque_movimentos EXISTE: a montagem desconta estoque
-- automaticamente. Sem registro, no dia em que o número não bater com a
-- prateleira — e uma hora não bate — não há como descobrir o porquê. É o
-- mesmo buraco que deixou a investigação das consultas de fim de semana sem
-- resposta em 2026-08-22: um valor mudou e nada guardava o que tinha mudado.
-- Aqui dá para evitar por desenho, ao custo de uma tabela que só recebe
-- insert. Ela também é o que permite desfazer uma montagem errada somando o
-- delta invertido, em vez de recontar tudo à mão.
--
-- RLS: uma policy `for all` por nutri_id nas três, padrão de lojas_parceiras.
-- A paciente não lê nada aqui. Consequência assumida: a nutri pode editar o
-- próprio livro de movimentos, então ele é append-only por convenção, não por
-- imposição do banco. Numa app de uma usuária só, que também é a dona dos
-- dados, travar isso criaria um beco sem saída para corrigir um lançamento
-- errado.
--
-- SEM TRANSAÇÃO ENVOLVENDO: o SQL Editor do Supabase pode fazer rollback
-- silencioso de um begin/commit colado. Ctrl+A antes do Run.
--
-- Idempotente: create table if not exists / create index if not exists /
-- drop+create policy / create or replace function. Rodar de novo é no-op.
-- =============================================================


-- 1. TABELAS -----------------------------------------------------------

-- 1.1 Itens em estoque. Uma linha por componente que a nutri compra.
create table if not exists public.estoque_itens (
  id         uuid primary key default gen_random_uuid(),
  nutri_id   uuid not null references public.nutris(id) on delete cascade,
  nome       text not null,
  quantidade integer not null default 0 check (quantidade >= 0),
  unidade    text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Único por nutri: impede o mesmo item cadastrado duas vezes, o que
-- espalharia o saldo em duas linhas e faria o limitante mentir.
create unique index if not exists estoque_itens_nutri_nome_idx
  on public.estoque_itens (nutri_id, nome);

comment on column public.estoque_itens.quantidade is
  'Unidades em estoque. O check >= 0 e a rede de seguranca do banco: mesmo que
   a tela erre a conta, o estoque nao fica negativo — a montagem falha antes.';

comment on column public.estoque_itens.unidade is
  'Rotulo de exibicao (un, sache, g). Nao entra em nenhum calculo.';


-- 1.2 Receita: o que cada tipo de box leva, e quanto de cada.
create table if not exists public.box_receitas (
  id                    uuid primary key default gen_random_uuid(),
  nutri_id              uuid not null references public.nutris(id) on delete cascade,
  box_tipo              text not null check (box_tipo in ('Emagrecimento', 'Oncologia')),
  item_id               uuid not null references public.estoque_itens(id) on delete restrict,
  quantidade_necessaria integer not null check (quantidade_necessaria > 0)
);

-- Um item aparece no maximo uma vez por receita: duas linhas do mesmo item
-- fariam o desconto rodar duas vezes e o limitante contar errado.
create unique index if not exists box_receitas_unq
  on public.box_receitas (nutri_id, box_tipo, item_id);

comment on constraint box_receitas_item_id_fkey on public.box_receitas is
  'on delete RESTRICT, nao cascade, de proposito: com cascade, excluir um item
   sumiria com a linha da receita e a contagem de boxes possiveis SUBIRIA — o
   item limitante teria desaparecido. Numero errado que ninguem questiona.
   Com restrict o banco recusa e a tela explica que o item esta em uso.';

comment on column public.box_receitas.quantidade_necessaria is
  'check > 0: um zero causaria divisao por zero no calculo do limitante.';


-- 1.3 Livro de movimentos. So recebe insert.
create table if not exists public.estoque_movimentos (
  id         uuid primary key default gen_random_uuid(),
  nutri_id   uuid not null references public.nutris(id) on delete cascade,
  item_id    uuid not null references public.estoque_itens(id) on delete cascade,
  delta      integer not null check (delta <> 0),
  motivo     text not null check (motivo in ('montagem_box', 'compra', 'ajuste', 'estorno')),
  box_tipo   text,
  created_at timestamptz not null default now()
);

-- O historico e sempre lido do mais recente para o mais antigo.
create index if not exists estoque_movimentos_nutri_data_idx
  on public.estoque_movimentos (nutri_id, created_at desc);

comment on column public.estoque_movimentos.delta is
  'Negativo = saida, positivo = entrada. check <> 0 porque movimento de zero
   nao e movimento — seria ruido no historico.';

comment on column public.estoque_movimentos.item_id is
  'on delete CASCADE aqui, ao contrario da receita: o historico de um item
   excluido nao serve para nada sozinho, e manter a linha impediria a exclusao.';


-- 2. RLS ---------------------------------------------------------------
alter table public.estoque_itens      enable row level security;
alter table public.box_receitas       enable row level security;
alter table public.estoque_movimentos enable row level security;

drop policy if exists estoque_itens_nutri on public.estoque_itens;
create policy estoque_itens_nutri on public.estoque_itens
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

drop policy if exists box_receitas_nutri on public.box_receitas;
create policy box_receitas_nutri on public.box_receitas
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

drop policy if exists estoque_movimentos_nutri on public.estoque_movimentos;
create policy estoque_movimentos_nutri on public.estoque_movimentos
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());


-- 3. FUNÇÃO: montar_box ------------------------------------------------
-- SECURITY INVOKER, ao contrario de confirmar_consulta (2026-07-29), e a
-- diferenca e proposital: la a PACIENTE precisava escrever numa tabela onde
-- ela nao tem UPDATE, entao a funcao emprestava privilegio. Aqui quem chama e
-- a propria nutri, que ja tem `for all` nas tres tabelas pela RLS acima. Nao
-- ha privilegio a emprestar, e invoker mantem a RLS valendo dentro da funcao:
-- se algo escapasse do filtro por nutri_id, a policy ainda barraria.
--
-- O QUE ELA RESOLVE, e por que nao e a tela que faz: seis UPDATEs disparados
-- do cliente podem aplicar tres e falhar no quarto — estoque pela metade e
-- nenhuma box montada. A funcao inteira e uma transacao: qualquer `raise`
-- desfaz tudo. E a verificacao ("da para montar?") acontece no mesmo instante
-- do desconto, sem a janela que existiria entre checar na tela e descontar
-- depois.
--
-- Sem `for update` nas linhas: seria o rigor correto num sistema com varios
-- usuarios simultaneos, mas aqui e uma nutri so, num aparelho de cada vez.
-- Registrado como escolha, nao como esquecimento.
create or replace function public.montar_box(p_box_tipo text)
returns table (item_id uuid, nome text, quantidade_nova integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nutri_id  uuid := auth.uid();
  v_itens     integer;
  v_possiveis integer;
begin
  if v_nutri_id is null then
    raise exception 'Sem usuario autenticado' using errcode = '42501';
  end if;

  -- Contagem e limitante saem da MESMA consulta, ja com o join aplicado.
  -- Separa-las deixaria um furo: uma receita apontando para item de outra
  -- nutri contaria como item existente mas sumiria no join, e o limitante
  -- seria calculado sobre menos itens do que a receita tem.
  select count(*), min(e.quantidade / r.quantidade_necessaria)
    into v_itens, v_possiveis
  from public.box_receitas r
  join public.estoque_itens e
    on e.id = r.item_id
   and e.nutri_id = v_nutri_id
  where r.nutri_id = v_nutri_id
    and r.box_tipo = p_box_tipo;

  -- Receita vazia e estoque zerado sao coisas OPOSTAS e precisam de erros
  -- diferentes: uma pede cadastrar a receita, a outra pede comprar item. O
  -- min() de conjunto vazio devolve NULL, nao zero — tratar os dois como
  -- "0 boxes" e exatamente a confusao que este bloco evita.
  if v_itens = 0 then
    raise exception 'A receita da box % esta vazia — cadastre os itens antes de montar', p_box_tipo
      using errcode = 'P0001';
  end if;

  if coalesce(v_possiveis, 0) < 1 then
    raise exception 'Estoque insuficiente para montar a box %', p_box_tipo
      using errcode = 'P0001';
  end if;

  -- Desconto. A divisao inteira do Postgres ja garante que so chegamos aqui
  -- com todos os itens suficientes, e o check (quantidade >= 0) da tabela e a
  -- segunda barreira.
  update public.estoque_itens e
     set quantidade = e.quantidade - r.quantidade_necessaria
    from public.box_receitas r
   where r.item_id  = e.id
     and r.nutri_id = v_nutri_id
     and r.box_tipo = p_box_tipo
     and e.nutri_id = v_nutri_id;

  -- Movimento na mesma transacao do desconto: ou os dois acontecem, ou
  -- nenhum. Gravar pela tela, depois, permitiria estoque baixado sem
  -- historico correspondente.
  insert into public.estoque_movimentos (nutri_id, item_id, delta, motivo, box_tipo)
  select v_nutri_id, r.item_id, -r.quantidade_necessaria, 'montagem_box', p_box_tipo
  from public.box_receitas r
  join public.estoque_itens e
    on e.id = r.item_id
   and e.nutri_id = v_nutri_id
  where r.nutri_id = v_nutri_id
    and r.box_tipo = p_box_tipo;

  -- Devolve o estado novo dos itens da receita, para a tela atualizar sem
  -- refazer a consulta.
  return query
    select e.id, e.nome, e.quantidade
    from public.estoque_itens e
    join public.box_receitas r
      on r.item_id = e.id
     and r.nutri_id = v_nutri_id
    where r.box_tipo = p_box_tipo
      and e.nutri_id = v_nutri_id
    order by e.nome;
end;
$$;

-- Sem anon e sem public: so usuaria logada. O Postgres concede execute a
-- `public` por padrao em funcao nova, entao o revoke vem antes do grant —
-- mesmo cuidado da confirmar_consulta.
revoke all on function public.montar_box(text) from public, anon;
grant execute on function public.montar_box(text) to authenticated;


-- =============================================================
-- Conferência (rode depois do Run)
--
--   -- as tres tabelas existem e estao com RLS ligada?
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public'
--      and tablename in ('estoque_itens','box_receitas','estoque_movimentos');
--   -- rowsecurity = true nas tres
--
--   -- uma policy por tabela, cmd = ALL?
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('estoque_itens','box_receitas','estoque_movimentos')
--    order by tablename;
--
--   -- a funcao entrou como invoker?
--   select proname, prosecdef, proconfig
--     from pg_proc where proname = 'montar_box';
--   -- prosecdef = false (invoker), proconfig = {search_path=public}
--
--   -- so authenticated executa?
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_name = 'montar_box';
-- =============================================================
