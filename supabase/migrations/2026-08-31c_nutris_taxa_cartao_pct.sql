-- =============================================================
-- Migration 2026-08-31c
-- nutris: percentuais da maquininha, para a taxa vir pré-calculada
-- =============================================================
-- MUDANÇA DE REQUISITO. A taxa da maquininha (parcelas.taxa_cartao, migration
-- 2026-08-31b) hoje é digitada à mão em toda venda. A Kelly quer que ela venha
-- CALCULADA a partir de um percentual configurado uma vez -- continuando
-- editável, porque o extrato real chega com centavos diferentes e é ele que
-- manda.
--
-- POR QUE EM `nutris`, E NÃO EM TABELA NOVA: é um parâmetro por nutri, e a
-- granularidade da linha de `nutris` é exatamente essa. Segue os dois
-- precedentes de configuração do projeto (2026-05-23_personalizacao e
-- 2026-07-28_envios_farmacia), que também são colunas soltas aqui.
--
-- Vantagem de tabela: `src/lib/session.jsx` faz `select('*')` em nutris, então
-- a linha inteira já está em useSession().profile em qualquer tela. Estas
-- colunas ficam disponíveis nos DOIS caminhos que criam venda sem consulta
-- nova.
--
-- POR QUE O PARCELADO TEM DOIS NÚMEROS: a taxa da maquininha cresce com o
-- número de parcelas. Um percentual único para "parcelado" erraria a faixa
-- inteira -- os 500 sobre 2.700 do caso real dão 18,5%, que é taxa de
-- parcelamento longo; a mesma venda em 3x custaria perto de 6%. O modelo
-- base + acréscimo por parcela adicional reproduz como a maquininha cobra:
--
--     pct(n) = taxa_pct_parcelado_base + taxa_pct_parcelado_por_parcela * (n - 1)
--
--     3,5 + 1,4 * 2  =  6,3%   em 3x
--     3,5 + 1,4 * 11 = 18,9%   em 12x
--
-- DEFAULT 0 É O QUE TORNA ISTO RETROCOMPATÍVEL: enquanto a Kelly não
-- configurar, a sugestão é zero e os dois modais se comportam exatamente como
-- hoje -- campo em branco, preenchido à mão. Nada muda entre rodar esta
-- migration e configurar os percentuais, e nenhuma venda existente é tocada.
--
-- NÃO EXISTE CHECK PARA A TAXA COMPOSTA: cada coluna é limitada a 0..100
-- isoladamente, mas base + por_parcela * 11 poderia passar de 100 com valores
-- absurdos. A rede para isso já existe em dois lugares mais baixos: o clamp de
-- distribuirTaxa e o check parcelas_taxa_menor_que_valor, do 2026-08-31b.
-- Duplicar a regra aqui daria três lugares para discordarem.
--
-- RLS: nada a fazer. A Personalização já faz update em `nutris` pela própria
-- nutri, então a policy da própria linha existe -- e RLS é por linha, não por
-- coluna, então as colunas novas já nascem cobertas.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled
-- e uma transação explícita pode terminar em rollback SILENCIOSO. Ctrl+A antes
-- do Run.
--
-- Idempotente: add column if not exists, e os checks por drop + add
-- (`add constraint if not exists` não existe em Postgres).
-- =============================================================


-- 1. COLUNAS -----------------------------------------------------------

-- numeric(5,2): até 999,99, duas casas. A escala fixa impede que um 3,456
-- digitado por engano vire arredondamento invisível no cálculo da sugestão.
alter table public.nutris
  add column if not exists taxa_pct_credito1x             numeric(5,2) not null default 0,
  add column if not exists taxa_pct_asaas                 numeric(5,2) not null default 0,
  add column if not exists taxa_pct_parcelado_base        numeric(5,2) not null default 0,
  add column if not exists taxa_pct_parcelado_por_parcela numeric(5,2) not null default 0;


-- 2. CHECKS ------------------------------------------------------------

alter table public.nutris drop constraint if exists nutris_taxa_pct_credito1x_check;
alter table public.nutris add  constraint nutris_taxa_pct_credito1x_check
  check (taxa_pct_credito1x >= 0 and taxa_pct_credito1x <= 100);

alter table public.nutris drop constraint if exists nutris_taxa_pct_asaas_check;
alter table public.nutris add  constraint nutris_taxa_pct_asaas_check
  check (taxa_pct_asaas >= 0 and taxa_pct_asaas <= 100);

alter table public.nutris drop constraint if exists nutris_taxa_pct_parcelado_base_check;
alter table public.nutris add  constraint nutris_taxa_pct_parcelado_base_check
  check (taxa_pct_parcelado_base >= 0 and taxa_pct_parcelado_base <= 100);

-- O acréscimo é POR PARCELA ADICIONAL, então um número pequeno (1 a 2) é o
-- normal. O teto de 100 aqui é só barreira contra digitação absurda.
alter table public.nutris drop constraint if exists nutris_taxa_pct_parcelado_por_parcela_check;
alter table public.nutris add  constraint nutris_taxa_pct_parcelado_por_parcela_check
  check (taxa_pct_parcelado_por_parcela >= 0 and taxa_pct_parcelado_por_parcela <= 100);


-- 3. DOCUMENTAÇÃO ------------------------------------------------------

comment on column public.nutris.taxa_pct_credito1x is
  'Percentual da maquininha no credito a vista. 0 = nao configurado, e a
   sugestao de taxa sai zerada (comportamento anterior, campo manual).';

comment on column public.nutris.taxa_pct_parcelado_base is
  'Percentual BASE do parcelado, valido para 1 parcela. O total de uma venda em
   N parcelas e base + por_parcela * (N - 1).';

comment on column public.nutris.taxa_pct_parcelado_por_parcela is
  'Acrescimo por parcela ADICIONAL alem da primeira. Ver
   taxa_pct_parcelado_base. Nao ha coluna para pix nem dinheiro: essas formas
   entram inteiras e nao aparecem em FORMAS_COM_TAXA (src/lib/utils.js).';


-- =============================================================
-- Conferência (rode DEPOIS do Run, em Run separado)
--
--   -- as quatro colunas, com tipo, escala e default certos?
--   select column_name, data_type, numeric_precision, numeric_scale,
--          is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'nutris'
--      and column_name like 'taxa_pct_%'
--    order by column_name;
--   -- esperado: 4 linhas | numeric | 5 | 2 | NO | 0
--
--   -- os quatro checks entraram?
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.nutris'::regclass
--      and conname like 'nutris_taxa_pct%'
--    order by conname;
--
--   -- a linha da Kelly ficou com zero nas quatro? (nenhuma nula)
--   select nome, taxa_pct_credito1x, taxa_pct_asaas,
--          taxa_pct_parcelado_base, taxa_pct_parcelado_por_parcela
--     from public.nutris;
--   -- esperado agora: 0.00 nas quatro colunas
--
--   -- a policy de update da propria linha existe? (a Personalizacao ja usa)
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'nutris'
--    order by policyname;
--
--   -- simulacao do modelo, sem gravar nada:
--   -- quanto daria uma venda de 2700 com base 3,5 e 1,4 por parcela?
--   select n as parcelas,
--          round(3.5 + 1.4 * (n - 1), 2)                as pct,
--          round(2700 * (3.5 + 1.4 * (n - 1)) / 100, 2) as taxa_reais
--     from generate_series(1, 12) as n;
--   -- 3x -> 6,30% -> R$ 170,10   |   12x -> 18,90% -> R$ 510,30
-- =============================================================
