-- Fixar uma mensagem de emagrecimento.
-- Quando `fixada_em` está preenchida, essa mensagem passa a aparecer para TODAS
-- as pacientes de emagrecimento da nutri, ignorando a rotação semanal, por até
-- 3 dias (72h a partir do clique). NULL = não fixada.
-- A expiração de 3 dias é decidida na LEITURA (cliente) — não precisa de cron.
alter table public.mensagens_emagrecimento
  add column if not exists fixada_em timestamptz;

-- Garante no máximo UMA mensagem fixada por nutri, no próprio banco
-- (defesa contra corrida, além da lógica do front).
create unique index if not exists mensagens_emag_uma_fixada
  on public.mensagens_emagrecimento (nutri_id)
  where fixada_em is not null;
