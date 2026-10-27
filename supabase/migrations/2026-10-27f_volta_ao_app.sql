-- Controle do lembrete "volte ao app" (função agendada volta-ao-app): quando
-- foi o último envio e quantos já saíram nesta ausência. Só a função, com a
-- chave de serviço, escreve aqui. Idempotente. Ctrl+A antes do Run.
alter table public.pacientes add column if not exists volta_app_enviado_em timestamptz;
alter table public.pacientes add column if not exists volta_app_envios smallint not null default 0;
