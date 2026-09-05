-- =============================================================
-- Migration 2026-09-04b
-- lembretes_nutri — a primeira tabela que pertence a NUTRI, nao a uma paciente
-- =============================================================
-- POR QUE: tudo que a Kelly escreve hoje esta ancorado numa paciente — obs de
-- consulta, followups, anamnese, prescricoes. Nao existe lugar para "ligar pro
-- contador" ou "comprar tinta de impressora". O resumo do dia na Visao precisa
-- desse lugar, e nenhuma das 40+ tabelas do schema serve: todas tem
-- paciente_id ou sao catalogo.
--
-- LEIA O CONTRASTE DE RLS ANTES DE ESTRANHAR: todas as outras policies do app
-- passam por public.minha_paciente_id(), porque a linha pertence a uma paciente
-- e precisa ser visivel para ela E para a nutri. Aqui NAO. Esta linha e privada
-- da nutri: a paciente nunca ve, nunca escreve, e nao existe caminho de leitura
-- para ela em lugar nenhum do app. Por isso a policy e `nutri_id = auth.uid()`
-- e mais nada. A AUSENCIA DO PADRAO E DELIBERADA, nao esquecimento — se alguem
-- "consertar" isto acrescentando minha_paciente_id(), estara abrindo os
-- lembretes pessoais da nutri para as pacientes.
--
-- POR QUE `data` E NULAVEL: sao dois usos no mesmo lugar. Com data, o lembrete
-- aparece no dia certo. Sem data, fica sempre a vista ate ser marcado — e a
-- lista de recados que nao tem prazo. Distinguir os dois por uma coluna `tipo`
-- seria inventar categoria para o que a ausencia de data ja diz.
--
-- POR QUE `date` E NAO `timestamptz`: lembrete e do DIA, nao da hora. Guardar
-- hora obrigaria a escolher uma (meia-noite? agora?) e a converter fuso na
-- leitura — o app ja tropecou nisso antes. Com `date`, o front compara com
-- dataLocalISO() e pronto.
--
-- POR QUE `concluido_em` E NAO UM BOOLEAN `feito`: um timestamp responde as
-- duas perguntas (esta feito? quando?) pelo preco de uma coluna, e permite
-- listar "concluidos de hoje" sem coluna extra. Null = pendente.
--
-- O FRONT LE COM `data <= hoje`, NAO `data = hoje`: um lembrete de ontem que
-- ela nao marcou continua aparecendo, com marca de atrasado. Some so quando
-- concluido. Sumir na virada do dia perderia tarefa em silencio.
--
-- NAO E DESTRUTIVA: cria tabela nova. Nenhuma tabela existente e tocada.
-- Idempotente: create if not exists + drop/create da policy e do indice.
-- SEM begin/commit DE PROPOSITO: no SQL Editor do Supabase a conexao e pooled
-- e uma transacao explicita pode terminar em rollback SILENCIOSO. Rode tudo de
-- uma vez (Ctrl+A antes do Run).
-- =============================================================


-- 1. TABELA -----------------------------------------------------------
create table if not exists public.lembretes_nutri (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  texto         text not null,
  data          date,                    -- null = sem prazo, fica sempre a vista
  concluido_em  timestamptz,             -- null = pendente
  created_at    timestamptz not null default now()
);

comment on table public.lembretes_nutri is
  'Lembretes pessoais da nutricionista. Nao tem paciente_id de proposito: e a unica tabela do app cujo dono e a nutri, e a paciente nunca le estas linhas.';
comment on column public.lembretes_nutri.data is
  'Dia em que o lembrete deve aparecer. Null = sem prazo, aparece sempre ate ser concluido. O front usa data <= hoje, entao atrasado nao some.';
comment on column public.lembretes_nutri.concluido_em is
  'Quando foi marcado como feito. Null = pendente.';


-- 2. INDICE ------------------------------------------------------------
-- O card da Visao pede sempre a mesma coisa: os pendentes desta nutri,
-- ordenados por data. O indice parcial cobre exatamente isso e nao paga por
-- linha concluida, que so e lida quando ela desmarca.
create index if not exists lembretes_nutri_pendentes_idx
  on public.lembretes_nutri (nutri_id, data)
  where concluido_em is null;


-- 3. RLS ---------------------------------------------------------------
alter table public.lembretes_nutri enable row level security;

-- UMA policy para tudo. Sem minha_paciente_id(), sem ramo de leitura para a
-- paciente: a linha e da nutri e ponto. O `with check` repete a condicao para
-- que ela nao consiga inserir linha em nome de outra nutri.
drop policy if exists lembretes_nutri_all on public.lembretes_nutri;
create policy lembretes_nutri_all on public.lembretes_nutri
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());


-- 4. CONFERENCIA — OBRIGATORIA, leia a saida ---------------------------
-- Fatos derivados, nao lista de linhas: to_regclass devolve null em vez de dar
-- erro se a tabela nao existir, entao esta query responde mesmo num Run parcial.
select (to_regclass('public.lembretes_nutri') is not null)                as tabela_criada,
       coalesce((select relrowsecurity from pg_class
                  where oid = to_regclass('public.lembretes_nutri')),
                false)                                                    as rls_ligada,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'lembretes_nutri')   as n_policies,
       (select count(*) from pg_indexes
         where schemaname = 'public'
           and tablename = 'lembretes_nutri'
           and indexname = 'lembretes_nutri_pendentes_idx')               as n_indice;
-- Esperado: true · true · 1 · 1
