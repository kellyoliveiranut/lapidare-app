-- =============================================================
-- Migration 2026-08-18
-- vendas.nf_emitida — marca se a nota fiscal daquela venda já saiu
-- =============================================================
-- POR QUE AGORA: a emissão da nota é um controle manual, feito fora da app,
-- e hoje não há onde registrar que já foi feita. O único vestígio de nota
-- fiscal no sistema é o endereço da paciente ("opcional · para nota fiscal",
-- Cadastrar.jsx), que serve pra emitir — não pra saber se emitiu.
--
-- POR QUE EM `vendas` E NÃO EM `parcelas`: a nota é do serviço vendido, não
-- de cada parcela. Uma venda parcelada em 6x gera uma nota, não seis.
--
-- POR QUE NÃO EM `consultas`: consultas não têm nenhum campo financeiro
-- (nem valor, nem pagamento) — o dinheiro da app inteira mora em vendas.
-- Consulta cobrada é uma linha de `vendas`, e é lá que a marcação vale.
--
-- POR QUE BOOLEAN E NÃO DATA OU NÚMERO: o que a nutri precisa saber ao bater
-- o mês é "falta nota nesta?". Data e número da NF vivem no emissor, e uma
-- coluna a mais que ninguém preenche vira ruído. Se um dia o número fizer
-- falta, entra como coluna nova — booleano já gravado não atrapalha.
--
-- POR QUE NOT NULL DEFAULT FALSE: as vendas que já existem não têm nota
-- registrada, e "não sei" aqui é o mesmo que "não emitida" — a nutri vai
-- marcar as que saíram. Nulo obrigaria todo filtro a tratar três estados
-- (true / false / nulo) pra descrever dois.
--
-- RLS: nada a fazer. As policies de `vendas` são por linha (nutri_id), não
-- por coluna — a coluna nova herda a proteção existente.
--
-- Idempotente: add column if not exists. Rodar de novo é no-op.
--
-- ATENÇÃO À ORDEM: rode esta migration ANTES de publicar o código novo. As
-- telas Financeiro real e a aba Financeiro do perfil listam as colunas de
-- `vendas` explicitamente no select, e passam a pedir `nf_emitida` — sem a
-- coluna no banco, o select falha e as duas telas ficam sem vendas.
-- =============================================================

alter table public.vendas
  add column if not exists nf_emitida boolean not null default false;

comment on column public.vendas.nf_emitida is
  'True quando a nota fiscal desta venda já foi emitida. Controle manual da nutri — a app não emite nem consulta nota, só registra o que ela marcou.';


-- =============================================================
-- Conferência (rode depois do Run):
--   -- a coluna existe, é not null e tem default false?
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'vendas'
--      and column_name = 'nf_emitida';
--
--   -- nenhuma venda ficou com nulo?
--   select count(*) filter (where nf_emitida is null) as nulas,
--          count(*) filter (where nf_emitida)         as emitidas,
--          count(*)                                   as total
--     from public.vendas;
-- =============================================================
