-- =============================================================
-- Migration 2026-09-02
-- locais_atendimento.dias_semana — a regra de dia sai do codigo
-- =============================================================
-- POR QUE: ate aqui "segunda e sexta no CTO, terca a quinta no Ed Village
-- Millenium" morava num mapa hardcoded no Agenda.jsx, casado com o banco POR
-- NOME. Nome e texto digitado no cadastro: renomear o local fazia a regra
-- parar de casar e nao pre-selecionar nada, em silencio. Ja aconteceu uma vez
-- ('Wanderloock', nome do seed de 2026-08-08 que nao correspondia ao banco).
-- Com a regra na propria linha do local o vinculo passa a ser o id, e
-- renomear nao quebra mais nada.
--
-- POR QUE ARRAY E NAO TABELA FILHA: sao no maximo 5 valores por local, lidos
-- sempre juntos e sempre inteiros. Uma tabela filha so para isso pagaria join
-- em toda carga da agenda sem responder nada a mais.
--
-- POR QUE NULAVEL: null = "sem regra", e e o default de todo local novo. Nesse
-- caso vale o comportamento antigo — um unico local ativo e escolhido, com
-- dois ou mais nenhum. Distinguir null de '{}' nao interessa aqui: os dois
-- caem no mesmo fallback.
--
-- POR QUE 1..5: e o mesmo codigo de Date.getDay() do JS nesse intervalo
-- (1 = segunda ... 5 = sexta), de proposito, para o codigo comparar sem
-- conversao. Sabado (6) e domingo (0) ficam fora pelo check — agendar em fim
-- de semana ja e barrado antes de chegar na regra, e um dia que nao esta em
-- array nenhum cai no fallback em vez de escolher errado.
--
-- NAO E DESTRUTIVA: adiciona coluna e preenche duas linhas. Nenhum dado sai.
--
-- Idempotente: add column if not exists, drop+add constraint, update por nome.
-- SEM begin/commit DE PROPOSITO: no SQL Editor do Supabase a conexao e pooled
-- e uma transacao explicita pode terminar em rollback SILENCIOSO. Rode tudo de
-- uma vez (Ctrl+A antes do Run).
-- =============================================================


-- 1. COLUNA ------------------------------------------------------------
alter table public.locais_atendimento
  add column if not exists dias_semana smallint[];

comment on column public.locais_atendimento.dias_semana is
  'Dias em que este local atende: 1=segunda ... 5=sexta (mesmo codigo de Date.getDay()). Null = sem regra, cai no comportamento de local unico.';

-- Sem o check, um 0 ou um 7 entram e a regra nunca casa com dia nenhum,
-- calada. O operador <@ exige que TODO elemento esteja em 1..5; array vazio
-- passa e equivale a null (nenhum dia).
alter table public.locais_atendimento
  drop constraint if exists locais_atendimento_dias_semana_check;

alter table public.locais_atendimento
  add constraint locais_atendimento_dias_semana_check
  check (dias_semana is null or dias_semana <@ array[1,2,3,4,5]::smallint[]);


-- 2. POPULAR OS DOIS LOCAIS DA KELLY -----------------------------------
-- Nomes confirmados no banco em 2026-09-02 antes de escrever este arquivo
-- (select id, nome, ativo from locais_atendimento). Um update cujo where nao
-- casa nao da erro, so nao faz nada — por isso o passo 3 e obrigatorio.
update public.locais_atendimento
   set dias_semana = array[1,5]::smallint[]
 where nome = 'CTO';

update public.locais_atendimento
   set dias_semana = array[2,3,4]::smallint[]
 where nome = 'Ed Village Millenium';


-- 3. CONFERENCIA — OBRIGATORIA, leia a saida ---------------------------
-- 3a. A lista, para bater com o olho:
select nome, ativo, dias_semana
  from public.locais_atendimento
 order by nome;
-- Esperado: CTO {1,5} · Ed Village Millenium {2,3,4}

-- 3b. O fato derivado, que nao depende de ler linha por linha.
--     ativos_sem_regra > 0 significa que algum update nao casou pelo nome.
select count(*) filter (where dias_semana is not null)        as com_regra,
       count(*) filter (where ativo and dias_semana is null)  as ativos_sem_regra,
       bool_and(dias_semana is null
                or dias_semana <@ array[1,2,3,4,5]::smallint[]) as dentro_do_check
  from public.locais_atendimento;
-- Esperado: 2 | 0 | t


-- =============================================================
-- DEPOIS DESTA MIGRATION, NO CODIGO (Agenda.jsx):
--   · o select de locais precisa incluir dias_semana, senao a coluna chega
--     undefined e a regra cai no fallback em toda data, em silencio;
--   · localPadrao() passa a filtrar por l.dias_semana;
--   · LOCAL_POR_DIA e nomeIgual saem (nomeIgual nao tem outro chamador).
--
-- Local novo nasce com dias_semana null e cai no comportamento antigo ate
-- alguem preencher — nao ha tela de cadastro de locais, entra por SQL, mesmo
-- padrao de lojas_parceiras.
-- =============================================================
