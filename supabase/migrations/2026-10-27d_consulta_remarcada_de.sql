-- Guarda a data em que a consulta estava marcada antes de ser remarcada ou
-- mandada para "A definir". Só a nutri grava (update normal da Agenda); a
-- paciente não tem UPDATE em consultas, então nada muda para ela.
-- Idempotente. Rodar com Ctrl+A antes do Run.
alter table public.consultas add column if not exists remarcada_de timestamptz;
