-- Nota fiscal: lembrete de emitir (vendas e pacientes novas) e titular da nota
-- (quando a nota sai em nome de outra pessoa). Idempotente.
-- Desfazer: supabase/desfazer/2026-11-05b_nota_fiscal_lembrete_e_titular_DESFAZER.sql
alter table public.vendas    add column if not exists nf_lembrar      boolean not null default false;
alter table public.pacientes add column if not exists nf_emitir       boolean not null default false;
alter table public.pacientes add column if not exists nf_outra_pessoa boolean not null default false;
alter table public.pacientes add column if not exists nf_nome         text;
alter table public.pacientes add column if not exists nf_cpf          text;
alter table public.pacientes drop constraint if exists pacientes_nf_cpf_chk;
alter table public.pacientes add constraint pacientes_nf_cpf_chk
  check (nf_cpf is null or nf_cpf ~ '^[0-9]{11}$');
