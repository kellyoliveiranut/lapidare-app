-- =============================================================
-- Migration 2026-09-01
-- nutris.maquininha_antecipa — a maquininha paga na hora, não no vencimento
-- =============================================================
-- O QUE ESTÁ ERRADO HOJE: numa venda no cartão, a maquininha da Kelly ANTECIPA
-- e deposita o valor total logo depois da venda — mesmo quando a paciente
-- parcelou em N vezes para o cartão dela. O sistema não sabe disso e cria as
-- parcelas com status 'pendente' e vencimento escalonado, como se o dinheiro
-- fosse pingar mês a mês.
--
-- A consequência não é só sub-reportar "Recebido" em Financeiro,
-- Previsibilidade, Cérebro e Visão. É pior: statusParcela() (lib/utils.js)
-- deriva atraso comparando vencimento com hoje, então conforme os meses passam
-- essas parcelas viram 'atrasado' — dinheiro que já está na conta aparece
-- como calote no bloco vermelho da tela.
--
-- VALE PARA OS DOIS RAMOS DE MAQUININHA, não só o parcelado. `credito1x`
-- também nasce 'pendente' hoje, e como o vencimento é a própria data da venda,
-- vira 'atrasado' no dia seguinte. É inclusive o caso mais frequente no banco
-- (8 vendas credito1x contra 2 parcelado, conferido em 2026-09-01). Pix e
-- dinheiro NÃO entram: já nascem com a primeira parcela paga e não passam por
-- maquininha nenhuma.
--
-- POR QUE UMA COLUNA, E NÃO UM DEFAULT CHUMBADO NO CÓDIGO: "a minha maquininha
-- antecipa" é um fato do negócio da Kelly, não de cada venda. Chumbar `true` no
-- JS esconderia a premissa em dois arquivos (VendaModais e Cadastrar) e o dia
-- de trocar de maquininha viraria caça ao literal. Aqui é um lugar só, editável
-- pela tela, e o checkbox de cada venda continua podendo discordar no caso raro
-- — uma venda numa máquina emprestada, por exemplo.
--
-- POR QUE EM `nutris`: mesma granularidade e mesmo precedente das colunas
-- taxa_pct_* (2026-08-31c). E, sobretudo, `src/lib/session.jsx` faz select('*')
-- em nutris, então o valor já chega em useSession().profile nos DOIS caminhos
-- que criam venda, sem query nova.
--
-- DEFAULT TRUE, e isto NÃO é retrocompatível — é deliberado. As outras colunas
-- de configuração deste projeto usam default neutro (0) justamente para não
-- mudar comportamento ao rodar. Aqui o comportamento atual é o defeito: nascer
-- `false` obrigaria a Kelly a ir configurar antes de a correção valer, e até
-- lá as vendas novas continuariam entrando como falso atraso. `true` descreve
-- 100% dos casos dela hoje.
--
-- NÃO TOCA EM NENHUMA VENDA EXISTENTE. A coluna só muda como PRÓXIMAS parcelas
-- nascem. As 2 parcelado e as 8 credito1x já gravadas seguem pendentes até uma
-- decisão separada — algumas podem ter sido marcadas na mão, com data_pgto
-- real, e um update cego apagaria esse registro.
--
-- ORDEM: pode rodar antes ou depois do código. Coluna ausente com código novo
-- deixaria `profile.maquininha_antecipa` undefined, e o `?? true` do JS cai no
-- mesmo valor do default — então a janela entre as duas coisas é inofensiva
-- nos dois sentidos. Mesmo assim, rodar primeiro é o hábito da casa.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled e
-- uma transação explícita pode terminar em rollback SILENCIOSO. Ctrl+A antes do
-- Run.
--
-- Idempotente: add column if not exists, drop+create do check.
-- =============================================================


-- 1. COLUNA ------------------------------------------------------------

alter table public.nutris
  add column if not exists maquininha_antecipa boolean not null default true;


-- 2. DOCUMENTAÇÃO ------------------------------------------------------

comment on column public.nutris.maquininha_antecipa is
  'true = a maquininha deposita o valor total logo apos a venda, mesmo quando a
   paciente parcelou. Vale para as formas credito1x e parcelado (as mesmas de
   FORMAS_COM_TAXA em lib/utils.js). Alimenta o valor INICIAL do checkbox
   "Recebimento antecipado pela maquininha" nos dois formularios de venda; a
   nutri ainda pode discordar numa venda especifica. Quando o checkbox esta
   marcado, gerarParcelas() cria as parcelas com status pago e data_pgto = data
   da venda, mantendo o vencimento escalonado (que descreve o que a PACIENTE
   paga ao cartao, nao quando a nutri recebe).';


-- =============================================================
-- Conferência (rode DEPOIS do Run, em Run separado)
--
--   -- a coluna existe, é boolean, not null e default true?
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'nutris'
--      and column_name = 'maquininha_antecipa';
--   -- esperado: maquininha_antecipa | boolean | NO | true
--
--   -- a linha da Kelly ficou com true? (nenhuma nula)
--   select nome, maquininha_antecipa from public.nutris;
--   -- esperado: t
--
--   -- nenhuma parcela existente foi tocada — as contagens abaixo têm que ser
--   -- IDÊNTICAS às da query de diagnóstico rodada antes desta migration:
--   select v.forma_pgto, p.status, count(*)
--     from public.parcelas p join public.vendas v on v.id = p.venda_id
--    where v.forma_pgto in ('credito1x', 'parcelado')
--    group by 1, 2 order by 1, 2;
-- =============================================================
