-- Exames laboratoriais do EMAGRECIMENTO (a Oncologia continua em exames_laboratoriais).
--
-- Três tabelas, todas só da nutri (nutri_id = auth.uid()):
--   exames_emagrecimento      um exame por linha; os valores ficam em `valores` (jsonb,
--                             chave = marcador do catálogo do app), então incluir um
--                             marcador novo no app não exige migration.
--   exames_emag_referencias   as faixas e limites de alerta que a Kelly digita, uma linha
--                             por nutri. O app NÃO traz faixa nenhuma de fábrica.
--   exames_emag_marcadores    quais marcadores ela acompanha em cada paciente.
--
-- Idempotente. Ctrl+A antes do Run.

create table if not exists public.exames_emagrecimento (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  nutri_id    uuid not null references public.nutris(id)    on delete cascade,
  data_exame  date not null,
  valores     jsonb not null default '{}'::jsonb,
  obs         text,
  created_at  timestamptz not null default now()
);
create index if not exists exames_emag_paciente_idx
  on public.exames_emagrecimento (paciente_id, data_exame desc);

create table if not exists public.exames_emag_referencias (
  nutri_id   uuid primary key references public.nutris(id) on delete cascade,
  dados      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.exames_emag_marcadores (
  paciente_id uuid primary key references public.pacientes(id) on delete cascade,
  nutri_id    uuid not null references public.nutris(id) on delete cascade,
  chaves      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.exames_emagrecimento    enable row level security;
alter table public.exames_emag_referencias enable row level security;
alter table public.exames_emag_marcadores  enable row level security;

drop policy if exists exames_emag_nutri on public.exames_emagrecimento;
create policy exames_emag_nutri on public.exames_emagrecimento
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

drop policy if exists exames_emag_ref_nutri on public.exames_emag_referencias;
create policy exames_emag_ref_nutri on public.exames_emag_referencias
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

drop policy if exists exames_emag_marc_nutri on public.exames_emag_marcadores;
create policy exames_emag_marc_nutri on public.exames_emag_marcadores
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

grant select, insert, update, delete on public.exames_emagrecimento    to authenticated;
grant select, insert, update, delete on public.exames_emag_referencias to authenticated;
grant select, insert, update, delete on public.exames_emag_marcadores  to authenticated;

-- Conferir: deve listar as 3 tabelas com rls = true.
select c.relname as tabela, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('exames_emagrecimento','exames_emag_referencias','exames_emag_marcadores')
 order by 1;
