-- DESFAZER da auditoria da confirmação do registro. ATENÇÃO: apaga quem/quando/fonte já gravados.
alter table public.tratamentos_oncologicos drop constraint if exists trat_onco_registro_conferencia_chk;
drop trigger if exists trg_trat_onco_registro_auditoria on public.tratamentos_oncologicos;
drop function if exists public.trat_onco_registro_auditoria();
alter table public.tratamentos_oncologicos
  drop column if exists registro_confirmado_em,
  drop column if exists registro_confirmado_por,
  drop column if exists registro_confirmado_fonte;
