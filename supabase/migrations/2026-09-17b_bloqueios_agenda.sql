-- =============================================================
-- Migration 2026-09-17b
-- bloqueios_agenda — dia ou horario em que nao se agenda consulta
-- =============================================================
-- POR QUE UMA TABELA NOVA, E NAO UMA LINHA EM consultas: consultas.paciente_id
-- e NOT NULL e continua sendo (ver migration 2026-09-17). Um bloqueio nao tem
-- paciente. Representa-lo como consulta exigiria uma paciente-fantasma, que
-- apareceria em lista, em contagem, em relatorio e no lembrete — cada um deles
-- precisando lembrar de filtra-la. Tabela propria custa um join e nao mente.
--
-- POR QUE UMA TABELA SO PARA OS DOIS CASOS: bloquear o dia inteiro e bloquear
-- um horario sao a mesma coisa com e sem limites.
--   hora_inicio IS NULL e hora_fim IS NULL  -> dia inteiro (feriado, folga)
--   hora_inicio e hora_fim preenchidos      -> so aquela faixa
-- Duas tabelas, ou uma coluna `tipo`, exigiriam que toda leitura lembrasse de
-- olhar as duas formas. Assim a regra de conflito e uma so: se a faixa e NULL,
-- cobre o dia; senao, cobre o intervalo.
--
-- POR QUE `date` + `time`, E NAO `timestamptz`: folga e dia de CALENDARIO, e
-- hora de bloqueio e hora de RELOGIO DE PAREDE — nao instantes. "Sexta eu nao
-- atendo" e "das 14:00 as 15:00 estou fora" valem no relogio da nutri, hoje e
-- depois de qualquer mudanca de fuso. Guardado com fuso, o bloqueio precisaria
-- ser convertido em toda leitura. Mesmo precedente de lembretes_nutri.hora
-- (migration 2026-09-07), pela mesma razao.
--
-- Nota: a Agenda JA grava e le certo — Agenda.jsx:2417 usa montarDataHoraISO
-- e Agenda.jsx:662 le com partesLocaisISO. Nao ha divida de fuso aqui.
--
-- ATENCAO NO FRONT: o PostgREST devolve `time` como 'HH:MM:SS', nao 'HH:MM'.
-- Quem le corta com .slice(0, 5). Mesmo custo que lembretes_nutri.hora.
--
-- hora_fim E EXCLUSIVO: bloquear 14:00-15:00 deixa as 15:00 livres. E a mesma
-- convencao do fim de consulta (data_hora + duracao_min), e sem ela duas
-- regras vizinhas se sobreporiam por um minuto em todo encaixe.
--
-- OS FERIADOS NAO VEM PARA CA. Continuam em src/lib/feriados.js, porque
-- Pascoa e Cirio sao CALCULADOS por ano — joga-los na tabela viraria backfill
-- anual e um dia alguem esqueceria. A validacao pergunta as duas fontes: a
-- lista computada e esta tabela.
--
-- RLS — UMA POLICY SO, DE PROPOSITO. Bloqueio e conceito exclusivo da nutri.
-- Conferido no codigo: a paciente NUNCA escreve em consultas (os tres acessos
-- dela sao select — Inicio.jsx:134, Inicio.jsx:198, PacienteLayout.jsx:252) e
-- nao existe auto-agendamento, entao ela nao precisa saber de horario
-- bloqueado. Em consultas sao duas policies porque a consultas_select existe
-- para a PACIENTE ler; a consultas_write_nutri e `for all` e ja cobre o select
-- da nutri. Aqui, sem leitor-paciente, `for all` com nutri_id = auth.uid()
-- e a policy inteira, nao uma versao reduzida.
-- Nao use minha_paciente_id() aqui: a ausencia dela e deliberada.
--
-- SE UM DIA a paciente puder escolher horario sozinha, ai sim entra uma policy
-- de select para ela. Acrescentar depois e uma linha; adivinhar agora seria
-- abrir leitura que ninguem pediu.
--
-- INDICE PARCIAL UNICO: impede dois bloqueios de DIA INTEIRO no mesmo dia, que
-- seriam duplicata visivel na tela sem efeito nenhum. Faixas de horario
-- sobrepostas continuam permitidas — 10:00-11:00 e 10:30-12:00 juntos sao
-- legitimos e o efeito e a uniao das duas.
--
-- IDEMPOTENTE: create if not exists, drop/create do check e da policy.
-- NAO E DESTRUTIVA: so cria. Nenhuma tabela existente e tocada.
-- SEM begin/commit DE PROPOSITO: no SQL Editor do Supabase a conexao e pooled
-- e uma transacao explicita pode terminar em rollback SILENCIOSO.
-- Rode tudo de uma vez (Ctrl+A antes do Run).
-- =============================================================


-- 1. TABELA -----------------------------------------------------------

create table if not exists public.bloqueios_agenda (
  id           uuid primary key default gen_random_uuid(),
  nutri_id     uuid not null references public.nutris(id) on delete cascade,
  data         date not null,
  hora_inicio  time,
  hora_fim     time,
  motivo       text,
  created_at   timestamptz not null default now()
);


-- 2. DOCUMENTACAO -----------------------------------------------------

comment on table public.bloqueios_agenda is
  'Dias e horarios em que a nutri nao aceita agendamento (folga, compromisso,
   feriado nao previsto na lista de src/lib/feriados.js). Bloqueio trava o
   salvamento de consulta, sem escape — para agendar assim, apague o bloqueio.';

comment on column public.bloqueios_agenda.hora_inicio is
  'Inicio da faixa bloqueada, no relogio da nutri (sem fuso). NULL, junto com
   hora_fim, significa DIA INTEIRO. O PostgREST devolve como HH:MM:SS.';

comment on column public.bloqueios_agenda.hora_fim is
  'Fim EXCLUSIVO da faixa: 14:00-15:00 deixa as 15:00 livres. NULL, junto com
   hora_inicio, significa DIA INTEIRO.';


-- 3. CHECK ------------------------------------------------------------
-- drop antes do add: `create table if not exists` nao recria a constraint
-- se a tabela ja existir de um Run anterior.

alter table public.bloqueios_agenda
  drop constraint if exists bloqueios_agenda_faixa_coerente;

alter table public.bloqueios_agenda
  add constraint bloqueios_agenda_faixa_coerente
  check (
    (hora_inicio is null and hora_fim is null)
    or (hora_inicio is not null and hora_fim is not null and hora_fim > hora_inicio)
  );


-- 4. INDICES ----------------------------------------------------------

create index if not exists bloqueios_agenda_nutri_data_idx
  on public.bloqueios_agenda(nutri_id, data);

create unique index if not exists bloqueios_agenda_dia_inteiro_unico
  on public.bloqueios_agenda(nutri_id, data)
  where hora_inicio is null;


-- 5. RLS --------------------------------------------------------------

alter table public.bloqueios_agenda enable row level security;

drop policy if exists bloqueios_agenda_nutri on public.bloqueios_agenda;

create policy bloqueios_agenda_nutri on public.bloqueios_agenda
  for all
  using      (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());


-- =============================================================
-- 6. CONFERENCIA — OBRIGATORIA, leia a saida
--
-- Fatos derivados, nao lista de linhas: responde mesmo que o Run tenha
-- sido parcial, e cabe numa olhada.
-- =============================================================

select (to_regclass('public.bloqueios_agenda') is not null)          as tabela_existe,
       (select relrowsecurity from pg_class
         where oid = to_regclass('public.bloqueios_agenda'))         as rls_ligada,
       (select count(*) from pg_policies
         where schemaname = 'public'
           and tablename  = 'bloqueios_agenda')                      as n_policies,
       (select count(*) from pg_constraint
         where conrelid = to_regclass('public.bloqueios_agenda')
           and conname  = 'bloqueios_agenda_faixa_coerente')         as n_check,
       (select count(*) from pg_indexes
         where schemaname = 'public'
           and tablename  = 'bloqueios_agenda')                      as n_indices;

-- Esperado: true | true | 1 | 1 | 3
--   n_indices = 3: chave primaria + bloqueios_agenda_nutri_data_idx
--                  + bloqueios_agenda_dia_inteiro_unico
