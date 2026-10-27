-- DESFAZER da 2026-10-27c. NÃO colocar em supabase/migrations/. Rodar só se for preciso reverter.
-- ATENÇÃO: some a informação de QUEM marcou o "não irá"; o próprio "não irá"
-- (nao_confirmada_em) continua. Tirar do app o botão "Não irei" antes.
drop function if exists public.avisar_ausencia_consulta(uuid);
drop trigger if exists consultas_nao_confirmada_origem_tg on public.consultas;
drop function if exists public.consultas_nao_confirmada_origem();
alter table public.consultas drop constraint if exists consultas_nao_confirmada_por_chk;
alter table public.consultas drop column if exists nao_confirmada_por;
