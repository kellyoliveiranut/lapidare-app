-- =============================================================
-- Migration 2026-10-27c
-- consultas — a PACIENTE avisa pelo app que NÃO IRÁ à consulta
-- =============================================================
-- Reaproveita o terceiro estado que já existe (2026-08-24): nao_confirmada_em.
-- Até aqui só a nutri marcava esse estado ("não confirmou / provavelmente não
-- vem"). Agora a paciente também pode, com o botão "Não irei" do lembrete.
-- Para a nutri saber a diferença entre o palpite dela e a palavra da paciente,
-- entra a coluna nao_confirmada_por ('nutri' | 'paciente').
--
-- "Não irei" NÃO cancela a consulta: o status segue 'agendada' e a nutri decide
-- (remarcar, cancelar, conversar). Só o aviso chega nela.
--
-- A paciente continua SEM UPDATE em consultas. O caminho é a função abaixo,
-- security definer, no molde de confirmar_consulta (2026-07-29): o SET tem só as
-- colunas de presença, com valores calculados no servidor.
--
-- confirmar_consulta (2026-08-24) NÃO precisa mudar: ela já zera
-- nao_confirmada_em ao confirmar, e o trigger novo zera nao_confirmada_por junto.
--
-- SEM begin/commit DE PROPÓSITO (pooler do SQL Editor pode dar rollback
-- silencioso). Rode tudo de uma vez, Ctrl+A antes do Run.
-- Idempotente. Desfazer: supabase/desfazer/2026-10-27c_consulta_ausencia_paciente_DESFAZER.sql
-- =============================================================

-- 1. COLUNA ------------------------------------------------------------
alter table public.consultas
  add column if not exists nao_confirmada_por text;

alter table public.consultas
  drop constraint if exists consultas_nao_confirmada_por_chk;
alter table public.consultas
  add constraint consultas_nao_confirmada_por_chk
  check (nao_confirmada_por is null or nao_confirmada_por in ('nutri', 'paciente'));

comment on column public.consultas.nao_confirmada_por is
  'Quem registrou o "não confirmou / não irá": nutri ou paciente. NULL nas marcações antigas (tratadas como da nutri) e quando nao_confirmada_em é NULL. Mantida pelo trigger consultas_nao_confirmada_origem.';


-- 2. TRIGGER — mantém a origem coerente --------------------------------
-- Roda em QUALQUER update (não só `of nao_confirmada_em`): o reagendamento zera
-- nao_confirmada_em dentro de outro trigger, e `update of` só olha o SET original.
-- O nome começa com "consultas_n", depois de "consultas_l" (limpa_ao_reagendar):
-- triggers do mesmo evento rodam em ordem alfabética, então este vê o valor já zerado.
create or replace function public.consultas_nao_confirmada_origem()
returns trigger
language plpgsql
as $$
begin
  if new.nao_confirmada_em is null then
    new.nao_confirmada_por := null;
  elsif new.nao_confirmada_em is distinct from old.nao_confirmada_em
        and new.nao_confirmada_por is not distinct from old.nao_confirmada_por then
    -- marcou sem dizer quem (é o que a Agenda da nutri faz): foi a nutri
    new.nao_confirmada_por := 'nutri';
  end if;
  return new;
end;
$$;

drop trigger if exists consultas_nao_confirmada_origem_tg on public.consultas;
create trigger consultas_nao_confirmada_origem_tg
  before update on public.consultas
  for each row execute function public.consultas_nao_confirmada_origem();


-- 3. RPC DA PACIENTE ---------------------------------------------------
create or replace function public.avisar_ausencia_consulta(p_consulta_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente_id uuid;
  v_aviso       timestamptz;
begin
  -- Quem sou eu: mesmas duas formas de vínculo de confirmar_consulta.
  select p.id into v_paciente_id
  from public.pacientes p
  where p.user_id = auth.uid() or p.id = auth.uid()
  limit 1;

  if v_paciente_id is null then
    raise exception 'Paciente não encontrada para o usuário atual'
      using errcode = '42501';
  end if;

  -- Só a própria consulta, futura, agendada e com data marcada. A palavra da
  -- paciente vence o palpite da nutri: se a nutri tinha marcado "não confirmou",
  -- passa a constar como aviso da paciente. A confirmação anterior (se houver) é
  -- desfeita no mesmo UPDATE, por causa da constraint consultas_confirmacao_exclusiva.
  update public.consultas c
     set nao_confirmada_em  = now(),
         nao_confirmada_por = 'paciente',
         confirmada_em      = null,
         confirmada_por     = null
   where c.id           = p_consulta_id
     and c.paciente_id  = v_paciente_id
     and c.status       = 'agendada'
     and c.data_hora is not null
     and c.data_hora   >= now()
     and (c.nao_confirmada_em is null or c.nao_confirmada_por is distinct from 'paciente')
  returning c.nao_confirmada_em into v_aviso;

  if v_aviso is null then
    -- Não é dela, não está disponível, ou ela JÁ tinha avisado (clique repetido
    -- é inofensivo: devolve o carimbo atual).
    select c.nao_confirmada_em into v_aviso
    from public.consultas c
    where c.id = p_consulta_id and c.paciente_id = v_paciente_id
      and c.nao_confirmada_por = 'paciente';

    if v_aviso is null then
      raise exception 'Consulta não encontrada ou não pode receber este aviso'
        using errcode = '42501';
    end if;
  end if;

  return v_aviso;
end;
$$;

revoke all on function public.avisar_ausencia_consulta(uuid) from public, anon;
grant execute on function public.avisar_ausencia_consulta(uuid) to authenticated;


-- =============================================================
-- Conferência (rode depois do Run)
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='consultas' and column_name='nao_confirmada_por';
--   select proname, prosecdef from pg_proc where proname='avisar_ausencia_consulta';  -- prosecdef = t
--   select grantee from information_schema.routine_privileges
--    where routine_name='avisar_ausencia_consulta';                                    -- só authenticated (+ owner)
--   select tgname from pg_trigger where tgrelid='public.consultas'::regclass and not tgisinternal;
-- =============================================================
