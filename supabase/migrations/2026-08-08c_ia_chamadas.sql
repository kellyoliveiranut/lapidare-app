-- =============================================================
-- Migration 2026-08-08c
-- ia_chamadas — rate-limit das chamadas de IA por nutri
-- =============================================================
-- CONTEXTO: até esta mudança o front chamava api.anthropic.com direto do
-- navegador, com a chave embutida no bundle (VITE_ANTHROPIC_API_KEY). A chamada
-- passou para netlify/functions/anthropic-proxy.js, que autentica a nutri pelo
-- Bearer token e usa a chave do servidor. Esta tabela é o freio de uso.
--
-- POR QUE UMA LINHA POR CHAMADA, E NÃO UM CONTADOR: login_tentativas conta
-- FALHAS e bloqueia por 15 min — semântica de defesa contra ataque. Aqui o que
-- se conta é SUCESSO (uso legítimo que custa dinheiro), numa janela deslizante
-- de 1 minuto. Contador com reset por janela erra na borda (12 chamadas às
-- 10:59:59 mais 12 às 11:00:01 passam as duas). Uma linha por chamada e um
-- count() na janela é exato e mais simples de auditar.
--
-- A TABELA NÃO CRESCE: cada gravação apaga antes as linhas da própria nutri com
-- mais de 1 hora. Sem job de limpeza, sem tabela infinita. O que sobra é
-- histórico suficiente para calibrar o limite depois, com dado real.
--
-- RLS LIGADO E SEM POLICY NENHUMA: só a service role (a Netlify Function) lê e
-- escreve. Nutri e paciente não têm acesso — nem select. Uma policy aqui seria
-- furo: quem consegue apagar a própria linha zera o próprio limite.
-- =============================================================

create table if not exists public.ia_chamadas (
  id        uuid primary key default gen_random_uuid(),
  nutri_id  uuid not null references public.nutris(id) on delete cascade,
  criada_em timestamptz not null default now()
);

-- (nutri_id, criada_em desc): a única leitura é "quantas desta nutri no último
-- minuto", e a única escrita de limpeza é por nutri + idade.
create index if not exists ia_chamadas_nutri_idx
  on public.ia_chamadas (nutri_id, criada_em desc);

alter table public.ia_chamadas enable row level security;
-- (sem create policy — negado para todos; a service role passa por cima da RLS)

comment on table public.ia_chamadas is
  'Uma linha por chamada de IA aceita. Janela deslizante de rate-limit em anthropic-proxy.js. Linhas com mais de 1h são apagadas na gravação seguinte.';


-- =============================================================
-- Conferência
--   select count(*) from public.ia_chamadas;
--   -- RLS ligada?
--   select relrowsecurity from pg_class where relname = 'ia_chamadas';
--   -- tem que voltar ZERO linhas:
--   select policyname from pg_policies
--    where schemaname = 'public' and tablename = 'ia_chamadas';
-- =============================================================
