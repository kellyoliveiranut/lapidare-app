-- =============================================================
-- Migration 2026-07-23
-- consultas — modalidade (online / presencial)
-- =============================================================
-- Marca cada consulta como online ou presencial, escolhido no modal de Nova
-- consulta / Editar da Agenda e exibido como chip na lista.
--
-- POR QUE NÃO REUSAR pacientes.modalidade: aquela coluna descreve o acordo da
-- paciente ('Online' | 'Presencial' | 'Híbrido'), não o que acontece numa
-- consulta específica. Paciente híbrida alterna entre as duas, e mesmo a
-- exclusivamente online tem a eventual presencial. Aqui é por consulta.
--
-- POR QUE SÓ DOIS VALORES: 'Híbrido' não faz sentido no nível da consulta — ela
-- é uma coisa ou a outra. Híbrido segue existindo só em pacientes.modalidade,
-- como perfil de atendimento, e o front normaliza na hora de sugerir
-- (Híbrido/vazio → 'online'; ver modalidadeDaPaciente em Agenda.jsx).
--
-- POR QUE MINÚSCULO: acompanha consultas.tipo e consultas.status. O CHECK trava
-- a caixa no banco, então não há como divergir depois — a herança vinda de
-- pacientes.modalidade (capitalizada) é normalizada no front antes de gravar.
--
-- RLS: nada a mudar. consultas_write_nutri já é `for all using (nutri_id =
-- auth.uid())` e cobre a coluna nova. A paciente segue só com SELECT.
--
-- Aditivo e idempotente: coluna com default 'online', sem dropar nada. As
-- consultas existentes nascem 'online' — a modalidade real de cada uma não foi
-- registrada em lugar nenhum até agora, e online é o caso dominante.
-- =============================================================

-- 1. COLUNA -----------------------------------------------------------
alter table public.consultas
  add column if not exists modalidade text not null default 'online';

-- CHECK em passo separado: `add column if not exists` não recria a constraint
-- se a coluna já existir, então o drop+add garante que ela esteja no lugar.
alter table public.consultas
  drop constraint if exists consultas_modalidade_check;
alter table public.consultas
  add constraint consultas_modalidade_check
  check (modalidade in ('online', 'presencial'));

comment on column public.consultas.modalidade is
  'Como a consulta acontece: online | presencial. Sem Híbrido — isso é perfil da paciente (pacientes.modalidade).';


-- =============================================================
-- Conferência
--   select modalidade, count(*) from public.consultas group by modalidade;
-- Aplicada no Supabase em 2026-07-28 — 268 consultas existentes, todas 'online'.
-- =============================================================
