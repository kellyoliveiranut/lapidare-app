-- =============================================================
-- Migration 2026-08-28
-- pacientes — coluna sexo, para variar o conteúdo do check-in
-- =============================================================
-- O check-in semanal nasceu escrito no feminino: o TEMPLATE_PADRAO
-- (src/lib/checkinDefault.js) tem uma seção "Corpo & ciclo" (inchaço e fase do
-- ciclo menstrual) e quatro termos com gênero marcado espalhados por outras
-- perguntas. Pacientes homens (Otávio, Ernestino, Nicolas) recebiam esse
-- conteúdo e a correção era feita À MÃO, template por template.
--
-- Não existia nenhum campo no banco que distinguisse isso. Esta coluna é o
-- dado que faltava; a escolha do conteúdo vive em src/lib/checkinVariacao.js.
--
-- NULLABLE E SEM DEFAULT, DE PROPÓSITO: as pacientes já cadastradas não têm
-- esse dado, e inventar um para elas seria o mesmo erro que a migration tenta
-- resolver. Nulo é um estado legítimo — significa "ninguém marcou ainda".
--
-- O QUE FAZER COM O NULO NÃO É DECIDIDO AQUI: quem recebe nulo cai na versão
-- MASCULINA (neutra), que é a segura — perguntar sobre ciclo menstrual a quem
-- não tem é o custo que já foi pago uma vez. Essa regra mora no código, e não
-- num default da coluna, porque um default gravaria a suposição na ficha da
-- paciente como se fosse fato informado.
--
-- SÓ DUAS OPÇÕES: 'feminino' e 'masculino'. A coluna existe para escolher
-- entre DUAS variações de conteúdo — não é um campo de identidade de gênero,
-- e um terceiro valor não teria conteúdo para onde apontar. Se um dia tiver,
-- a constraint é trocada aqui.
--
-- ONCOLOGIA NÃO ENTRA NESTA COLUNA: as perguntas oncológicas se aplicam a
-- qualquer paciente em tratamento, homem ou mulher, e o marcador já existe —
-- pacientes.objetivo = 'Oncologia' (ver src/lib/objetivos.js, e o isOnco em
-- PacientePerfil.jsx:1023). Nenhuma coluna nova para isso.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled
-- e uma transação explícita pode terminar em rollback SILENCIOSO — o editor
-- reporta sucesso e nada é aplicado. Sem transação, cada statement se resolve
-- sozinho e um erro aparece como erro. Rode tudo de uma vez (Ctrl+A antes do
-- Run): o editor executa só o texto selecionado quando há seleção.
-- =============================================================

-- 1. COLUNA -----------------------------------------------------------
alter table public.pacientes
  add column if not exists sexo text;

-- CHECK em passo separado: `add column if not exists` não recria a constraint
-- se a coluna já existir, então o drop+add garante que ela esteja no lugar.
--
-- O `sexo is null or` é redundante para o Postgres (um IN com NULL avalia como
-- NULL, e o check só barra quando é FALSE), mas está escrito porque a intenção
-- precisa ser óbvia para quem ler: nulo é permitido de propósito, não por
-- descuido de quem escreveu a constraint.
alter table public.pacientes
  drop constraint if exists pacientes_sexo_check;
alter table public.pacientes
  add constraint pacientes_sexo_check
  check (sexo is null or sexo in ('feminino', 'masculino'));

comment on column public.pacientes.sexo is
  'feminino | masculino, ou NULL quando ninguém marcou. Escolhe a variação de conteúdo do check-in (src/lib/checkinVariacao.js): feminino mantém a seção "Corpo & ciclo" e o texto atual; masculino e NULL caem na versão neutra. NÃO é identidade de gênero, e NÃO tem relação com as perguntas oncológicas — essas seguem pacientes.objetivo = ''Oncologia''.';

-- =============================================================
-- Conferência
--   -- a coluna existe, é text e aceita nulo
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='pacientes' and column_name='sexo';
--
--   -- a constraint existe e tem os dois valores
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.pacientes'::regclass and conname='pacientes_sexo_check';
--
--   -- distribuição: logo após aplicar, TODAS devem estar em null
--   select coalesce(sexo,'(null)') as sexo, count(*)
--     from public.pacientes group by 1 order by 2 desc;
--
-- Backfill: nenhum. As fichas existentes ficam em null de propósito e ganham
-- valor pela tela de edição do perfil (PacientePerfil.jsx), uma a uma.
-- =============================================================
