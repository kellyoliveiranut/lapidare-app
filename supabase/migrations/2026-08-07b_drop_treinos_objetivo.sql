-- =============================================================
-- Migration 2026-08-07b
-- treinos_prescritos — remoção da coluna órfã `objetivo`
-- =============================================================
-- ATENÇÃO: esta migration ALTERA produção. Diferente das anteriores de
-- treinos (baseline, acesso_pausado), que só documentavam o que já estava
-- lá, esta aqui é para ser executada — e é destrutiva.
--
-- O QUE É A COLUNA: resíduo. Criada à mão em produção, nunca por migration
-- (a 2026-06-05c adiciona `objetivo_treino`, nunca `objetivo`). Provável
-- primeira tentativa de nomear o campo, abandonada quando `objetivo_treino`
-- entrou. Registrada como suspeita no baseline de 2026-08-07.
--
-- POR QUE O DROP É SEGURO (verificado em 2026-08-07, antes deste arquivo):
--   - Nenhum SELECT a nomeia. As três leituras da tabela são
--     PacienteLayout.jsx:194 (select('id')), Treinos.jsx:205 (select('*'))
--     e _Treinos.jsx:64 (select('*')). Como as duas últimas usam '*', a
--     coluna era trafegada em toda leitura sem ninguém consumir: não há
--     `treino.objetivo` em lugar nenhum, só `treino.objetivo_treino`.
--   - Nenhum INSERT ou UPDATE a escreve. O insert de _Treinos.jsx:85-101
--     lista as colunas uma a uma e `objetivo` não está entre elas; os
--     outros writes são update({ativo:false}) e delete().
--   - Contagem de linhas com valor não-nulo: zero, nas 22 linhas da tabela.
--
-- CUIDADO COM O NOME: `pacientes.objetivo` é uma coluna VIVA e sem relação
-- com esta — é o objetivo da paciente, que escolhe a biblioteca de vídeos em
-- Treinos.jsx e as abas em PacienteLayout.jsx. O drop abaixo é qualificado
-- em treinos_prescritos de propósito. Não replicar em pacientes.
--
-- NÃO É IDEMPOTENTE POR DESCUIDO, e sim por escolha: `if exists` faz o
-- segundo run virar no-op silencioso, que é o comportamento desejado aqui.
-- =============================================================

-- Guarda: aborta se aparecer dado na coluna entre a verificação e a execução.
-- A checagem de 2026-08-07 deu zero, mas o drop é irreversível e o intervalo
-- entre conferir e rodar não é zero. Se esta migration falhar com a mensagem
-- abaixo, NÃO force: leia o conteúdo primeiro, pode ser texto digitado que
-- nunca chegou a aparecer na tela.
do $$
declare
  n bigint;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'treinos_prescritos'
       and column_name  = 'objetivo'
  ) then
    execute 'select count(*) from public.treinos_prescritos where objetivo is not null'
      into n;
    if n > 0 then
      raise exception
        'Abortado: % linha(s) de treinos_prescritos têm objetivo não-nulo. Ler o conteúdo antes de dropar.', n;
    end if;
  end if;
end
$$;

alter table public.treinos_prescritos
  drop column if exists objetivo;


-- =============================================================
-- Conferência (rodar depois, deve devolver zero linhas)
--   select column_name from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'treinos_prescritos'
--      and column_name  = 'objetivo';
--
-- E confirmar que a irmã viva continua lá (deve devolver uma linha):
--   select column_name from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'treinos_prescritos'
--      and column_name  = 'objetivo_treino';
-- =============================================================
