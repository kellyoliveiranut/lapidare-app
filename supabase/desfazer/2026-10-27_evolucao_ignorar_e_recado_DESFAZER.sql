-- DESFAZER da 2026-10-27. NÃO colocar em supabase/migrations/. Rodar só se for preciso reverter.
-- ATENÇÃO: apaga as marcações "ignorar nas contas" e todos os recados da evolução já gravados.
-- As avaliações em si não são apagadas. Só rodar depois de tirar do app o uso destas colunas.
drop trigger if exists trg_protege_recado_evolucao on public.pacientes;
drop function if exists public.protege_recado_evolucao();
alter table public.pacientes drop constraint if exists pacientes_recado_evolucao_tam_chk;
alter table public.pacientes drop column if exists recado_evolucao;
alter table public.peso_registros drop column if exists ignorar_calculo;
