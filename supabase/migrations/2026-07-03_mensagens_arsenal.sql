-- Arsenal de mensagens prontas da nutri: textos que ela copia e cola no WhatsApp
-- do grupo. Área INTERNA — a paciente nunca lê esta tabela (sem policy de paciente).
-- Organizadas por `categoria` (texto livre) e `ordem` dentro da categoria.

create table if not exists public.mensagens_arsenal (
  id         uuid primary key default gen_random_uuid(),
  nutri_id   uuid not null references public.nutris(id) on delete cascade,
  categoria  text    not null,             -- ex.: Engajamento, Educativa, Cupom…
  texto      text    not null,             -- placeholders livres: [CUPOM], [DATA], [LINK], [tema]…
  ordem      integer not null default 0,   -- ordem dentro da categoria
  created_at timestamptz not null default now()
);

create index if not exists mensagens_arsenal_nutri_idx
  on public.mensagens_arsenal(nutri_id, categoria, ordem);

alter table public.mensagens_arsenal enable row level security;

-- Nutri gerencia (CRUD completo) apenas as próprias mensagens. Sem policy de paciente:
-- é área interna e a paciente nunca acessa esta tabela.
drop policy if exists mensagens_arsenal_all_nutri on public.mensagens_arsenal;
create policy mensagens_arsenal_all_nutri on public.mensagens_arsenal
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

-- Seed das 51 mensagens é rodado separadamente no Supabase (não versionado aqui).
