-- =============================================================
-- SECRETARIA — PASSO 3: APLICAR (só depois da simulação conferida)
-- =============================================================
-- Troca `nutri_id = auth.uid()` por `nutri_id = public.nutri_efetiva()` nas
-- regras do banco. Para a Dra. NADA muda (nutri_efetiva() devolve o id dela);
-- a secretária ativa passa a ser reconhecida como a nutri.
-- Tudo numa transação: se uma regra falhar, nenhuma é alterada.
-- Guarda o texto ORIGINAL de cada regra em public._backup_regras_secretaria,
-- usado pelo desfazer. Mesma lógica da simulação (passo 2).
-- Desfazer: supabase/desfazer/2026-11-14_secretaria_3_DESFAZER.sql
-- =============================================================
create table if not exists public._backup_regras_secretaria (
  schemaname text not null, tablename text not null, policyname text not null,
  qual text, with_check text, feito_em timestamptz not null default now(),
  primary key (schemaname, tablename, policyname)
);
alter table public._backup_regras_secretaria enable row level security; -- sem política: ninguém lê pelo app

create table if not exists public._backup_funcoes_secretaria (
  proname text primary key, definicao text not null, feito_em timestamptz not null default now()
);
alter table public._backup_funcoes_secretaria enable row level security;

do $$
declare
  r record; q text; c text; n int := 0;
begin
  if to_regprocedure('public.nutri_efetiva()') is null then
    raise exception 'Rode primeiro o passo 1 (função nutri_efetiva não existe).';
  end if;

  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public','storage')
      and tablename not in ('secretarias','chat_equipe','_backup_regras_secretaria')
  loop
    if r.tablename = 'nutris' then
      q := regexp_replace(regexp_replace(coalesce(r.qual,''), '(^|[^_a-z])id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', '\1id = public.nutri_efetiva()', 'g'),
             'nutri_id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', 'nutri_id = public.nutri_efetiva()', 'g');
      c := regexp_replace(regexp_replace(coalesce(r.with_check,''), '(^|[^_a-z])id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', '\1id = public.nutri_efetiva()', 'g'),
             'nutri_id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', 'nutri_id = public.nutri_efetiva()', 'g');
    else
      q := regexp_replace(coalesce(r.qual,''), 'nutri_id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', 'nutri_id = public.nutri_efetiva()', 'g');
      c := regexp_replace(coalesce(r.with_check,''), 'nutri_id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', 'nutri_id = public.nutri_efetiva()', 'g');
    end if;

    -- Arquivos do bucket 'ebooks': a pasta é o id do dono (a nutri). Para a
    -- secretária a pasta é a da nutri; para as demais pessoas nada muda.
    if r.schemaname = 'storage' and (coalesce(r.qual,'') || coalesce(r.with_check,'')) like '%bucket_id = ''ebooks''%' then
      q := replace(q, '(auth.uid())::text', '(public.nutri_efetiva())::text');
      c := replace(c, '(auth.uid())::text', '(public.nutri_efetiva())::text');
    end if;

    if q = coalesce(r.qual,'') and c = coalesce(r.with_check,'') then continue; end if;

    insert into public._backup_regras_secretaria (schemaname, tablename, policyname, qual, with_check)
    values (r.schemaname, r.tablename, r.policyname, r.qual, r.with_check)
    on conflict do nothing;  -- não sobrescreve o original se rodar de novo

    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, q, c);
    elsif r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, q);
    else
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, c);
    end if;
    n := n + 1;
  end loop;
  raise notice 'Regras alteradas: %', n;
end $$;

-- ---------------------------------------------------------------
-- Funções do banco que decidem "quem é a nutri". Cada uma é refeita a partir
-- da definição atual (pg_get_functiondef), com o texto original guardado.
-- Se alguma não casar com o esperado, tudo é desfeito (a transação aborta).
--   avisos / painel / e-book : nutri_id = auth.uid()  -> nutri_efetiva()
--   travas protege_*         : auth.uid() distinto de old.nutri_id -> nutri_efetiva()
--   montar_box               : v_nutri_id := auth.uid() -> nutri_efetiva()
-- NÃO mexe em funções da paciente (confirmar consulta, aceitar contrato, etc.)
-- nem em registrar_push_aparelho: elas usam o login real de cada pessoa.
-- ---------------------------------------------------------------
do $$
declare
  nomes text[] := array[
    'marcar_avisos_tipo_vistos','marcar_avisos_vistos','nutri_dona_do_ebook','painel_notificacoes_pacientes',
    'protege_acesso_pausado','protege_colunas_paciente','protege_metas_evolucao','protege_recado_evolucao',
    'protege_vinculo_paciente','montar_box'];
  nome text; r record; def text; novo text; feitas int := 0;
begin
  foreach nome in array nomes loop
    select p.oid, pg_get_functiondef(p.oid) as def into r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = nome;
    if r.oid is null then raise exception 'Função % não encontrada.', nome; end if;
    def := r.def;
    if def like '%nutri_efetiva()%' then continue; end if;  -- já ajustada numa execução anterior

    if nome like 'protege\_%' then
      novo := replace(def, 'auth.uid() is distinct from old.nutri_id', 'public.nutri_efetiva() is distinct from old.nutri_id');
    elsif nome = 'montar_box' then
      novo := regexp_replace(def, 'v_nutri_id(\s+)uuid := auth\.uid\(\)', 'v_nutri_id\1uuid := public.nutri_efetiva()');
      if novo like '%auth.uid()%' then raise exception 'montar_box ainda usa auth.uid() em outro ponto — me envie a definição.'; end if;
    else
      novo := replace(def, 'nutri_id = auth.uid()', 'nutri_id = public.nutri_efetiva()');
      if novo like '%auth.uid()%' then raise exception '% ainda usa auth.uid() em outro ponto — me envie a definição.', nome; end if;
    end if;

    if novo = def then raise exception 'Função % fora do formato esperado — me envie a definição.', nome; end if;

    insert into public._backup_funcoes_secretaria (proname, definicao) values (nome, def) on conflict do nothing;
    execute novo;
    feitas := feitas + 1;
  end loop;
  raise notice 'Funções alteradas: %', feitas;
end $$;

select (select count(*) from public._backup_regras_secretaria) as regras_alteradas,
       (select count(*) from public._backup_funcoes_secretaria) as funcoes_alteradas;
