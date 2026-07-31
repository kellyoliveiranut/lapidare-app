-- ATENÇÃO: já aplicado em produção. Este arquivo é registro, não execução.
--
-- 2026-07-31: baseline de mensagens_ciclo
-- A tabela existe em produção desde antes do versionamento e não aparece
-- em setup.sql nem em nenhuma migration anterior. Este arquivo apenas
-- registra a estrutura existente; nada é alterado no banco.
--
-- Contexto: sustenta a mensagem motivacional do topo do app da paciente
-- (src/app/paciente/Inicio.jsx:172-182). Hoje o campo `fase` é usado como
-- chave fixa com o valor literal 'ativa', e o unique (nutri_id, fase)
-- limita a nutri a uma mensagem por vez. A feature de mensagens por fase
-- do ciclo pretende usar `fase` para valer.

create table if not exists public.mensagens_ciclo (
  id         uuid        not null default gen_random_uuid(),
  nutri_id   uuid        not null default auth.uid(),
  fase       text        not null,
  mensagem   text        not null,
  ativo      boolean     not null default true,
  created_at timestamptz not null default now(),
  constraint mensagens_ciclo_pkey primary key (id),
  constraint mensagens_ciclo_nutri_id_fase_key unique (nutri_id, fase)
);

alter table public.mensagens_ciclo enable row level security;

-- A nutri gerencia as próprias mensagens.
create policy mensagens_ciclo_write_nutri on public.mensagens_ciclo
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

-- Leitura: a nutri vê as suas; a paciente vê as da nutri dela.
create policy mensagens_ciclo_select_paciente on public.mensagens_ciclo
  for select
  using (
    nutri_id = auth.uid()
    or nutri_id in (
      select pacientes.nutri_id from pacientes
      where pacientes.user_id = auth.uid()
    )
  );
