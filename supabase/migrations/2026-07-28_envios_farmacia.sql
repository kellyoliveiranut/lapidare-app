-- =============================================================
-- Migration 2026-07-28
-- envios_farmacia + nutris.farmacia_* (documentação retroativa)
-- =============================================================
-- Criadas direto no Supabase por volta de 20/07/2026, junto do commit 3a49976
-- ("enviar fórmula pra farmácia"), e nunca versionadas. Este arquivo NÃO muda
-- nada em produção: transcreve o que já está lá para o banco poder ser recriado
-- do zero sem perder o histórico de envios nem a configuração da farmácia.
--
-- O QUE É: a nutri envia a fórmula de manipulação por e-mail para a farmácia
-- (netlify/functions/enviar-farmacia.js, via Brevo). Esta tabela é o histórico,
-- gravado só APÓS o envio ser confirmado — não é fila nem rascunho.
--
-- POR QUE farmacia_email É COPIADA NA LINHA: nutris.farmacia_email é a
-- configuração atual e muda quando a nutri troca de farmácia. A coluna aqui
-- congela para onde AQUELE envio foi de fato. Sem isso, trocar de farmácia
-- reescreveria a história de todos os envios anteriores.
--
-- POR QUE ON DELETE CASCADE NOS DOIS FKs: o histórico não sobrevive à paciente
-- nem à nutri — é dado clínico acessório, não registro contábil.
--
-- Idempotente: create table / add column / create index if not exists e
-- drop+create da policy. Rodar de novo é no-op.
-- =============================================================

-- 1. TABELA DE HISTÓRICO ----------------------------------------------
create table if not exists public.envios_farmacia (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid not null references public.pacientes(id) on delete cascade,
  nutri_id       uuid not null references public.nutris(id) on delete cascade,
  farmacia_email text not null,
  formula        text not null,
  enviado_em     timestamptz not null default now()
);

-- (paciente_id, enviado_em desc): a leitura é sempre "os últimos envios desta
-- paciente", então o índice já entrega ordenado.
create index if not exists envios_farmacia_paciente_idx
  on public.envios_farmacia using btree (paciente_id, enviado_em desc);


-- 2. CONFIGURAÇÃO DA FARMÁCIA (por nutri) -----------------------------
-- Nuláveis: nutri que ainda não configurou farmácia simplesmente não vê o
-- botão de envio. Editável na tela (Personalizacao.jsx), não é env var.
alter table public.nutris add column if not exists farmacia_email text;
alter table public.nutris add column if not exists farmacia_nome  text;


-- 3. RLS ---------------------------------------------------------------
-- Uma policy `for all` por nutri_id, mesmo padrão das outras tabelas dela.
-- A paciente não tem acesso nenhum ao histórico — nem select.
alter table public.envios_farmacia enable row level security;

drop policy if exists envios_farmacia_nutri on public.envios_farmacia;
create policy envios_farmacia_nutri on public.envios_farmacia
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());


-- =============================================================
-- Conferência
--   select count(*) from public.envios_farmacia;
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='envios_farmacia';
-- =============================================================
