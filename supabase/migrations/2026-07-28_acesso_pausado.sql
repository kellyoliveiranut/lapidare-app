-- =============================================================
-- Migration 2026-07-28
-- pacientes — pausa de acesso (documentação retroativa)
-- =============================================================
-- Estruturas criadas direto no Supabase em 16/07/2026, junto do commit e45f4e2
-- ("pausa de acesso da paciente — versão leve"), e nunca versionadas. Este
-- arquivo NÃO muda nada em produção: é transcrição fiel do que já está lá
-- (pg_get_functiondef / pg_get_triggerdef), para o banco poder ser recriado do
-- zero sem perder a proteção.
--
-- POR QUE O TRIGGER EXISTE: pacientes_update é `for update using (id =
-- auth.uid() or nutri_id = auth.uid())` — a paciente pode dar UPDATE na própria
-- linha, e RLS não restringe coluna no PostgREST. Sem o trigger ela despausaria
-- o próprio acesso com uma chamada à API. O bloqueio de tela
-- (PacienteBloqueio.jsx) é só visual; esta é a única parte da pausa que está de
-- fato protegida no banco.
--
-- POR QUE acesso_pausado_em NÃO É ESCRITO PELO APP: o trigger sempre recalcula
-- a coluna a partir de acesso_pausado (pausou → now(), despausou → null). Por
-- isso PacientePerfil.jsx manda só o boolean nos dois caminhos (alternarPausa e
-- desarquivar) — mandar a data seria ignorado.
--
-- POR QUE auth.uid() IS NOT NULL NO GUARD: em conexões sem JWT (service_role,
-- SQL Editor, funções do Netlify com a service key) auth.uid() é null e o guard
-- é pulado de propósito — senão manutenção pelo painel ficaria impossível.
-- Com JWT, só a nutri dona passa: qualquer outro uid, inclusive o da própria
-- paciente, leva 42501 (insufficient_privilege).
--
-- Idempotente: add column if not exists / create or replace / drop+create do
-- trigger. Rodar de novo na produção é no-op.
-- =============================================================

-- 1. COLUNAS ----------------------------------------------------------
alter table public.pacientes
  add column if not exists acesso_pausado boolean not null default false;
alter table public.pacientes
  add column if not exists acesso_pausado_em timestamptz;

comment on column public.pacientes.acesso_pausado is
  'Acesso da paciente ao app suspenso pela nutri. Bloqueio de tela, não de dados.';
comment on column public.pacientes.acesso_pausado_em is
  'Quando a pausa começou. NULL quando não está pausada. Derivada: escrita só pelo trigger.';


-- 2. FUNÇÃO -----------------------------------------------------------
-- Invoker (NÃO security definer): só mexe em NEW e lê OLD, não precisa de
-- privilégio nenhum. search_path fixo em public pelo mesmo motivo de sempre —
-- não deixar resolução de nome depender de quem chamou.
create or replace function public.protege_acesso_pausado()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.nutri_id then
    raise exception 'Somente a nutricionista responsável pode alterar o acesso desta paciente.'
      using errcode = '42501';
  end if;
  new.acesso_pausado_em := case when new.acesso_pausado then now() else null end;
  return new;
end;
$function$;


-- 3. TRIGGER ----------------------------------------------------------
-- A cláusula WHEN é o que mantém o resto dos UPDATEs em pacientes baratos e
-- fora do alcance do guard: salvar nome, objetivo ou ultimo_acesso não dispara
-- nada. Ela cobre acesso_pausado_em também para que uma tentativa de escrever a
-- data direto caia na função e seja recalculada, em vez de passar batido.
drop trigger if exists trg_protege_acesso_pausado on public.pacientes;
create trigger trg_protege_acesso_pausado
  before update on public.pacientes
  for each row
  when (
    old.acesso_pausado    is distinct from new.acesso_pausado
    or old.acesso_pausado_em is distinct from new.acesso_pausado_em
  )
  execute function public.protege_acesso_pausado();


-- =============================================================
-- Conferência
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid = 'public.pacientes'::regclass and not tgisinternal;
--   select count(*) filter (where acesso_pausado) as pausadas,
--          count(*) as total from public.pacientes;
-- Já existia na produção desde 2026-07-16; esta migration só documenta.
-- =============================================================
