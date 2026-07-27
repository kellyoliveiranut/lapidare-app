-- =============================================================
-- Migration 2026-07-23
-- consultas — confirmação de presença (marcação manual da nutri)
-- =============================================================
-- Novo eixo "confirmada", independente de `status`. A confirmação acontece
-- por WhatsApp, fora do app; estas colunas só registram o resultado para a
-- nutri ver de relance quem já confirmou e quem falta.
--
-- POR QUE NÃO REUSAR `status`: status (agendada|realizada|cancelada) é o ciclo
-- de vida — aconteceu ou não. Confirmação é ortogonal: uma consulta pode ser
-- agendada+confirmada ou agendada+não-confirmada. Mexer no CHECK de status
-- quebraria Previsibilidade.jsx, Visao.jsx (contagens), _Evolucao.jsx,
-- _RelatorioEvolucao.jsx, os filtros status<>'cancelada' da Agenda e a query
-- do banner da paciente (PacienteLayout.jsx, .eq('status','agendada')).
--
-- POR QUE timestamptz NULÁVEL E NÃO boolean: null = não confirmada; com data =
-- confirmada. Um campo, dois estados, e o "quando" vem de graça. É a convenção
-- que a tabela já usa (encerrada_em, iniciada_em, lembrete_enviado_em).
--
-- RLS: nada a mudar. consultas_write_nutri já é `for all using (nutri_id =
-- auth.uid())` → a nutri escreve nas colunas novas. A paciente segue só com
-- SELECT; quando ela puder confirmar pelo próprio app, o caminho é um RPC
-- security definer que só toque estas duas colunas (RLS não restringe coluna
-- no PostgREST) — as colunas aqui já servem pra isso, gravando
-- confirmada_por = 'paciente'.
--
-- Aditivo e idempotente: colunas nuláveis, sem default e sem backfill, então
-- toda consulta existente nasce "não confirmada" — que é a verdade, nada foi
-- registrado ainda. Nenhuma query do app faz select *.
-- =============================================================

-- 1. COLUNAS ----------------------------------------------------------
alter table public.consultas
  add column if not exists confirmada_em timestamptz;

-- Nesta etapa é sempre 'nutri' (ela anota o que veio pelo WhatsApp).
-- 'paciente' fica reservado para quando a paciente confirmar pelo app.
alter table public.consultas
  add column if not exists confirmada_por text;

-- CHECK em passo separado: `add column if not exists` não recria a constraint
-- se a coluna já existir, então o drop+add garante que ela esteja no lugar.
alter table public.consultas
  drop constraint if exists consultas_confirmada_por_check;
alter table public.consultas
  add constraint consultas_confirmada_por_check
  check (confirmada_por is null or confirmada_por in ('nutri', 'paciente'));

comment on column public.consultas.confirmada_em is
  'Quando a presença foi confirmada. NULL = não confirmada. Independente de status.';
comment on column public.consultas.confirmada_por is
  'Quem registrou: nutri (manual) ou paciente (app).';


-- 2. TRIGGER: REAGENDAR LIMPA A CONFIRMAÇÃO ---------------------------
-- Se a data/hora muda, a confirmação ficou obsoleta — a paciente confirmou
-- OUTRO horário. Melhor limpar do que deixar um ✓ mentindo na Agenda.
--
-- POR QUE NO BANCO E NÃO NO JS: data_hora é alterada em dois caminhos —
-- Agenda.jsx (salvar() do modal) e PacientePerfil.jsx (salvarDataConsulta, o
-- "A definir" → data). Em JS a regra ficaria duplicada e fácil de esquecer num
-- terceiro caminho futuro (o RPC da paciente, ou um UPDATE manual no SQL
-- Editor). No trigger é um lugar só e cobre todos.
--
-- Primeiro trigger em public.consultas. Não é security definer: não precisa de
-- privilégio nenhum, só mexe em NEW.
create or replace function public.consultas_limpa_confirmacao()
returns trigger
language plpgsql
as $$
begin
  -- Guard 1: só age se data_hora mudou de valor. O `update of data_hora` do
  -- trigger dispara sempre que a coluna aparece no SET (o payload do modal
  -- manda data_hora toda vez, mesmo salvando só a obs) — é aqui que "salvei
  -- sem mexer na data" deixa a confirmação em paz.
  --
  -- Guard 2: se o MESMO update já está mexendo em confirmada_em de propósito,
  -- respeita o valor que veio e não zera. Sem isso, um "reagendar e já marcar
  -- como confirmada" na mesma tacada perderia a marcação.
  if new.data_hora is distinct from old.data_hora
     and new.confirmada_em is not distinct from old.confirmada_em then
    new.confirmada_em  := null;
    new.confirmada_por := null;
  end if;
  return new;
end;
$$;

drop trigger if exists consultas_limpa_confirmacao_tg on public.consultas;
create trigger consultas_limpa_confirmacao_tg
  before update of data_hora on public.consultas
  for each row
  execute function public.consultas_limpa_confirmacao();


-- =============================================================
-- Conferência
--   select column_name, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='consultas'
--      and column_name in ('confirmada_em','confirmada_por');
--   select tgname from pg_trigger
--    where tgrelid='public.consultas'::regclass and not tgisinternal;
-- Aplicada no Supabase em 2026-07-27.
-- =============================================================
