-- Desfaz a renovação do contrato. Contratos de renovação JÁ criados deixam de
-- ter template (restrict): apague/arquive esses contratos antes, se existirem.
-- As funções previa/aceitar voltam às versões de 2026-08-22b e 2026-09-22:
-- reaplicar esses dois arquivos depois deste.
delete from public.contratos_templates where tipo = 'renovacao'
  and not exists (select 1 from public.contratos_essentia c where c.template_id = contratos_templates.id);
drop index if exists public.contratos_templates_ativo_tipo_unq;
create unique index if not exists contratos_templates_ativo_unq on public.contratos_templates (nutri_id) where ativo;
alter table public.contratos_templates drop constraint if exists contratos_templates_tipo_ck;
alter table public.contratos_templates drop column if exists tipo;
