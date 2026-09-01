-- =============================================================
-- Migration 2026-08-31b
-- parcelas.taxa_cartao — o que a maquininha come em cada repasse
-- =============================================================
-- O PROBLEMA: a área financeira mostra o BRUTO. A paciente paga 2.700, a
-- maquininha fica com 500, e a Kelly recebe 2.200 — mas todas as telas dizem
-- 2.700. Não é bug de exibição: o dado não existe. Nem `vendas` nem `parcelas`
-- têm qualquer coluna de taxa, desconto ou líquido (conferido no schema e por
-- busca no projeto inteiro).
--
-- O caso mais enganoso é a Previsibilidade, que compara a receita com a meta
-- de faturamento: com número bruto, a barra diz que a meta foi batida com
-- dinheiro que a maquininha ficou.
--
-- POR QUE NA PARCELA, E NÃO NA VENDA: é na parcela que "recebido" já é
-- calculado (status/data_pgto), e é parcela a parcela que a maquininha
-- repassa e desconta. Uma taxa por venda seria mais fácil de digitar, mas
-- teria de ser rateada na leitura por seis telas diferentes — e não
-- conseguiria registrar que um repasse veio 3 centavos diferente do outro.
-- A conveniência de digitar uma vez fica na UI: o modal de nova venda aceita
-- a taxa TOTAL e distribui proporcionalmente entre as parcelas geradas, com o
-- mesmo tratamento de centavos de gerarParcelas (resto na última). O dado
-- mora aqui, e cada parcela é editável depois.
--
-- POR QUE VALOR ABSOLUTO, E NÃO PERCENTUAL: é o que aparece no extrato da
-- maquininha. Percentual obrigaria a Kelly a fazer a conta de cabeça para
-- conferir contra o extrato, que é justamente o momento em que ela digita.
--
-- POR QUE NÃO EXISTE COLUNA DE LÍQUIDO: `valor - taxa_cartao` é derivado, e
-- coluna derivada é coluna que diverge. Bruto e líquido convivem na LEITURA:
-- o que sai de `parcelas` vira líquido (fluxo de caixa), o que sai de
-- `vendas.valor_total` fica bruto (preço combinado, contrato, nota, ticket
-- médio, receita por serviço).
--
-- NOT NULL DEFAULT 0, e não nulável: as parcelas que já existem viram taxa
-- zero, e o líquido passa a ser calculável em toda linha sem coalesce
-- espalhado por seis telas. Zero é a verdade para Pix e dinheiro.
--
-- ATENÇÃO AO HISTÓRICO: com default 0, toda venda antiga passa a contar como
-- se tivesse entrado integralmente. O backfill retroativo pelos extratos é
-- decisão da Kelly, com os extratos em mãos, e NÃO é feito aqui.
--
-- RLS: nada a fazer. `parcelas` já tem a policy parcelas_all
-- (nutri_id = auth.uid(), for all), do baseline 2026-08-01, e coluna nova é
-- coberta por ela — RLS é por linha, não por coluna.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled
-- e uma transação explícita pode terminar em rollback SILENCIOSO. Ctrl+A antes
-- do Run.
--
-- Idempotente: add column if not exists, e os checks por drop + add.
-- =============================================================


-- 1. COLUNA ------------------------------------------------------------

-- numeric(10,2) enquanto `valor` é numeric puro. A divergência é de
-- propósito: valor vem de gerarParcelas, que já entrega 2 casas via toFixed;
-- taxa vem digitada à mão, e a escala fixa impede que um 0,005 entre e vire
-- centavo fantasma na soma de seis telas.
alter table public.parcelas
  add column if not exists taxa_cartao numeric(10,2) not null default 0;


-- 2. CHECKS ------------------------------------------------------------
-- `add constraint if not exists` não existe em Postgres; drop + add é o
-- equivalente idempotente.

alter table public.parcelas drop constraint if exists parcelas_taxa_nao_negativa;
alter table public.parcelas add  constraint parcelas_taxa_nao_negativa
  check (taxa_cartao >= 0);

-- Taxa maior que a parcela é erro de digitação (vírgula no lugar errado, ou a
-- taxa da venda inteira colada numa parcela só). Sem este check ela produz
-- líquido NEGATIVO, que soma em silêncio contra a meta da Previsibilidade e
-- não aparece como erro em tela nenhuma.
alter table public.parcelas drop constraint if exists parcelas_taxa_menor_que_valor;
alter table public.parcelas add  constraint parcelas_taxa_menor_que_valor
  check (taxa_cartao <= valor);


-- 3. DOCUMENTAÇÃO ------------------------------------------------------

comment on column public.parcelas.taxa_cartao is
  'Quanto a maquininha ficou NESTE repasse, em reais. Liquido = valor -
   taxa_cartao. Zero para pix e dinheiro. NAO ha check de forma de pagamento:
   forma_pgto mora em vendas, e um check nao alcanca outra tabela -- quem
   restringe o campo as formas de cartao e a UI (VendaModais.jsx).';


-- =============================================================
-- Conferência (rode DEPOIS do Run, em Run separado)
--
--   -- a coluna existe, com o tipo e o default certos?
--   select column_name, data_type, numeric_precision, numeric_scale,
--          is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'parcelas'
--      and column_name = 'taxa_cartao';
--   -- esperado: numeric | 10 | 2 | NO | 0
--
--   -- os dois checks entraram?
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.parcelas'::regclass
--      and conname like 'parcelas_taxa%'
--    order by conname;
--
--   -- toda parcela existente ficou com zero? (nenhuma nula, nenhuma negativa)
--   select count(*) as total,
--          count(*) filter (where taxa_cartao is null)  as nulas,
--          count(*) filter (where taxa_cartao = 0)      as zeradas,
--          count(*) filter (where taxa_cartao > 0)      as com_taxa
--     from public.parcelas;
--   -- esperado agora: nulas = 0, zeradas = total, com_taxa = 0
--
--   -- o check barra o que tem que barrar? (as duas linhas devem dar ERRO)
--   -- update public.parcelas set taxa_cartao = -1  where false;
--   -- update public.parcelas set taxa_cartao = valor + 1 where false;
--   -- (o `where false` nao altera nada; sirva-se de uma parcela real de
--   --  teste se quiser ver o erro de fato acontecer)
--
--   -- a policy antiga cobre a coluna nova? (deve seguir 1 policy, for all)
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'parcelas';
-- =============================================================
