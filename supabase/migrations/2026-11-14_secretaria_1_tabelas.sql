-- =============================================================
-- SECRETARIA — PASSO 1: tabelas novas e a função nutri_efetiva()
-- =============================================================
-- Só ADICIONA coisas novas. Não altera nenhuma regra existente (isso é o
-- passo 3, depois da simulação do passo 2). Idempotente.
-- Desfazer: supabase/desfazer/2026-11-14_secretaria_1_DESFAZER.sql
-- =============================================================

-- Uma secretária por nutri (índice parcial abaixo). user_id só é preenchido
-- quando ela aceita o convite e cria a senha.
create table if not exists public.secretarias (
  id           uuid primary key default gen_random_uuid(),
  nutri_id     uuid not null references public.nutris(id) on delete cascade,
  nome         text,
  email        text not null,
  user_id      uuid unique references auth.users(id) on delete set null,
  token        uuid default gen_random_uuid(),
  convidado_em timestamptz default now(),
  ativada_em   timestamptz,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);
create unique index if not exists secretarias_uma_ativa_por_nutri
  on public.secretarias (nutri_id) where ativo;

alter table public.secretarias enable row level security;

drop policy if exists secretarias_nutri on public.secretarias;
create policy secretarias_nutri on public.secretarias
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- A própria secretária lê a sua linha (é assim que o app descobre o papel dela).
drop policy if exists secretarias_ler_propria on public.secretarias;
create policy secretarias_ler_propria on public.secretarias
  for select using (user_id = auth.uid());

-- Quem é a "dona dos dados" para quem está logado: a secretária ativa enxerga
-- o id da nutri; qualquer outra pessoa enxerga o próprio id.
-- security definer: lê `secretarias` sem passar pelo RLS dela (evita recursão).
create or replace function public.nutri_efetiva()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select s.nutri_id from public.secretarias s
      where s.user_id = auth.uid() and s.ativo),
    auth.uid());
$$;
revoke all on function public.nutri_efetiva() from public;
grant execute on function public.nutri_efetiva() to anon, authenticated, service_role;

-- Chat interno nutri <-> secretária (as pacientes não têm acesso).
create table if not exists public.chat_equipe (
  id        bigint generated always as identity primary key,
  nutri_id  uuid not null references public.nutris(id) on delete cascade,
  de        text not null check (de in ('nutri','secretaria')),
  texto     text not null check (char_length(texto) between 1 and 2000),
  lida      boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists chat_equipe_nutri_idx on public.chat_equipe (nutri_id, criado_em);

alter table public.chat_equipe enable row level security;

drop policy if exists chat_equipe_ler on public.chat_equipe;
create policy chat_equipe_ler on public.chat_equipe
  for select using (nutri_id = public.nutri_efetiva());

-- O remetente é carimbado pelo banco: quem é a nutri escreve como 'nutri',
-- quem é a secretária escreve como 'secretaria' (não dá para se passar pela outra).
drop policy if exists chat_equipe_enviar on public.chat_equipe;
create policy chat_equipe_enviar on public.chat_equipe
  for insert with check (
    nutri_id = public.nutri_efetiva()
    and de = case when auth.uid() = nutri_id then 'nutri' else 'secretaria' end
  );

drop policy if exists chat_equipe_marcar_lida on public.chat_equipe;
create policy chat_equipe_marcar_lida on public.chat_equipe
  for update using (nutri_id = public.nutri_efetiva())
  with check (nutri_id = public.nutri_efetiva());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_equipe') then
    alter publication supabase_realtime add table public.chat_equipe;
  end if;
end $$;
