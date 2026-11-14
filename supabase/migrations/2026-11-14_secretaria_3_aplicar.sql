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

select count(*) as regras_alteradas from public._backup_regras_secretaria;
