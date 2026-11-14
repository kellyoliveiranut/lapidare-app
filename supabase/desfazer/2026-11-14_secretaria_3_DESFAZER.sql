-- Restaura o texto ORIGINAL de cada regra alterada pelo passo 3.
do $$
declare r record; n int := 0;
begin
  for r in select * from public._backup_regras_secretaria loop
    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, r.qual, r.with_check);
    elsif r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, r.qual);
    else
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, r.with_check);
    end if;
    n := n + 1;
  end loop;
  raise notice 'Regras restauradas: %', n;
end $$;
do $$
declare r record; n int := 0;
begin
  for r in select * from public._backup_funcoes_secretaria loop
    execute r.definicao; n := n + 1;
  end loop;
  raise notice 'Funções restauradas: %', n;
end $$;
-- Depois de conferir, pode apagar o backup:
-- drop table public._backup_regras_secretaria;
-- drop table public._backup_funcoes_secretaria;
