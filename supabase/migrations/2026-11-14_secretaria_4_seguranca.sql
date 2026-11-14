-- =============================================================
-- SECRETARIA — PASSO 4: trava de exclusões + registro de atividade
-- =============================================================
-- Rode DEPOIS dos passos 1 e 3. Aditivo; não altera regras existentes.
--
-- 1) TRAVA: a secretária NÃO consegue excluir paciente, dado clínico nem
--    financeiro (ela vê e edita; excluir é só da Dra.). Feita com regras
--    RESTRITIVAS de DELETE, que se somam às regras que já existem. Quem não é
--    secretária (Dra., pacientes, cuidadoras) não é afetado.
--    Ela continua podendo excluir/cancelar consultas, tarefas e bloqueios de agenda.
--
-- 2) REGISTRO: tabela atividade_equipe, preenchida por gatilhos do banco
--    (não dá para o app pular). Só registra ações da SECRETÁRIA. Só a Dra. lê.
--
-- Desfazer: supabase/desfazer/2026-11-14_secretaria_4_DESFAZER.sql
-- =============================================================
begin;

create or replace function public.eh_secretaria()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.secretarias s where s.user_id = auth.uid() and s.ativo);
$$;
revoke all on function public.eh_secretaria() from public;
grant execute on function public.eh_secretaria() to anon, authenticated, service_role;

-- ---------- 1) trava de exclusões ----------
do $$
declare
  t text;
  tabelas text[] := array[
    'pacientes','contratos_essentia','planos','prescricoes','dietas_pdf','listas_compras',
    'suplementos','suplementos_logs','exames_laboratoriais','exames_emagrecimento','anamneses',
    'tratamentos_oncologicos','ciclos_quimio','monitoramento_oncologico','treinos_prescritos',
    'ebooks','vendas','parcelas','gastos','mensagens','feed_pratos','habitos'];
  feitas int := 0;
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'sem_exclusao_secretaria', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete using (not public.eh_secretaria())',
      'sem_exclusao_secretaria', t);
    feitas := feitas + 1;
  end loop;
  raise notice 'Tabelas com trava de exclusão: %', feitas;
end $$;

-- ---------- 2) registro de atividade ----------
create table if not exists public.atividade_equipe (
  id          bigint generated always as identity primary key,
  nutri_id    uuid not null references public.nutris(id) on delete cascade,
  user_id     uuid,                       -- login real da secretária
  acao        text not null,              -- 'criou' | 'alterou' | 'excluiu' | 'abriu_ficha'
  tabela      text,
  registro_id text,
  paciente_id uuid,
  detalhe     jsonb,                      -- colunas que mudaram (só nomes, sem conteúdo clínico)
  criado_em   timestamptz not null default now()
);
create index if not exists atividade_equipe_nutri_idx on public.atividade_equipe (nutri_id, criado_em desc);
create index if not exists atividade_equipe_paciente_idx on public.atividade_equipe (paciente_id, criado_em desc);

alter table public.atividade_equipe enable row level security;

-- Só a Dra. lê. Ninguém edita nem apaga pelo app (sem políticas de UPDATE/DELETE).
drop policy if exists atividade_equipe_ler on public.atividade_equipe;
create policy atividade_equipe_ler on public.atividade_equipe
  for select using (nutri_id = auth.uid());

-- A secretária só pode registrar "abriu a ficha" (o resto vem dos gatilhos, que
-- rodam como dono da função e não precisam desta regra).
drop policy if exists atividade_equipe_ficha on public.atividade_equipe;
create policy atividade_equipe_ficha on public.atividade_equipe
  for insert with check (
    public.eh_secretaria()
    and nutri_id = public.nutri_efetiva()
    and user_id = auth.uid()
    and acao = 'abriu_ficha'
  );

create or replace function public.registra_atividade_secretaria()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_nutri uuid;
  v_novo jsonb;
  v_ant jsonb;
  v_linha jsonb;
  v_pac uuid;
  v_mudou text[];
  k text;
begin
  if not public.eh_secretaria() then
    return coalesce(new, old);              -- só registra a secretária
  end if;
  if tg_table_name = 'mensagens' and tg_op = 'UPDATE' then
    return new;                             -- marcar como lida não é atividade
  end if;
  v_nutri := public.nutri_efetiva();
  v_ant := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_novo := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_linha := coalesce(v_novo, v_ant);

  begin
    v_pac := case when tg_table_name = 'pacientes' then (v_linha->>'id')::uuid
                  else nullif(v_linha->>'paciente_id','')::uuid end;
  exception when others then v_pac := null;
  end;

  if tg_op = 'UPDATE' then
    for k in select key from jsonb_each(v_novo) loop
      if v_novo->k is distinct from v_ant->k then v_mudou := array_append(v_mudou, k); end if;
    end loop;
    if v_mudou is null then return new; end if;   -- nada mudou de fato
  end if;

  insert into public.atividade_equipe (nutri_id, user_id, acao, tabela, registro_id, paciente_id, detalhe)
  values (v_nutri, auth.uid(),
          case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end,
          tg_table_name, v_linha->>'id', v_pac,
          case when v_mudou is not null then jsonb_build_object('colunas', to_jsonb(v_mudou)) end);
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
  tabelas text[] := array[
    'pacientes','consultas','bloqueios_agenda','contratos_essentia','planos','prescricoes','dietas_pdf',
    'listas_compras','suplementos','exames_laboratoriais','exames_emagrecimento','anamneses',
    'tratamentos_oncologicos','ciclos_quimio','vendas','parcelas','gastos','mensagens','servicos',
    'ebooks','locais_atendimento','lembretes_nutri'];
  feitas int := 0;
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists atividade_secretaria_tg on public.%I', t);
    execute format(
      'create trigger atividade_secretaria_tg after insert or update or delete on public.%I '
      'for each row execute function public.registra_atividade_secretaria()', t);
    feitas := feitas + 1;
  end loop;
  raise notice 'Tabelas com registro de atividade: %', feitas;
end $$;

commit;
