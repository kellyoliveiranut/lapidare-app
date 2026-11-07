drop trigger if exists trg_contrato_registra_quem_aceitou on public.contratos_essentia;
drop function if exists public.contrato_registra_quem_aceitou();
alter table public.contratos_essentia drop constraint if exists contratos_aceito_por_papel_ck;
alter table public.contratos_essentia
  drop column if exists aceito_por_papel,
  drop column if exists aceito_por_user_id,
  drop column if exists aceito_por_nome;
