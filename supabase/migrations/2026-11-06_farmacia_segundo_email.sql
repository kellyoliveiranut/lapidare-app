-- Segundo e-mail da farmácia de manipulação (opcional). O envio de fórmula
-- passa a ir para os dois endereços. Idempotente.
alter table public.nutris add column if not exists farmacia_email_2 text;
