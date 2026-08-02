-- ATENÇÃO: já aplicado em produção. Este arquivo é registro, não execução.
--
-- 2026-08-01: baseline de vendas e parcelas
-- As duas tabelas são a base do Financeiro real desde sempre e nunca entraram
-- no histórico de migrations nem no setup.sql. Este arquivo registra a
-- estrutura real, extraída do banco por query.
--
-- LIMITAÇÃO CONHECIDA: o ON DELETE das foreign keys não foi capturado — a
-- consulta que trouxe o resto não incluiu a regra de exclusão. As FKs abaixo
-- estão SEM cláusula ON DELETE, que não é a mesma coisa que ter certeza de que
-- não há uma. Isso importa em um ponto concreto: o código assume CASCADE de
-- vendas para parcelas. O modal de exclusão em ListaVendas avisa "todas as
-- parcelas relacionadas também serão removidas", e criarVendaComParcelas()
-- (lib/vendas.js) faz rollback deletando só a venda quando o insert das
-- parcelas falha, contando que as parcelas órfãs não fiquem para trás. Se a FK
-- real for NO ACTION, excluir uma venda com parcelas dá erro de violação. Vale
-- confirmar com pg_get_constraintdef antes de reconstruir o banco a partir
-- daqui.

create table if not exists public.vendas (
  id           uuid        not null default gen_random_uuid(),
  nutri_id     uuid        not null,
  paciente_id  uuid,
  servico_id   uuid,
  servico      text        not null,
  valor_total  numeric     not null,
  forma_pgto   text        not null,
  data_venda   date        not null default current_date,
  obs          text,
  created_at   timestamptz not null default now(),
  constraint vendas_pkey primary key (id),
  constraint vendas_nutri_id_fkey    foreign key (nutri_id)    references nutris(id),
  constraint vendas_paciente_id_fkey foreign key (paciente_id) references pacientes(id),
  constraint vendas_servico_id_fkey  foreign key (servico_id)  references servicos(id)
);

create index if not exists vendas_nutri_id_idx   on public.vendas (nutri_id, data_venda desc);
create index if not exists vendas_servico_id_idx on public.vendas (servico_id, data_venda);

create table if not exists public.parcelas (
  id          uuid    not null default gen_random_uuid(),
  venda_id    uuid    not null,
  nutri_id    uuid    not null,
  numero      integer not null,
  valor       numeric not null,
  vencimento  date    not null,
  status      text    not null default 'pendente',
  data_pgto   date,
  obs         text,
  constraint parcelas_pkey primary key (id),
  constraint parcelas_venda_id_fkey foreign key (venda_id) references vendas(id),
  constraint parcelas_nutri_id_fkey foreign key (nutri_id) references nutris(id)
);

create index if not exists parcelas_nutri_id_idx on public.parcelas (nutri_id, vencimento);
create index if not exists parcelas_venda_id_idx on public.parcelas (venda_id);

alter table public.vendas   enable row level security;
alter table public.parcelas enable row level security;

create policy vendas_all   on public.vendas   for all using (nutri_id = auth.uid());
create policy parcelas_all on public.parcelas for all using (nutri_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTAS
--
-- 1) NÃO existe índice em vendas.paciente_id.
--    A aba Financeiro do perfil da paciente (src/app/nutri/_Financeiro.jsx)
--    filtra exatamente por (nutri_id, paciente_id). O índice
--    vendas_nutri_id_idx cobre o nutri_id e o Postgres filtra o paciente_id
--    em cima disso, o que é aceitável no volume atual — uma nutri tem dezenas
--    ou centenas de vendas, não milhões. Se a consulta ficar lenta, o índice a
--    criar é (nutri_id, paciente_id, data_venda desc). Não foi criado agora
--    para não alterar produção junto com um baseline.
--
-- 2) parcelas.status NÃO tem check constraint.
--    A coluna é text com default 'pendente', e o código trata três valores:
--    'pago', 'pendente' e 'atrasado' (statusParcela() em lib/utils.js e o
--    STATUS_PARCELA_INFO ao lado dela). Nada no banco impede um quarto valor.
--    Se entrar um, statusParcela() cai no ramo final e devolve 'pendente' —
--    ou seja, degrada em silêncio, não quebra. Um check constraint fecharia
--    isso, mas alterar produção é decisão separada.
--
-- 3) parcelas não tem paciente_id.
--    O vínculo com a paciente é indireto, via venda_id → vendas.paciente_id.
--    É por isso que a aba do perfil busca as parcelas aninhadas em vendas
--    (embedding do PostgREST pela FK parcelas_venda_id_fkey) em vez de filtrar
--    parcelas direto.
--
-- 4) vendas.paciente_id é nullable de propósito — é o que permite a "venda
--    avulsa", sem paciente atribuída. A aba do perfil, por definição, nunca
--    mostra essas.
-- ─────────────────────────────────────────────────────────────────────────────
