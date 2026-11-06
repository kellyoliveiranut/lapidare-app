-- =============================================================
-- ACESSO DE CUIDADOR — 1 cuidador por paciente, com o mesmo acesso dela
-- =============================================================
-- O cuidador tem o PRÓPRIO login (auth.users) e fica ligado à paciente pela
-- coluna pacientes.cuidador_user_id. Tudo que hoje reconhece "o login da
-- paciente" passa a reconhecer também o do cuidador:
--   1. minha_paciente_id()  — cobre quase todas as tabelas (checkin, planos…)
--   2. policies escritas direto com pacientes.user_id (ficha, contratos,
--      mensagens do ciclo/emagrecimento e os buckets de arquivos)
--   3. funções security definer da paciente (confirmar consulta, contrato…)
-- E uma trava nova: só a nutri responsável mexe em user_id/nutri_id/cuidador_*.
-- Sem ela, o cuidador (que agora pode editar a ficha) poderia se colocar como
-- dono da conta.
--
-- Idempotente: rodar de novo é no-op. Desfazer:
-- supabase/desfazer/2026-11-06_acesso_cuidador_DESFAZER.sql
-- =============================================================

-- 1. COLUNAS -----------------------------------------------------------
alter table public.pacientes add column if not exists cuidador_user_id      uuid;
alter table public.pacientes add column if not exists cuidador_nome         text;
alter table public.pacientes add column if not exists cuidador_email        text;
alter table public.pacientes add column if not exists cuidador_telefone     text;
alter table public.pacientes add column if not exists cuidador_token        uuid;
alter table public.pacientes add column if not exists cuidador_convidado_em timestamptz;
alter table public.pacientes add column if not exists cuidador_ativado_em   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pacientes_cuidador_user_fk') then
    alter table public.pacientes
      add constraint pacientes_cuidador_user_fk
      foreign key (cuidador_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- Um login só pode ser cuidador de UMA paciente, e o token do convite é único.
create unique index if not exists pacientes_cuidador_user_uk
  on public.pacientes (cuidador_user_id) where cuidador_user_id is not null;
create unique index if not exists pacientes_cuidador_token_uk
  on public.pacientes (cuidador_token) where cuidador_token is not null;


-- 2. minha_paciente_id(): paciente OU cuidador ---------------------------
create or replace function public.minha_paciente_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select id from public.pacientes
  where user_id = auth.uid() or cuidador_user_id = auth.uid()
  limit 1;
$function$;


-- 3. POLICIES escritas direto com pacientes.user_id ---------------------
-- Ficha da paciente (3 policies): reescritas à mão.
drop policy if exists pacientes_select on public.pacientes;
create policy pacientes_select on public.pacientes
  for select using (user_id = auth.uid() or cuidador_user_id = auth.uid() or nutri_id = auth.uid());

drop policy if exists pacientes_update on public.pacientes;
create policy pacientes_update on public.pacientes
  for update using (user_id = auth.uid() or cuidador_user_id = auth.uid() or nutri_id = auth.uid());

drop policy if exists pacientes_update_self on public.pacientes;
create policy pacientes_update_self on public.pacientes for update
  using (user_id = auth.uid() or cuidador_user_id = auth.uid())
  with check (user_id = auth.uid() or cuidador_user_id = auth.uid());

-- Demais policies: troca de texto sobre a definição que está NO BANCO, para não
-- depender de cópia. Só mexe nas listadas; se alguma não existir ou não tiver o
-- trecho esperado, a migração aborta (nada fica pela metade: é uma transação).
do $$
declare
  r record;
  nq text;
  nw text;
  sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where (schemaname, tablename, policyname) in (
      ('public','contratos_essentia','contratos_essentia_paciente_select'),
      ('public','mensagens_ciclo','mensagens_ciclo_select_paciente'),
      ('public','mensagens_emagrecimento','mensagens_emag_select_paciente'),
      ('storage','objects','avatares_pacientes_delete'),
      ('storage','objects','avatares_pacientes_insert'),
      ('storage','objects','avatares_pacientes_update'),
      ('storage','objects','chat_anexos_storage_delete'),
      ('storage','objects','chat_anexos_storage_insert_paciente'),
      ('storage','objects','chat_anexos_storage_select'),
      ('storage','objects','ebooks_storage_select'),
      ('storage','objects','fotos_pratos_storage_delete_paciente'),
      ('storage','objects','fotos_pratos_storage_insert_paciente'),
      ('storage','objects','fotos_pratos_storage_select'),
      ('storage','objects','prescricoes_storage_select')
    )
  loop
    if coalesce(r.qual,'') like '%cuidador_user_id%' or coalesce(r.with_check,'') like '%cuidador_user_id%' then
      continue;   -- já migrada
    end if;

    nq := r.qual;
    nw := r.with_check;
    if nq is not null then
      nq := replace(nq, 'pacientes.user_id = auth.uid()', '(pacientes.user_id = auth.uid() OR pacientes.cuidador_user_id = auth.uid())');
      nq := replace(nq, 'p.user_id = auth.uid()',         '(p.user_id = auth.uid() OR p.cuidador_user_id = auth.uid())');
    end if;
    if nw is not null then
      nw := replace(nw, 'pacientes.user_id = auth.uid()', '(pacientes.user_id = auth.uid() OR pacientes.cuidador_user_id = auth.uid())');
      nw := replace(nw, 'p.user_id = auth.uid()',         '(p.user_id = auth.uid() OR p.cuidador_user_id = auth.uid())');
    end if;

    if nq is not distinct from r.qual and nw is not distinct from r.with_check then
      raise exception 'Policy % em %.% não tem o trecho esperado; nada foi alterado.',
        r.policyname, r.schemaname, r.tablename;
    end if;

    sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if nq is not null then sql := sql || ' using (' || nq || ')'; end if;
    if nw is not null then sql := sql || ' with check (' || nw || ')'; end if;
    execute sql;
  end loop;
end $$;


-- 4. FUNÇÕES security definer da paciente --------------------------------
-- Mesma técnica: lê a definição do banco e acrescenta o ramo do cuidador.
do $$
declare
  f record;
  d text;
  n text;
begin
  for f in
    select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('confirmar_consulta','avisar_ausencia_consulta',
                        'aceitar_contrato_essentia','marcar_avaliacao_preenchida',
                        'previa_contrato_essentia')
  loop
    d := f.def;
    if d like '%cuidador_user_id%' then continue; end if;
    n := replace(d, 'p.user_id = auth.uid() or p.id = auth.uid()',
                    'p.user_id = auth.uid() or p.id = auth.uid() or p.cuidador_user_id = auth.uid()');
    n := replace(n, 'p2.user_id = auth.uid() or p2.id = auth.uid()',
                    'p2.user_id = auth.uid() or p2.id = auth.uid() or p2.cuidador_user_id = auth.uid()');
    if n = d then
      raise exception 'Função % não tem o trecho esperado; nada foi alterado.', f.proname;
    end if;
    execute n;
  end loop;
end $$;


-- 5. TRAVA: só a nutri responsável mexe no vínculo ------------------------
-- Com auth.uid() nulo (service_role, SQL Editor, trigger de cadastro) passa,
-- igual às outras travas desta tabela.
create or replace function public.protege_vinculo_paciente()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.nutri_id then
    raise exception 'Somente a nutricionista responsável pode alterar o vínculo de acesso desta paciente.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_protege_vinculo_paciente on public.pacientes;
create trigger trg_protege_vinculo_paciente
  before update on public.pacientes
  for each row
  when (
    old.user_id               is distinct from new.user_id
    or old.nutri_id           is distinct from new.nutri_id
    or old.cuidador_user_id   is distinct from new.cuidador_user_id
    or old.cuidador_nome      is distinct from new.cuidador_nome
    or old.cuidador_email     is distinct from new.cuidador_email
    or old.cuidador_telefone  is distinct from new.cuidador_telefone
    or old.cuidador_token     is distinct from new.cuidador_token
    or old.cuidador_convidado_em is distinct from new.cuidador_convidado_em
    or old.cuidador_ativado_em   is distinct from new.cuidador_ativado_em
  )
  execute function public.protege_vinculo_paciente();
