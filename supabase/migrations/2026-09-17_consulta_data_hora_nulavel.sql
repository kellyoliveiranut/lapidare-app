-- =============================================================
-- Migration 2026-09-17
-- consultas.data_hora — passa a ser NULAVEL
-- =============================================================
-- BASELINE RETROATIVA. Esta mudanca JA ESTA no banco de producao: foi
-- aplicada a mao pelo SQL Editor, a partir de um rascunho que nunca virou
-- migration (rascunho_consulta_sem_data.sql, na raiz, marcado "nao
-- commitar"). O setup.sql seguiu dizendo `not null` desde entao, e a
-- divergencia so apareceu agora, ao desenhar a validacao de conflito de
-- horario da Agenda.
--
-- POR QUE NULAVEL: existe consulta "a definir", sem data marcada. O codigo
-- ja grava assim nos dois caminhos do perfil da paciente:
--   PacientePerfil.jsx:6445  pacote de 6   data_hora: semData ? null : ...
--   PacientePerfil.jsx:6595  avulsa        data_hora: semData ? null : ...
-- Com a coluna NOT NULL esses inserts falhariam. Como nao falham, o banco
-- ja aceita NULL — e a conferencia no fim confirma.
--
-- POR QUE E SEGURO: nada depende de data_hora ser NOT NULL.
--   · RLS consultas_select / consultas_write_nutri filtram por
--     paciente_id / nutri_id, nunca por data_hora.
--   · Os indices consultas_paciente_id_idx e consultas_nutri_id_idx sao
--     btree comuns em (coluna, data_hora). Btree indexa NULL sem reclamar,
--     e nenhum dos dois e parcial.
--   · Sem trigger e sem view sobre public.consultas.
--   · As FKs que apontam para consultas referenciam consultas.id.
--
-- QUEM JA SABE LIDAR COM O NULL: a funcao confirmar_consulta (setup.sql)
-- filtra `and c.data_hora is not null` antes de comparar com now(). O resto
-- do schema ja foi escrito assumindo que o NULL existe.
--
-- O QUE ISTO NAO FAZ: nao mexe em paciente_id, que continua NOT NULL. Isso
-- importa para o proximo passo — um bloqueio de agenda NAO pode ser uma
-- linha de consultas sem paciente, e por isso vai ganhar tabela propria.
--
-- IDEMPOTENTE: `drop not null` numa coluna ja nulavel e no-op, nao erro.
-- NAO E DESTRUTIVA: afrouxa uma restricao. Nenhuma linha muda de valor.
-- SEM begin/commit DE PROPOSITO: no SQL Editor do Supabase a conexao e
-- pooled e uma transacao explicita pode terminar em rollback SILENCIOSO.
-- Rode tudo de uma vez (Ctrl+A antes do Run).
-- =============================================================


-- 1. COLUNA -----------------------------------------------------------

alter table public.consultas
  alter column data_hora drop not null;


-- 2. DOCUMENTACAO -----------------------------------------------------

comment on column public.consultas.data_hora is
  'Instante da consulta (timestamptz). NULL = consulta "a definir", criada
   sem data pelo perfil da paciente: aparece nas listas como pendente de
   agendamento e fica fora da regua do dia e dos lembretes. Quem compara
   com now() precisa filtrar `data_hora is not null` antes.';


-- =============================================================
-- 3. CONFERENCIA — OBRIGATORIA, leia a saida
-- =============================================================

select (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'consultas'
           and column_name = 'data_hora')                       as data_hora_nulavel,
       (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'consultas'
           and column_name = 'paciente_id')                     as paciente_id_nulavel,
       (select count(*) from public.consultas
         where data_hora is null)                               as consultas_sem_data;

-- Esperado: YES | NO | qualquer numero (inclusive 0)
