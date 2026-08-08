-- =============================================================
-- Migration 2026-08-08d
-- pacientes.cpf e pacientes.rg — documentos da paciente
-- =============================================================
-- POR QUE AGORA: o cadastro rápido pela Agenda extrai os dados de um texto
-- colado, e CPF/RG vêm nesse texto. Hoje não havia onde guardar: `cpf` só
-- existe em pacientes_pendentes (populado pelo importador de CSV), e o
-- pendente é registro de convite — some da vida útil assim que a paciente
-- ativa a conta. O documento pertence à ficha.
--
-- POR QUE OS DOIS NULLABLE: a maioria das pacientes já cadastradas não tem
-- esses dados, e o fluxo normal (tela Cadastrar) não pede nenhum dos dois.
-- Coluna obrigatória quebraria todo insert existente.
--
-- POR QUE TEXT E NÃO NUMÉRICO: CPF tem zero à esquerda, que numeric come.
-- RG é emitido por estado, aceita letra ("X" como dígito verificador) e não
-- tem formato nacional — qualquer máscara ou check rejeitaria RG legítimo.
--
-- POR QUE SEM UNIQUE EM cpf: duas fichas com o mesmo CPF é quase sempre erro,
-- mas não sempre (recadastro, ficha antiga arquivada) — e um unique faria o
-- insert estourar no meio do fluxo rápido, sem a nutri entender por quê. A
-- tela avisa antes de salvar e deixa ela decidir. Índice abaixo é só de busca.
--
-- RLS: nada a fazer. As policies de `pacientes` são por linha (nutri_id /
-- auth.uid()), não por coluna — as colunas novas herdam a proteção existente.
--
-- Idempotente: add column if not exists / create index if not exists.
-- Rodar de novo é no-op.
-- =============================================================

alter table public.pacientes
  add column if not exists cpf text;

alter table public.pacientes
  add column if not exists rg  text;

comment on column public.pacientes.cpf is
  'Somente dígitos, sem pontuação. Nulo quando não informado.';
comment on column public.pacientes.rg is
  'Como emitido — formato varia por estado, pode conter letra. Nulo quando não informado.';

-- Índice parcial: serve o aviso de "já existe paciente com este CPF" da tela
-- de cadastro rápido. Parcial porque a esmagadora maioria das linhas tem cpf
-- nulo e não precisa ocupar o índice.
create index if not exists pacientes_nutri_cpf_idx
  on public.pacientes (nutri_id, cpf)
  where cpf is not null;


-- =============================================================
-- Conferência (rode depois do Run):
--   -- as duas colunas existem e são nuláveis?
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'pacientes'
--      and column_name in ('cpf', 'rg');
--
--   -- o índice entrou?
--   select indexname, indexdef from pg_indexes
--    where tablename = 'pacientes' and indexname = 'pacientes_nutri_cpf_idx';
-- =============================================================
