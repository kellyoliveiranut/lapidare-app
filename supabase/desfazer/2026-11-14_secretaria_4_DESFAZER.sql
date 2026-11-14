do $$
declare t text;
begin
  for t in select tablename from pg_policies where schemaname='public' and policyname='sem_exclusao_secretaria' loop
    execute format('drop policy if exists sem_exclusao_secretaria on public.%I', t);
  end loop;
  for t in select event_object_table from information_schema.triggers
           where trigger_schema='public' and trigger_name='atividade_secretaria_tg' group by 1 loop
    execute format('drop trigger if exists atividade_secretaria_tg on public.%I', t);
  end loop;
end $$;
drop function if exists public.registra_atividade_secretaria();
drop policy if exists atividade_equipe_ficha on public.atividade_equipe;
-- O histórico fica guardado; apague só se quiser:
-- drop table public.atividade_equipe;
drop function if exists public.eh_secretaria();
