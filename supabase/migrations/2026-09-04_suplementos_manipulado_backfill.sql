-- =============================================================
-- Migration 2026-09-04
-- suplementos.manipulado — corrige as linhas que o backfill de julho nao pegou
-- =============================================================
-- POR QUE: o app tem hoje DUAS codificacoes do mesmo conceito, e elas
-- concordam por coincidencia. O envio a farmacia filtra pelo CAMPO
-- (ativos.filter(s => s.manipulado), _Suplementacao.jsx:224); o PDF de
-- prescricao filtra pelo NOME (FORA_DA_PRESCRICAO_LOJA = ['lipeshot',
-- 'moroshot'], :1227). Elas so batem porque o backfill de
-- 2026-07-23_suplementos_manipulado.sql marcou true exatamente para esses dois
-- nomes.
--
-- Medido no banco em 2026-09-04: 2 linhas ATIVAS de uma paciente tem nome
-- Lipeshot/Moroshot e manipulado = false — cadastradas depois de julho, sem a
-- caixinha marcada. Nelas as duas regras ja divergem: vao para a farmacia? Nao.
-- Aparecem no PDF? Sim. Nenhuma das duas respostas e a desejada.
--
-- Esta migration existe para permitir aposentar a regra por NOME e deixar
-- `manipulado` como fonte unica de verdade — o campo que a nutri controla pela
-- caixinha "E formula manipulada (vai pra farmacia)". Sem ela, ao trocar o
-- filtro do PDF essas 2 linhas mudariam de lado sem ninguem ter decidido isso.
--
-- ORDEM OBRIGATORIA: esta migration roda ANTES do deploy do codigo novo. Na
-- ordem inversa, as 2 linhas entrariam na prescricao de loja durante a janela
-- entre o deploy e o Run.
--
-- SO LINHAS ATIVAS, de proposito: um suplemento pausado nao entra em saida
-- nenhuma, entao nao ha divergencia a corrigir hoje. O passo 2b conta as
-- inativas que casariam, para a decisao ficar visivel em vez de implicita.
--
-- NAO E DESTRUTIVA: um update de boolean em 2 linhas. Nenhum dado sai, nenhuma
-- coluna muda de tipo.
--
-- Idempotente: o `and not manipulado` faz a segunda execucao nao casar nada.
-- SEM begin/commit DE PROPOSITO: no SQL Editor do Supabase a conexao e pooled
-- e uma transacao explicita pode terminar em rollback SILENCIOSO. Rode tudo de
-- uma vez (Ctrl+A antes do Run).
-- =============================================================


-- 1. CORRECAO ----------------------------------------------------------
update public.suplementos
   set manipulado = true,
       updated_at = now()
 where ativo
   and not manipulado
   and (nome ilike '%lipeshot%' or nome ilike '%moroshot%');
-- Esperado: UPDATE 2


-- 2. CONFERENCIA — OBRIGATORIA, leia a saida ----------------------------
-- 2a. O fato derivado. As duas regras passam a concordar quando
--     divergentes_ativos = 0. E o unico numero que autoriza o deploy.
select count(*) filter (
         where ativo
           and manipulado <> (nome ilike '%lipeshot%' or nome ilike '%moroshot%')
       ) as divergentes_ativos,
       count(*) filter (where ativo and manipulado)     as manipulados_ativos,
       count(*) filter (where ativo and not manipulado) as suplementacao_ativos,
       count(*) filter (where ativo)                    as total_ativos
  from public.suplementos;
-- Esperado: divergentes_ativos = 0 · manipulados_ativos = 22 · total_ativos = 306

-- 2b. As inativas que casariam pelo nome e seguem com manipulado = false.
--     NAO sao tocadas por esta migration. Se alguma for reativada depois, a
--     divergencia volta — este numero e o tamanho desse risco.
select count(*) as inativas_que_casariam
  from public.suplementos
 where not ativo
   and not manipulado
   and (nome ilike '%lipeshot%' or nome ilike '%moroshot%');
