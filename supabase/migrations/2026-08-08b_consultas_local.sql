-- =============================================================
-- Migration 2026-08-08b
-- consultas.local_id — qual local presencial
-- =============================================================
-- Nulável de propósito: consulta online não tem local, e as consultas
-- existentes (todas 'online' desde 2026-07-28) nascem null sem backfill.
--
-- POR QUE on delete set null: apagar um local não pode apagar consulta. Na
-- prática a tela nem oferece apagar — usa ativo=false —, mas se acontecer no
-- SQL a consulta sobrevive perdendo só a referência.
--
-- POR QUE O CHECK NÃO EXIGE local_id NO PRESENCIAL: a obrigatoriedade é do
-- fluxo de cadastro, não do dado. O modal bloqueia salvar presencial sem local
-- (validação no salvar(), em Agenda.jsx), mas o banco continua aceitando linha
-- presencial sem local — é o que permite consulta antiga ou criada por outro
-- caminho (PacientePerfil.jsx) existir sem quebrar. O check só proíbe o
-- contrário: local guardado numa consulta online, que seria lixo silencioso.
--
-- RLS: nada a mudar. consultas_write_nutri já é `for all using (nutri_id =
-- auth.uid())` e cobre a coluna nova.
--
-- Aditivo e idempotente: add column if not exists + drop/add da constraint.
-- =============================================================

alter table public.consultas
  add column if not exists local_id uuid
  references public.locais_atendimento(id) on delete set null;

comment on column public.consultas.local_id is
  'Local presencial (locais_atendimento). Null quando modalidade = online.';

-- Coerência: local só faz sentido no presencial. O front já manda
-- local_id: null ao escolher online — o check é a rede embaixo.
alter table public.consultas
  drop constraint if exists consultas_local_modalidade_check;
alter table public.consultas
  add constraint consultas_local_modalidade_check
  check (modalidade = 'presencial' or local_id is null);


-- =============================================================
-- Conferência
--   select modalidade,
--          count(*) filter (where local_id is not null) as com_local,
--          count(*) as total
--     from public.consultas group by modalidade;
-- =============================================================
