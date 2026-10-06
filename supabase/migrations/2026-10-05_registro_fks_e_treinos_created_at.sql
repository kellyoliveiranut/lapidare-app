-- ATENCAO: ja aplicado em producao. Este arquivo e registro, nao execucao.
-- Rodar em producao e seguro e nao muda nada: a parte 3 e um no-op guardado
-- por tipo, e a parte 4 so le o catalogo.
--
-- 2026-10-05: registro de tres estados reais do banco que o repositorio
-- descrevia errado. Decisoes da Kelly em 04/10/2026.
--
--   1. followups.consulta_id para consultas: ON DELETE CASCADE.
--      setup.sql e 2026-05-22c_followups.sql:35 diziam SET NULL.
--      Decisao: MANTER o CASCADE. Apagar uma consulta apaga o follow-up
--      ligado a ela. Visto por pg_constraint.confdeltype = 'c' em 2026-09-25
--      e extraido do banco em 2026-10-04 (consulta em pg_constraint):
--        followups_consulta_id_fkey FOREIGN KEY (consulta_id)
--          REFERENCES consultas(id) ON DELETE CASCADE
--      Na mesma consulta: nutri_id e paciente_id CASCADE, template_id
--      SET NULL, iguais ao setup.sql.
--
--   2. vendas.paciente_id para pacientes: ON DELETE CASCADE.
--      setup.sql:207 dizia SET NULL; 2026-08-01_vendas_parcelas_baseline.sql
--      ficou sem clausula. Decisao: MANTER o CASCADE. Conferido com
--      pg_get_constraintdef em 2026-10-04 e na lista de FKs para pacientes em
--      2026-10-05 (35 FKs, todas CASCADE). Excluir a paciente apaga as vendas
--      e, por parcelas.venda_id CASCADE, as parcelas. O ModalExcluir
--      (nutri/PacientePerfil.jsx) mostra quantas vendas e o valor antes do
--      clique desde o commit c34152a.
--
--   3. treinos_prescritos.created_at: de timestamp without time zone para
--      timestamptz, CONVERTIDA em producao em 2026-10-05 com o bloco abaixo.
--      2026-08-07_treinos_baseline.sql registra o tipo antigo e fica como
--      esta: e a foto de 2026-08-07.
--
-- POR QUE A PARTE 4 FALHA EM VEZ DE CORRIGIR: as FKs 1 e 2 nao sao trocadas
-- aqui. Um banco reconstruido pelas migrations antigas teria SET NULL / NO
-- ACTION, e a conferencia acusa isso com erro, em vez de deixar o banco novo
-- diferente da producao em silencio. O setup.sql foi alinhado ao CASCADE no
-- mesmo dia.
--
-- Sem begin/commit de proposito: no SQL Editor do Supabase a transacao
-- explicita pode dar rollback silencioso. Rodar tudo de uma vez (Ctrl+A).


-- 3. treinos_prescritos.created_at para timestamptz -----------------------
-- O bloco que rodou em producao em 2026-10-05, literal. Em producao, hoje,
-- a guarda ve timestamptz e so avisa "Nada feito".
--
-- PREMISSA do `using ... at time zone 'UTC'`: todo valor antigo e o relogio
-- UTC do momento da publicacao. Sustentada em 2026-10-05 por:
--   - sessao em UTC (show timezone);
--   - nenhuma das 10 versoes de nutri/_Treinos.jsx manda created_at no
--     insert (217e23b a 7412725), e nenhum outro arquivo, Netlify Function
--     ou edge function escreveu na tabela;
--   - nos 2 treinos com treinos_dias, o primeiro dia nasceu 4 a 7 s depois
--     do treino lido como UTC (perto de -10800 s indicaria hora local).
--   Ressalva: insert manual pelo SQL Editor nao deixa rastro no git.
--
-- Prova em producao: 39 linhas, 0 nulos, md5 dos instantes
-- 7d7eb9fd74e15f8127f167c990644d6c antes e depois, default now() mantido.
--
-- Efeito visivel: o "Publicado em" (nutri/_Treinos.jsx, nutri/_TreinoDias.jsx)
-- deixa de mostrar o dia seguinte para treino publicado entre 21h e 23h59 em
-- Belem. A ordenacao e o selo de novidade (PacienteLayout.jsx) nao mudam.
do $$
begin
  perform set_config('lock_timeout', '3s', true);
  if exists (
    select 1
      from pg_attribute a
     where a.attrelid = 'public.treinos_prescritos'::regclass
       and a.attname  = 'created_at'
       and a.attnum   > 0
       and not a.attisdropped
       and a.atttypid = 'timestamp without time zone'::regtype
  ) then
    alter table public.treinos_prescritos
      alter column created_at type timestamptz
      using created_at at time zone 'UTC';
    raise notice 'created_at convertida para timestamptz.';
  else
    raise notice 'Nada feito: created_at nao e timestamp without time zone.';
  end if;
end $$;


-- 4. Conferencia: so leitura ----------------------------------------------
-- As FKs sao achadas pela COLUNA, e nao pelo nome da constraint, para a
-- conferencia nao depender de nome (o de followups e
-- followups_consulta_id_fkey, extraido em 2026-10-04; o de vendas e
-- vendas_paciente_id_fkey).
do $$
declare
  falhas text := '';
begin
  if not exists (
    select 1 from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.conrelid = 'public.followups'::regclass
       and c.confrelid = 'public.consultas'::regclass
       and c.contype = 'f' and array_length(c.conkey, 1) = 1
       and a.attname = 'consulta_id' and c.confdeltype = 'c'
  ) then
    falhas := falhas || ' followups.consulta_id nao e CASCADE;';
  end if;

  if not exists (
    select 1 from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.conrelid = 'public.vendas'::regclass
       and c.confrelid = 'public.pacientes'::regclass
       and c.contype = 'f' and array_length(c.conkey, 1) = 1
       and a.attname = 'paciente_id' and c.confdeltype = 'c'
  ) then
    falhas := falhas || ' vendas.paciente_id nao e CASCADE;';
  end if;

  if not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'public.treinos_prescritos'::regclass
       and a.attname = 'created_at' and not a.attisdropped
       and a.atttypid = 'timestamptz'::regtype
  ) then
    falhas := falhas || ' treinos_prescritos.created_at nao e timestamptz;';
  end if;

  if falhas <> '' then
    raise exception 'Banco diferente do registrado em 2026-10-05:%', falhas;
  end if;
end $$;

-- Ultima instrucao: aparece no painel do editor. Esperado: as duas FKs com
-- "ON DELETE CASCADE" na definicao e o tipo "timestamp with time zone".
select 'followups.consulta_id' as item, pg_get_constraintdef(c.oid) as estado
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
 where c.conrelid = 'public.followups'::regclass and c.contype = 'f'
   and c.confrelid = 'public.consultas'::regclass and a.attname = 'consulta_id'
union all
select 'vendas.paciente_id', pg_get_constraintdef(c.oid)
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
 where c.conrelid = 'public.vendas'::regclass and c.contype = 'f'
   and c.confrelid = 'public.pacientes'::regclass and a.attname = 'paciente_id'
union all
select 'treinos_prescritos.created_at', format_type(a.atttypid, a.atttypmod)
  from pg_attribute a
 where a.attrelid = 'public.treinos_prescritos'::regclass
   and a.attname = 'created_at' and not a.attisdropped;
