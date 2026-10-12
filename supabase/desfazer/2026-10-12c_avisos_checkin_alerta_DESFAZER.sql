-- DESFAZER da 2026-10-12c. NÃO colocar em supabase/migrations/. Rodar só se for preciso reverter.
drop trigger if exists aviso_checkin_diario on public.monitoramento_oncologico;
drop trigger if exists aviso_checkin_respondido on public.checkin_envios;
drop function if exists public.trg_aviso_checkin_diario();
drop function if exists public.trg_aviso_checkin_respondido();
drop function if exists public.reservar_avisos_para_push(integer);
drop function if exists public.alerta_oncologico_checkin(public.monitoramento_oncologico);
delete from public.avisos_nutri where tipo in ('checkin_diario','alerta_oncologico','checkin_respondido');
drop index if exists public.avisos_nutri_push_pendente_idx;
alter table public.avisos_nutri drop constraint if exists avisos_nutri_tipo_check;
alter table public.avisos_nutri add constraint avisos_nutri_tipo_check
  check (tipo = any (array['contrato_assinado','foto_prato']::text[]));
alter table public.avisos_nutri drop column if exists push_enviado_em;
create or replace function public.marcar_avisos_tipo_vistos(p_tipo text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if p_tipo is null or p_tipo not in ('contrato_assinado', 'foto_prato') then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;
  update public.avisos_nutri a set visto_em = now()
   where a.nutri_id = auth.uid() and a.visto_em is null and a.tipo = p_tipo;
  get diagnostics n = row_count;
  return n;
end;
$$;
