-- 2026-10-12c — Avisos para a nutri: check-in respondido (diário e formulário) e alerta oncológico.
-- Idempotente. Não apaga nem altera dados existentes de pacientes.
-- Registra também, no repositório, a definição de avisos_nutri/gatilhos/funções que só existiam no banco.
-- Desfazer: supabase/desfazer/2026-10-12c_avisos_checkin_alerta_DESFAZER.sql

-- 1) Tipos novos + marcação de push pendente --------------------------------------------------
alter table public.avisos_nutri add column if not exists push_enviado_em timestamptz;

-- Avisos que já existem (contrato, foto) não usam este caminho de push.
update public.avisos_nutri set push_enviado_em = coalesce(push_enviado_em, criado_em)
 where push_enviado_em is null;

alter table public.avisos_nutri drop constraint if exists avisos_nutri_tipo_check;
alter table public.avisos_nutri add constraint avisos_nutri_tipo_check
  check (tipo = any (array['contrato_assinado','foto_prato','checkin_diario','alerta_oncologico','checkin_respondido']::text[]));

create index if not exists avisos_nutri_push_pendente_idx
  on public.avisos_nutri (criado_em) where push_enviado_em is null;

-- 2) Regra única do alerta oncológico (a mesma do semáforo vermelho da nutri + febre) ----------
-- Decisão do operador em 12/10/2026: febre, náusea >= 7, diarreia >= 7, apetite <= 2,
-- hidratação = 0, suplemento = 'nao'. Valores nulos nunca disparam. A Kelly confirma depois.
create or replace function public.alerta_oncologico_checkin(m public.monitoramento_oncologico)
returns boolean
language sql
immutable
as $$
  select coalesce(m.febre, false)
      or coalesce(m.nausea >= 7, false)
      or coalesce(m.diarreia >= 7, false)
      or coalesce(m.apetite <= 2, false)
      or coalesce(m.hidratacao = 0, false)
      or coalesce(m.suplemento = 'nao', false);
$$;

-- 3) Check-in diário (monitoramento_oncologico) ------------------------------------------------
-- Só conta check-in COMPLETO (apetite preenchido). O humor do Início grava só 'disposicao' e não avisa.
-- Primeira gravação completa do dia: alerta -> 'alerta_oncologico'; senão -> 'checkin_diario'.
-- Edição posterior que passa a ter alerta: acrescenta 'alerta_oncologico' (uma vez por linha).
create or replace function public.trg_aviso_checkin_diario()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nutri uuid;
  v_alerta boolean;
  v_alerta_antes boolean := false;
  v_completo_antes boolean := false;
begin
  begin
    v_nutri := coalesce(new.nutri_id, (select p.nutri_id from public.pacientes p where p.id = new.paciente_id));
    if v_nutri is null or new.apetite is null then
      return new;
    end if;
    v_alerta := public.alerta_oncologico_checkin(new);
    if tg_op = 'UPDATE' then
      v_completo_antes := old.apetite is not null;
      v_alerta_antes := public.alerta_oncologico_checkin(old);
    end if;

    if not v_completo_antes then
      insert into public.avisos_nutri (nutri_id, paciente_id, tipo, ref_id, criado_em)
      values (v_nutri, new.paciente_id,
              case when v_alerta then 'alerta_oncologico' else 'checkin_diario' end,
              new.id, now())
      on conflict (tipo, ref_id) do nothing;
    elsif v_alerta and not v_alerta_antes then
      insert into public.avisos_nutri (nutri_id, paciente_id, tipo, ref_id, criado_em)
      values (v_nutri, new.paciente_id, 'alerta_oncologico', new.id, now())
      on conflict (tipo, ref_id) do nothing;
    end if;
  exception when others then
    raise warning 'aviso de check-in diario nao gravado: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists aviso_checkin_diario on public.monitoramento_oncologico;
create trigger aviso_checkin_diario
  after insert or update on public.monitoramento_oncologico
  for each row execute function public.trg_aviso_checkin_diario();

-- 4) Formulário da tela "Check-ins" respondido -------------------------------------------------
-- O push desse caso já sai do app (avisarNutri); por isso o aviso nasce com push_enviado_em preenchido.
create or replace function public.trg_aviso_checkin_respondido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.respondido_em is null and new.respondido_em is not null then
    begin
      insert into public.avisos_nutri (nutri_id, paciente_id, tipo, ref_id, criado_em, push_enviado_em)
      values (new.nutri_id, new.paciente_id, 'checkin_respondido', new.id, new.respondido_em, now())
      on conflict (tipo, ref_id) do nothing;
    exception when others then
      raise warning 'aviso de checkin respondido nao gravado: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists aviso_checkin_respondido on public.checkin_envios;
create trigger aviso_checkin_respondido
  after update of respondido_em on public.checkin_envios
  for each row execute function public.trg_aviso_checkin_respondido();

-- 5) Marcar como visto: aceitar os tipos novos ---------------------------------------------------
create or replace function public.marcar_avisos_tipo_vistos(p_tipo text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  if p_tipo is null or p_tipo not in ('contrato_assinado', 'foto_prato', 'checkin_diario', 'alerta_oncologico', 'checkin_respondido') then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;
  update public.avisos_nutri a
     set visto_em = now()
   where a.nutri_id = auth.uid()
     and a.visto_em is null
     and a.tipo = p_tipo;
  get diagnostics n = row_count;
  return n;
end;
$$;
-- marcar_avisos_vistos(p_ids) não muda (p_ids nulo continua marcando tudo, menos foto_prato).

-- 6) Reserva atômica dos avisos que precisam de push (usada só pela função agendada do Netlify) -----
create or replace function public.reservar_avisos_para_push(p_limite integer default 50)
returns table (aviso_id uuid, aviso_nutri_id uuid, aviso_paciente_id uuid, aviso_tipo text, paciente_nome text, aviso_criado_em timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with pegos as (
    select a0.id
      from public.avisos_nutri a0
     where a0.push_enviado_em is null
       and a0.tipo in ('checkin_diario', 'alerta_oncologico')
       and a0.criado_em > now() - interval '2 days'
     order by a0.criado_em
     limit greatest(1, least(coalesce(p_limite, 50), 200))
       for update skip locked
  ), marcados as (
    update public.avisos_nutri a
       set push_enviado_em = now()
      from pegos
     where a.id = pegos.id
    returning a.id, a.nutri_id, a.paciente_id, a.tipo, a.criado_em
  )
  select m.id, m.nutri_id, m.paciente_id, m.tipo,
         (select p.nome from public.pacientes p where p.id = m.paciente_id),
         m.criado_em
    from marcados m
   order by m.criado_em;
end;
$$;
revoke all on function public.reservar_avisos_para_push(integer) from public, anon, authenticated;
grant execute on function public.reservar_avisos_para_push(integer) to service_role;
