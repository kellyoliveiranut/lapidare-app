-- =============================================================
-- FOTOS DOS PRATOS: APAGAR 90 DIAS DEPOIS DE ENCERRAR O ACOMPANHAMENTO
-- =============================================================
-- Decisão da Kelly (2026-11-24): as fotos do feed de pratos ficam durante o
-- acompanhamento e são apagadas 90 dias depois de a paciente ser arquivada
-- (finalizado ou óbito). Reativar a paciente zera o relógio.
--
-- O QUE ESTA MIGRATION FAZ
--   1. pacientes.encerrada_em: quando o status saiu de 'ativo'. Um trigger
--      mantém a coluna sozinho (status → finalizado/obito grava now();
--      volta a 'ativo' limpa).
--   2. Preenche encerrada_em das JÁ arquivadas com now(): o relógio dessas
--      começa HOJE, então nada é apagado antes de 90 dias a partir de agora.
--   3. Duas policies de DELETE para a nutri responsável, que só valem para
--      pacientes arquivadas há mais de 90 dias: uma em feed_pratos (os
--      comentários vão junto, por CASCADE) e uma no bucket fotos_pratos.
--      A paciente continua podendo apagar as próprias fotos, como antes.
--
-- QUEM APAGA: o app, quando a nutri abre o Feed (usa a API de Storage, que
-- remove o arquivo de verdade — apagar linha de storage.objects por SQL deixaria
-- o arquivo órfão). Secretária não apaga (as policies exigem ser a nutri dona).
--
-- Idempotente. Ctrl+A antes do Run. Desfazer:
--   supabase/desfazer/2026-11-24_fotos_pratos_retencao_DESFAZER.sql
-- =============================================================

-- 1. COLUNA E TRIGGER ---------------------------------------------------
alter table public.pacientes add column if not exists encerrada_em timestamptz;

create or replace function public.marca_encerrada_em()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status_paciente in ('finalizado', 'obito') and old.status_paciente = 'ativo' then
    new.encerrada_em := now();
  elsif new.status_paciente = 'ativo' then
    new.encerrada_em := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_marca_encerrada_em on public.pacientes;
create trigger trg_marca_encerrada_em
  before update of status_paciente on public.pacientes
  for each row
  when (old.status_paciente is distinct from new.status_paciente)
  execute function public.marca_encerrada_em();

-- 2. PACIENTES JÁ ARQUIVADAS: o relógio começa hoje -----------------------
update public.pacientes
   set encerrada_em = now()
 where status_paciente in ('finalizado', 'obito') and encerrada_em is null;

-- 3. POLICIES DE DELETE (só nutri dona, só arquivada há +90 dias) ----------
drop policy if exists feed_delete_nutri_encerrada on public.feed_pratos;
create policy feed_delete_nutri_encerrada on public.feed_pratos
  for delete using (
    exists (
      select 1 from public.pacientes p
       where p.id = feed_pratos.paciente_id
         and p.nutri_id = auth.uid()
         and p.status_paciente in ('finalizado', 'obito')
         and p.encerrada_em < now() - interval '90 days'
    )
  );

drop policy if exists fotos_pratos_storage_delete_nutri_encerrada on storage.objects;
create policy fotos_pratos_storage_delete_nutri_encerrada on storage.objects
  for delete using (
    bucket_id = 'fotos_pratos'
    and split_part(name, '/', 1) in (
      select p.id::text from public.pacientes p
       where p.nutri_id = auth.uid()
         and p.status_paciente in ('finalizado', 'obito')
         and p.encerrada_em < now() - interval '90 days'
    )
  );

-- Conferência: pacientes arquivadas e quando o prazo vence.
select nome, status_paciente, encerrada_em, encerrada_em + interval '90 days' as apaga_a_partir_de
  from public.pacientes
 where status_paciente in ('finalizado', 'obito')
 order by encerrada_em;
