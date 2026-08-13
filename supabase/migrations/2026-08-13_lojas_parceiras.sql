-- =============================================================
-- Migration 2026-08-13
-- lojas_parceiras — para onde vai a prescrição de suplementação
-- =============================================================
-- POR QUE TABELA E NÃO COLUNA EM nutris: a farmácia de manipulação é uma só
-- (nutris.farmacia_email/farmacia_nome) porque o envio é e-mail e tem destino
-- único. Loja parceira é lista: a nutri pode ter mais de uma e escolhe na hora
-- do envio. Mesmo formato de locais_atendimento — lista curta, editável, da
-- nutri, não da paciente.
--
-- POR QUE telefone É TEXTO LIVRE: é digitado à mão e só serve para montar o
-- link wa.me, que o cliente já normaliza com normalizarTelefone() de
-- src/lib/utils.js — a mesma função usada no convite e no lembrete de consulta.
-- Não repetir aqui a regra do nono dígito que já existe em dois lugares.
--
-- POR QUE ativo EM VEZ DE DELETE: loja aposentada pode voltar, e a coluna é o
-- que decide se ela aparece no chooser do modal. Some da tela; a linha fica.
--
-- POR QUE NÃO TEM HISTÓRICO DE ENVIO (diferente de envios_farmacia): o envio
-- para a farmácia sai do servidor (Brevo) e o app sabe que aconteceu. Aqui o
-- app só abre o WhatsApp — quem manda é a nutri, no celular dela. Gravar
-- "enviado" seria registrar uma coisa que o app não pode confirmar.
--
-- SEM TELA DE CADASTRO: as lojas entram por SQL, como locais_atendimento
-- entrou. Se um dia virar tela, ela edita esta mesma tabela.
--
-- RLS: uma policy `for all` por nutri_id, mesmo padrão de locais_atendimento e
-- envios_farmacia. A paciente não lê nada aqui.
--
-- Idempotente: create table / create index / drop+create policy / insert com
-- on conflict do nothing. Rodar de novo é no-op.
-- =============================================================

-- 1. TABELA ------------------------------------------------------------
create table if not exists public.lojas_parceiras (
  id         uuid primary key default gen_random_uuid(),
  nutri_id   uuid not null references public.nutris(id) on delete cascade,
  nome       text not null,
  telefone   text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Único por nutri: evita a mesma loja cadastrada duas vezes e é o alvo do
-- on conflict do seed.
create unique index if not exists lojas_parceiras_nutri_nome_idx
  on public.lojas_parceiras (nutri_id, nome);

comment on column public.lojas_parceiras.telefone is
  'Telefone como digitado. O link wa.me é montado no cliente com normalizarTelefone().';


-- 2. RLS ---------------------------------------------------------------
alter table public.lojas_parceiras enable row level security;

drop policy if exists lojas_parceiras_nutri on public.lojas_parceiras;
create policy lojas_parceiras_nutri on public.lojas_parceiras
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());


-- 3. SEED (as duas lojas parceiras) ------------------------------------
-- Sem UUID chumbado: casa por e-mail em nutris, igual locais_atendimento. Se a
-- nutri não existir, o insert não faz nada em vez de quebrar.
insert into public.lojas_parceiras (nutri_id, nome, telefone)
select n.id, v.nome, v.telefone
from public.nutris n
cross join (values
  ('Divina Terra Plaza',       '+55 91 9310-9900'),
  ('Puro Natural Wandenkolk',  '+55 91 9290-2224')
) as v(nome, telefone)
where n.email = 'kellynut01@gmail.com'
on conflict (nutri_id, nome) do nothing;


-- =============================================================
-- Conferência
--   select nome, telefone, ativo from public.lojas_parceiras order by nome;
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='lojas_parceiras';
-- =============================================================
