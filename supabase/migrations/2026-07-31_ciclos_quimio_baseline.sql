-- ATENÇÃO: já aplicado em produção. Este arquivo é registro, não execução.
--
-- 2026-07-31: baseline de ciclos_quimio
-- A coluna aplicacao_no_ciclo foi aplicada por rascunho_ciclos_aplicacao_no_ciclo.sql
-- sem entrar no histórico de migrations. Este arquivo registra a estrutura real.
--
-- Contexto crítico: d3/d7/d10/d14 são COLUNAS GERADAS a partir de data_quimio,
-- não campos preenchidos. São a base do cálculo de fase do ciclo — a comparação
-- é com esses marcos, nunca com intervalo entre ciclos, porque não existe
-- intervalo padrão na base (medido em 30/07: 7, 21, 22, 29, 33 e 37 dias, mais
-- 6 pacientes com ciclo único).
--
-- aplicacao_no_ciclo existe para protocolos com múltiplas aplicações no mesmo
-- ciclo (Taxol Semanal D1/D8/D15). Nullable: em 31/07 havia 8 linhas com 1 e
-- 24 com null. O gerador de série passa a gravar 1 explicitamente nas linhas
-- não estruturadas; o backfill das antigas segue pendente.

create table if not exists public.ciclos_quimio (
  id                 uuid        not null default gen_random_uuid(),
  tratamento_id      uuid        not null,
  paciente_id        uuid        not null,
  nutri_id           uuid        not null,
  numero_ciclo       integer     not null,
  data_quimio        date        not null,
  d3                 date        generated always as (data_quimio + 3)  stored,
  d7                 date        generated always as (data_quimio + 7)  stored,
  d10                date        generated always as (data_quimio + 10) stored,
  d14                date        generated always as (data_quimio + 14) stored,
  obs                text,
  aplicacao_no_ciclo smallint,
  created_at         timestamptz not null default now(),
  constraint ciclos_quimio_pkey primary key (id),
  constraint ciclos_quimio_tratamento_id_fkey foreign key (tratamento_id)
    references tratamentos_oncologicos(id) on delete cascade,
  constraint ciclos_quimio_paciente_id_fkey foreign key (paciente_id)
    references pacientes(id) on delete cascade,
  constraint ciclos_quimio_nutri_id_fkey foreign key (nutri_id)
    references nutris(id) on delete cascade
);

-- NOTA: não existe unique em (paciente_id, numero_ciclo, aplicacao_no_ciclo).
-- Nada impede ciclo duplicado, e o cadastro é manual — em 31/07 havia duas
-- duplicatas reais. O modal de série bloqueia no cliente, mas o banco não.
