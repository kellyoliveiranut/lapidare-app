-- =============================================================
-- Migration 2026-07-23
-- feed_pratos_comentarios — thread de comentários nas fotos de prato
-- =============================================================
-- Paciente responde; nutri comenta. Substitui o campo único
-- feed_pratos.comentario_nutri (mantido como fallback por ora — os
-- dois lados já leem só desta tabela; dropar a coluna num release
-- futuro). Idempotente.
-- =============================================================

-- 1. TABELA + ÍNDICE -------------------------------------------
create table if not exists public.feed_pratos_comentarios (
  id           uuid primary key default gen_random_uuid(),
  prato_id     uuid not null references public.feed_pratos(id) on delete cascade,
  paciente_id  uuid not null references public.pacientes(id)  on delete cascade, -- dona do prato
  autor        text not null check (autor in ('nutri','paciente')),
  texto        text not null,
  created_at   timestamptz not null default now()
);
create index if not exists fpc_prato_idx
  on public.feed_pratos_comentarios(prato_id, created_at);

-- 2. RLS -------------------------------------------------------
alter table public.feed_pratos_comentarios enable row level security;

-- Leitura: a dona do prato OU a nutri responsável
drop policy if exists fpc_select on public.feed_pratos_comentarios;
create policy fpc_select on public.feed_pratos_comentarios
  for select using (
    paciente_id = public.minha_paciente_id()
    or paciente_id in (select id from public.pacientes where nutri_id = auth.uid())
  );

-- Paciente responde só nas próprias fotos, e só como 'paciente'
drop policy if exists fpc_insert_paciente on public.feed_pratos_comentarios;
create policy fpc_insert_paciente on public.feed_pratos_comentarios
  for insert with check (
    autor = 'paciente'
    and paciente_id = public.minha_paciente_id()
  );

-- Nutri comenta só nas pacientes dela, e só como 'nutri'
drop policy if exists fpc_insert_nutri on public.feed_pratos_comentarios;
create policy fpc_insert_nutri on public.feed_pratos_comentarios
  for insert with check (
    autor = 'nutri'
    and paciente_id in (select id from public.pacientes where nutri_id = auth.uid())
  );

-- 3. GRANTS ----------------------------------------------------
grant select, insert, delete on public.feed_pratos_comentarios
  to anon, authenticated, service_role;

-- 4. BACKFILL (idempotente) ------------------------------------
-- Migra cada comentario_nutri existente pra 1 linha autor='nutri'.
insert into public.feed_pratos_comentarios (prato_id, paciente_id, autor, texto, created_at)
select fp.id, fp.paciente_id, 'nutri', fp.comentario_nutri, fp.created_at
from public.feed_pratos fp
where fp.comentario_nutri is not null
  and trim(fp.comentario_nutri) <> ''
  and not exists (
    select 1 from public.feed_pratos_comentarios c
    where c.prato_id = fp.id and c.autor = 'nutri'
  );
