-- Desfaz o acesso de cuidador. ATENÇÃO: apaga os vínculos de cuidador (colunas).
-- As policies/funções que ganharam o ramo do cuidador precisam voltar ao texto
-- anterior: rode antes, no SQL Editor, o bloco abaixo e depois o drop das colunas.

drop trigger if exists trg_protege_vinculo_paciente on public.pacientes;
drop function if exists public.protege_vinculo_paciente();

create or replace function public.minha_paciente_id()
 returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select id from public.pacientes where user_id = auth.uid() limit 1;
$function$;

drop policy if exists pacientes_select on public.pacientes;
create policy pacientes_select on public.pacientes
  for select using (user_id = auth.uid() or nutri_id = auth.uid());
drop policy if exists pacientes_update on public.pacientes;
create policy pacientes_update on public.pacientes
  for update using (user_id = auth.uid() or nutri_id = auth.uid());
drop policy if exists pacientes_update_self on public.pacientes;
create policy pacientes_update_self on public.pacientes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Demais policies e funções: tira o ramo do cuidador pelo mesmo caminho de texto.
do $$
declare r record; nq text; nw text; sql text; f record; d text; n text;
begin
  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies
           where coalesce(qual,'') like '%cuidador_user_id%' or coalesce(with_check,'') like '%cuidador_user_id%'
  loop
    nq := r.qual; nw := r.with_check;
    if nq is not null then
      -- O banco reimprime a expressão com parênteses em cada comparação.
      nq := replace(nq, ' OR (pacientes.cuidador_user_id = auth.uid())', '');
      nq := replace(nq, ' OR (p.cuidador_user_id = auth.uid())', '');
    end if;
    if nw is not null then
      nw := replace(nw, ' OR (pacientes.cuidador_user_id = auth.uid())', '');
      nw := replace(nw, ' OR (p.cuidador_user_id = auth.uid())', '');
    end if;
    sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if nq is not null then sql := sql || ' using (' || nq || ')'; end if;
    if nw is not null then sql := sql || ' with check (' || nw || ')'; end if;
    execute sql;
  end loop;

  for f in select p.proname, pg_get_functiondef(p.oid) as def
           from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.prosrc like '%cuidador_user_id%'
  loop
    d := f.def;
    n := replace(d, ' or p.cuidador_user_id = auth.uid()', '');
    n := replace(n, ' or p2.cuidador_user_id = auth.uid()', '');
    execute n;
  end loop;
end $$;

alter table public.pacientes
  drop column if exists cuidador_user_id,
  drop column if exists cuidador_nome,
  drop column if exists cuidador_email,
  drop column if exists cuidador_telefone,
  drop column if exists cuidador_token,
  drop column if exists cuidador_convidado_em,
  drop column if exists cuidador_ativado_em;
