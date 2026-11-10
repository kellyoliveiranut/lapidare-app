-- Tarefas da nutri (lembretes_nutri): campo de observação.
-- Texto livre, opcional. Aparece na lista do dia e na linha do tempo (régua).
-- Só acrescenta uma coluna; nenhuma tarefa existente muda. Idempotente.
alter table public.lembretes_nutri add column if not exists obs text;

comment on column public.lembretes_nutri.obs is
  'Observação livre da tarefa (opcional). Só a nutri lê: a tabela inteira é privada dela.';
