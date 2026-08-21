-- mensagens_ciclo: de "uma mensagem por fase" para LISTA com rotação, e com
-- sub-fase do ciclo.
--
-- Contexto: a tabela nasceu com unique (nutri_id, fase) e o app fazia upsert
-- nela — uma linha por fase, trocada quando a nutri escrevia outra. Agora as
-- três abas (Oncologia, Neutras e, depois, Emagrecimento) passam a girar entre
-- várias mensagens, como mensagens_emagrecimento já faz desde julho.
--
-- Aditiva e idempotente: nenhum drop de coluna, nenhum rename, nenhum delete.
-- Reverter é recriar o unique da seção 3.
--
-- RODAR SEM begin/commit no SQL Editor do Supabase (Ctrl+A antes do Run).

-- ── 1. Colunas de lista ─────────────────────────────────────────────────────
-- `ativo` NÃO é criada aqui: já existe desde a baseline (boolean not null
-- default true) e é o equivalente do `ativa` de mensagens_emagrecimento. Os
-- dois nomes divergem, e a divergência fica — renomear coluna em produção só
-- para ganhar simetria não se paga. O código normaliza na borda.
alter table public.mensagens_ciclo add column if not exists ordem     integer not null default 0;
alter table public.mensagens_ciclo add column if not exists fixada_em timestamptz;

-- ── 2. Sub-fase do ciclo ────────────────────────────────────────────────────
-- 'infusao' | 'alerta' | 'risco' | 'recuperacao', casadas com a fase real da
-- paciente hoje (ver protocoloCiclo.faseDoDia). NULL = mensagem genérica, que
-- serve quem não tem ciclo identificável — e é também o fallback de qualquer
-- grupo que fique sem mensagem ativa.
--
-- São estas quatro, e não os seis rótulos da biblioteca de exemplos, porque
-- valem para os 73 protocolos do catálogo: casar por `desc` de marco falharia
-- calado em BEP, Taxol Semanal, FLOX, R-CHOP, T-DD e FOLFIRINOX.
alter table public.mensagens_ciclo add column if not exists grupo_ciclo text;

alter table public.mensagens_ciclo drop constraint if exists mensagens_ciclo_grupo_check;
alter table public.mensagens_ciclo add constraint mensagens_ciclo_grupo_check
  check (grupo_ciclo is null or grupo_ciclo in ('infusao','alerta','risco','recuperacao'));

-- ── 3. O unique que impedia a lista ─────────────────────────────────────────
-- Era ele que fazia "uma mensagem por fase" e sustentava o upsert com
-- onConflict 'nutri_id,fase'. Sai por último entre as mudanças de estrutura,
-- para o resto já estar no lugar.
alter table public.mensagens_ciclo drop constraint if exists mensagens_ciclo_nutri_id_fase_key;

-- ── 4. Índices ──────────────────────────────────────────────────────────────
-- Leitura: sempre (nutri, fase, grupo) na ordem da rotação.
create index if not exists mensagens_ciclo_nutri_fase_grupo_ordem_idx
  on public.mensagens_ciclo (nutri_id, fase, grupo_ciclo, ordem);

-- No máximo UMA fixada por grupo. O coalesce é obrigatório: em índice único,
-- NULL nunca conflita com NULL, então sem ele daria para fixar duas genéricas
-- ao mesmo tempo e a paciente veria uma das duas ao acaso.
drop index if exists mensagens_ciclo_uma_fixada;
create unique index mensagens_ciclo_uma_fixada
  on public.mensagens_ciclo (nutri_id, fase, (coalesce(grupo_ciclo, '')))
  where fixada_em is not null;
