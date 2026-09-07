-- =============================================================
-- Migration 2026-09-07
-- lembretes_nutri.hora — a tarefa passa a poder ter horario
-- =============================================================
-- POR QUE: a Agenda vai ganhar uma segunda visao do dia, em regua de
-- horarios (08:00 as 19:30), ao lado da lista que ja existe. As consultas
-- se posicionam nela sozinhas, porque consultas.data_hora ja tem hora. As
-- tarefas da nutri nao tinham onde guardar isso.
--
-- NULAVEL, E ISSO E O PONTO. Nem toda tarefa quer horario. Continuam
-- existindo tres formas, e as tres sao legitimas:
--   data + hora   -> bloco na regua, na altura da hora
--   data, sem hora-> faixa "dia inteiro" no topo da regua
--   sem data      -> fora da regua, no bloco fixo "Tarefas sem prazo"
-- Um default aqui obrigaria toda tarefa a escolher uma hora que ninguem
-- pediu, e encheria a regua de blocos falsos.
--
-- POR QUE `time` E NAO `text`: `time` recusa '25:00' e 'abc' na porta do
-- banco e ordena por valor. `text` so ordenaria certo se todo mundo
-- lembrasse do zero a esquerda, e nada obrigaria isso. E a primeira coluna
-- `time` do schema, mas o precedente analogo ja esta nesta mesma tabela:
-- `data` e `date`, e e por ser `date` que ela nunca deu problema de fuso.
--
-- ATENCAO NO FRONT: o PostgREST devolve `time` como 'HH:MM:SS', e nao
-- 'HH:MM'. Quem le corta com .slice(0, 5). E o unico custo desta escolha.
--
-- POR QUE `time` E NAO `timestamptz`: hora de tarefa e hora de RELOGIO DE
-- PAREDE, nao um instante. "Ligar pro contador as 15:00" quer dizer 15:00
-- no relogio dela, sempre. Guardar com fuso obrigaria a converter na
-- leitura, e o app ja tropecou nisso antes. Efeito colateral bem-vindo: na
-- regua, as tarefas ficam imunes a qualquer divergencia de fuso.
--
-- POR QUE O CHECK: tarefa com hora e sem data seria "as 15:00 de nenhum
-- dia" — nao existe lugar na tela para desenha-la. O formulario ja vai
-- impedir, mas a regra pertence ao banco, nao so a tela.
--
-- INDICE: nenhum novo. lembretes_nutri_pendentes_idx (nutri_id, data)
-- where concluido_em is null continua servindo; a ordenacao secundaria por
-- hora acontece depois, sobre dezenas de linhas.
--
-- RLS: intocada. A policy lembretes_nutri_all e `for all` sobre a LINHA
-- (nutri_id = auth.uid()), nao sobre colunas — coluna nova ja nasce
-- coberta. Nao acrescente minha_paciente_id() aqui: a ausencia dela nesta
-- tabela e deliberada, a paciente nunca le estas linhas.
--
-- NAO E DESTRUTIVA: adiciona coluna nulavel. Nenhuma linha existente muda
-- de valor — as que ja existem ficam com hora NULL, que e exatamente o que
-- elas sempre foram: tarefas do dia inteiro.
-- Idempotente: add column if not exists + drop/create do check.
-- SEM begin/commit DE PROPOSITO: no SQL Editor do Supabase a conexao e
-- pooled e uma transacao explicita pode terminar em rollback SILENCIOSO.
-- Rode tudo de uma vez (Ctrl+A antes do Run).
-- =============================================================


-- 1. COLUNA -----------------------------------------------------------

alter table public.lembretes_nutri
  add column if not exists hora time;


-- 2. DOCUMENTACAO -----------------------------------------------------

comment on column public.lembretes_nutri.hora is
  'Hora do dia em que a tarefa aparece na regua da Agenda, no relogio da
   nutri (sem fuso, de proposito). NULL = tarefa do dia inteiro, mostrada
   na faixa do topo da regua. So faz sentido com `data` preenchida, e o
   check lembretes_nutri_hora_exige_data garante isso. O PostgREST devolve
   este valor como HH:MM:SS.';


-- 3. CHECK ------------------------------------------------------------
-- Em passo separado, e com drop antes: `add column if not exists` nao
-- recria a constraint se a coluna ja existir, entao o drop+add garante que
-- ela esteja no lugar mesmo num Run repetido.

alter table public.lembretes_nutri
  drop constraint if exists lembretes_nutri_hora_exige_data;

alter table public.lembretes_nutri
  add constraint lembretes_nutri_hora_exige_data
  check (hora is null or data is not null);


-- =============================================================
-- 4. CONFERENCIA — OBRIGATORIA, leia a saida
--
-- Fatos derivados, nao lista de linhas: assim a query responde mesmo que o
-- Run tenha sido parcial, e cabe numa olhada.
-- =============================================================

select (to_regclass('public.lembretes_nutri') is not null)                as tabela_existe,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'lembretes_nutri'
           and column_name = 'hora')                                      as col_hora,
       (select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'lembretes_nutri'
           and column_name = 'hora')                                      as tipo_hora,
       (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'lembretes_nutri'
           and column_name = 'hora')                                      as hora_nulavel,
       (select count(*) from pg_constraint
         where conrelid = to_regclass('public.lembretes_nutri')
           and conname = 'lembretes_nutri_hora_exige_data')               as n_check;

-- Esperado: true | 1 | time without time zone | YES | 1
