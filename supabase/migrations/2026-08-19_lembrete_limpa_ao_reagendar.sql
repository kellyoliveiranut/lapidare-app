-- =============================================================
-- Migration 2026-08-19
-- consultas — reagendar também limpa os lembretes
-- =============================================================
-- O trigger de 2026-07-23 zerava só confirmada_em/confirmada_por quando
-- data_hora mudava. Os lembretes ficavam para trás, com dois efeitos:
--
-- 1. COSMÉTICO: a consulta reagendada volta ao painel "Lembretes da semana"
--    (Agenda.jsx) já marcada "Enviado em <data antiga>", mesmo sem nenhum
--    lembrete ter saído para a data nova.
--
-- 2. SILENCIOSO E PIOR: netlify/functions/lembretes-consulta.js filtra por
--    `.is('push_lembrete_enviado_em', null)`. Com a marca antiga preservada,
--    a consulta é PULADA no lote da véspera da data nova — a paciente não
--    recebe lembrete nenhum, e nada na tela indica isso.
--
-- POR QUE NO MESMO TRIGGER: é a mesma regra de negócio ("a data mudou, então
-- o que foi dito sobre a data velha virou mentira"). Separar em dois triggers
-- na mesma coluna só criaria ordem de execução para pensar depois.
--
-- POR QUE GUARDS SEPARADOS: confirmação, lembrete manual e push são marcados
-- por caminhos diferentes (nutri no modal, nutri no painel, função agendada).
-- Cada um guarda contra o seu próprio campo, para que "reagendar e já marcar
-- na mesma tacada" continue funcionando em qualquer um dos três.
--
-- MUDANÇA DE MINUTOS CONTA: mover 14:00 -> 14:15 zera o lembrete. Decidido
-- assim porque o lembrete enviado dizia "14h" — já está errado.
--
-- RENAME: a função passa a limpar mais que confirmação, então o nome antigo
-- (consultas_limpa_confirmacao) mentiria sobre o escopo.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled
-- e uma transação explícita pode terminar em rollback SILENCIOSO — o editor
-- reporta sucesso e nada é aplicado. Foi o que aconteceu na primeira tentativa
-- desta migration. Sem transação explícita, cada statement se resolve sozinho e
-- um erro aparece como erro. Rode tudo de uma vez (Ctrl+A antes do Run): o
-- editor executa só o texto selecionado quando há seleção.
-- =============================================================

-- ── Colunas que nunca foram versionadas ─────────────────────────────────
-- lembrete_enviado_em e push_lembrete_enviado_em existem no banco e são
-- usadas por Agenda.jsx e lembretes-consulta.js, mas nunca entraram no repo:
-- o setup.sql só registrou lembrete_ativo e lembrete_enviado. Os ALTERs
-- abaixo são no-op no banco atual e existem para que um setup do zero
-- reproduza o estado real. NÃO confundir com checkin_envios.lembrete_enviado_em
-- (setup.sql:320), que é de outra tabela.
alter table public.consultas add column if not exists lembrete_enviado_em      timestamptz;
alter table public.consultas add column if not exists push_lembrete_enviado_em timestamptz;

comment on column public.consultas.lembrete_enviado_em is
  'Quando a nutri marcou o lembrete manual como enviado no painel da Agenda. Zerado ao reagendar.';
comment on column public.consultas.push_lembrete_enviado_em is
  'Quando o push automático da véspera saiu (lembretes-consulta.js). Zerado ao reagendar, senão a consulta é pulada no lote da data nova.';

-- ── Função nova ─────────────────────────────────────────────────────────
create or replace function public.consultas_limpa_ao_reagendar()
returns trigger
language plpgsql
as $$
begin
  -- Guard comum aos três blocos: `update of data_hora` dispara sempre que a
  -- coluna aparece no SET (o payload do modal manda data_hora toda vez, mesmo
  -- salvando só a obs), então o `is distinct from` é quem separa "reagendou"
  -- de "salvou sem mexer na data".

  -- Confirmação: a paciente confirmou OUTRO horário.
  if new.data_hora is distinct from old.data_hora
     and new.confirmada_em is not distinct from old.confirmada_em then
    new.confirmada_em  := null;
    new.confirmada_por := null;
  end if;

  -- Lembrete manual: é o mesmo que desfazerEnvio() faz à mão em Agenda.jsx,
  -- só que sem depender de a nutri lembrar de clicar.
  if new.data_hora is distinct from old.data_hora
     and new.lembrete_enviado is not distinct from old.lembrete_enviado then
    new.lembrete_enviado    := false;
    new.lembrete_enviado_em := null;
  end if;

  -- Push automático: guard próprio porque é outro mecanismo, marcado pela
  -- função agendada e não pela nutri.
  if new.data_hora is distinct from old.data_hora
     and new.push_lembrete_enviado_em is not distinct from old.push_lembrete_enviado_em then
    new.push_lembrete_enviado_em := null;
  end if;

  return new;
end;
$$;

-- ── Troca do trigger ────────────────────────────────────────────────────
-- O drop do trigger vem antes do drop da função porque a função só pode sair
-- depois que nada mais a referencia. Sem transação envolvendo, existe uma
-- janela de milissegundos entre o drop e o create em que nenhum trigger cobre
-- a tabela — aceitável aqui: é uma app de uma nutri só, rodando uma migration
-- manual, sem escrita concorrente em consultas nesse instante.
drop trigger if exists consultas_limpa_confirmacao_tg on public.consultas;

create trigger consultas_limpa_ao_reagendar_tg
  before update of data_hora on public.consultas
  for each row
  execute function public.consultas_limpa_ao_reagendar();

drop function if exists public.consultas_limpa_confirmacao();

-- =============================================================
-- Conferência
--   -- deve listar só consultas_limpa_ao_reagendar_tg
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid='public.consultas'::regclass and not tgisinternal;
--
--   -- deve devolver só a nova, nenhuma linha da antiga
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public'
--      and proname in ('consultas_limpa_ao_reagendar','consultas_limpa_confirmacao');
--
--   -- as quatro colunas de lembrete
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='consultas'
--      and column_name like '%lembrete%' order by column_name;
--
-- Backfill: as linhas já erradas não são tocadas por esta migration. Em
-- 2026-08-19 havia uma só (consulta 841b6030-5946-4032-a630-7f578cdeaeb5,
-- com lembrete manual e push velhos), corrigida à mão por UPDATE isolado nas
-- três colunas de lembrete. confirmada_em foi preservada de propósito: a
-- confirmação era posterior ao reagendamento, logo referente à data nova.
--
-- Aplicada no Supabase em 2026-08-19. Conferência devolveu exatamente 2 linhas:
-- a função consultas_limpa_ao_reagendar e o trigger consultas_limpa_ao_reagendar_tg;
-- nenhum vestígio dos nomes antigos.
-- =============================================================
