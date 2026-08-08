-- =============================================================
-- Migration 2026-08-08
-- locais_atendimento — onde acontece a consulta presencial
-- =============================================================
-- POR QUE TABELA NOVA E NÃO MAIS UM VALOR EM modalidade: modalidade responde
-- "como" (online | presencial) e o check consultas_modalidade_check trava isso.
-- O local responde "onde", só existe no presencial e é dado da nutri, não da
-- consulta — vira lista própria, editável, sem tocar no check.
--
-- POR QUE endereco É TEXTO LIVRE: entra em link de Google Agenda e em mensagem
-- de WhatsApp, os dois consomem uma linha só. Rua/número/complemento separados
-- só dariam trabalho de remontar.
--
-- POR QUE ativo EM VEZ DE DELETE: local aposentado ainda é referenciado por
-- consultas antigas. A tela some com ele; a linha fica.
--
-- RLS: mesmo padrão de envios_farmacia — uma policy `for all` por nutri_id.
-- A paciente não lê nada aqui (hoje ela nem vê modalidade na tela dela).
--
-- Idempotente: create table / create index / drop+create policy / insert com
-- on conflict do nothing. Rodar de novo é no-op.
-- =============================================================

-- 1. TABELA ------------------------------------------------------------
create table if not exists public.locais_atendimento (
  id         uuid primary key default gen_random_uuid(),
  nutri_id   uuid not null references public.nutris(id) on delete cascade,
  nome       text not null,
  endereco   text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Único por nutri: evita "CTO" duplicado e é o alvo do on conflict do seed.
create unique index if not exists locais_atendimento_nutri_nome_idx
  on public.locais_atendimento (nutri_id, nome);


-- 2. RLS ---------------------------------------------------------------
alter table public.locais_atendimento enable row level security;

drop policy if exists locais_atendimento_nutri on public.locais_atendimento;
create policy locais_atendimento_nutri on public.locais_atendimento
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());


-- 3. SEED (os dois locais da Kelly) ------------------------------------
-- Sem UUID chumbado: casa por e-mail em nutris. Se a nutri não existir, o
-- insert não faz nada em vez de quebrar.
insert into public.locais_atendimento (nutri_id, nome, endereco)
select n.id, v.nome, v.endereco
from public.nutris n
cross join (values
  ('CTO',         'R. dos Mundurucus, 4402 - Guamá'),
  ('Wanderloock', 'Almirante Wandenkolk 811, Ed Village Millenium, 7º andar sala 704, entre José Malcher e João Balbi')
) as v(nome, endereco)
where n.email = 'kellynut01@gmail.com'
on conflict (nutri_id, nome) do nothing;


-- =============================================================
-- Conferência
--   select nome, endereco, ativo from public.locais_atendimento;
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='locais_atendimento';
-- =============================================================
