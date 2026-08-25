-- =============================================================
-- Migration 2026-08-24
-- consultas — terceiro estado de presença: "não confirmou"
-- =============================================================
-- Até aqui a presença era binária: confirmada_em nulo ou com carimbo. O nulo
-- carregava dois significados incompatíveis — "ainda não respondeu" e "disse
-- que não vem". Esta migration separa os dois.
--
-- POR QUE COLUNA NOVA E NÃO UM VALOR EM status: status responde "o que
-- aconteceu com o compromisso" (agendada/realizada/cancelada). A confirmação
-- responde "o que a paciente disse sobre ele". São eixos independentes — uma
-- consulta agendada pode estar confirmada, não confirmada ou sem resposta, e
-- segue agendada nos três casos. Encaixar em status obrigaria a escolher entre
-- perder o agendamento e inventar combinações.
--
-- POR QUE NÃO REAPROVEITAR confirmada_por: confirmada_em não-nulo é lido como
-- "confirmada" em cinco pontos do Agenda.jsx e no realtime. Um
-- confirmada_por = 'nutri_negou' com carimbo em confirmada_em pintaria a linha
-- de verde em todos eles.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled
-- e uma transação explícita pode terminar em rollback SILENCIOSO — o editor
-- reporta sucesso e nada é aplicado. Rode tudo de uma vez, Ctrl+A antes do Run
-- (o editor executa só o texto selecionado quando há seleção).
--
-- Idempotente: add column if not exists, drop+add constraint, create or
-- replace function.
-- =============================================================


-- 1. COLUNA ------------------------------------------------------------
alter table public.consultas
  add column if not exists nao_confirmada_em timestamptz;

comment on column public.consultas.nao_confirmada_em is
  'Quando a nutri marcou que a paciente nao confirmou / provavelmente nao vem.
   Exclusivo com confirmada_em; ambos nulos = ainda sem resposta. Zerado ao
   reagendar, pela mesma regra da confirmacao.';

-- Os dois estados nao podem coexistir: seria "confirmou e nao confirmou".
-- Nao ha linha existente com a coluna preenchida, entao a constraint valida
-- sem backfill.
alter table public.consultas
  drop constraint if exists consultas_confirmacao_exclusiva;
alter table public.consultas
  add constraint consultas_confirmacao_exclusiva
  check (confirmada_em is null or nao_confirmada_em is null);


-- 2. TRIGGER — quarto bloco de limpeza ---------------------------------
-- O corpo dos tres primeiros blocos e identico ao de 2026-08-19; so o quarto
-- e novo. `create or replace function`: o trigger consultas_limpa_ao_reagendar_tg
-- continua apontando para esta funcao e NAO precisa ser recriado — por isso
-- aqui nao ha drop/create de trigger, e nao existe a janela sem cobertura que
-- a migration de 2026-08-19 teve que aceitar.
create or replace function public.consultas_limpa_ao_reagendar()
returns trigger
language plpgsql
as $$
begin
  -- Guard comum aos quatro blocos: `update of data_hora` dispara sempre que a
  -- coluna aparece no SET (o payload do modal manda data_hora toda vez, mesmo
  -- salvando so a obs), entao o `is distinct from` e quem separa "reagendou"
  -- de "salvou sem mexer na data".

  -- Confirmação: a paciente confirmou OUTRO horário.
  if new.data_hora is distinct from old.data_hora
     and new.confirmada_em is not distinct from old.confirmada_em then
    new.confirmada_em  := null;
    new.confirmada_por := null;
  end if;

  -- Lembrete manual: é o mesmo que desfazerEnvio() faz à mão em Agenda.jsx,
  -- só que sem depender de a nutri lembrar de clicar.
  if new.data_hora is distinct from old.data_hora
     and new.lembrete_enviado is not distinct from old.lembrete_enviado then
    new.lembrete_enviado    := false;
    new.lembrete_enviado_em := null;
  end if;

  -- Push automático: guard próprio porque é outro mecanismo, marcado pela
  -- função agendada e não pela nutri.
  if new.data_hora is distinct from old.data_hora
     and new.push_lembrete_enviado_em is not distinct from old.push_lembrete_enviado_em then
    new.push_lembrete_enviado_em := null;
  end if;

  -- Não-confirmação: o "não vem" era sobre o horário velho. Guard próprio,
  -- pelo mesmo motivo dos outros três — "remarcar e já marcar que não vem na
  -- mesma tacada" continua funcionando.
  if new.data_hora is distinct from old.data_hora
     and new.nao_confirmada_em is not distinct from old.nao_confirmada_em then
    new.nao_confirmada_em := null;
  end if;

  return new;
end;
$$;


-- 3. RPC DA PACIENTE ---------------------------------------------------
-- SEM ESTA PARTE A FEATURE QUEBRA PARA A PACIENTE: a funcao de 2026-07-29 tem
-- um SET de duas colunas, e a constraint de exclusividade acima faria esse
-- UPDATE estourar sempre que a nutri tivesse marcado "nao confirmou". A
-- paciente clicaria em confirmar no app e levaria erro de constraint na cara.
--
-- A REGRA: a palavra da paciente vence o palpite da nutri. Ela confirmando,
-- o "nao vem" que a nutri havia marcado e apagado no mesmo UPDATE.
--
-- Corpo identico ao de 2026-07-29, com UMA alteracao: a terceira coluna no
-- SET. O `confirmada_em is null` do where fica — e continua sendo o que torna
-- o clique repetido inofensivo.
create or replace function public.confirmar_consulta(p_consulta_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente_id uuid;
  v_confirmada  timestamptz;
begin
  -- Quem sou eu. Cobre as duas formas de vínculo que a base tem:
  --   user_id = auth.uid() → cadastro normal, e manual depois de vinculado
  --   id      = auth.uid() → pacientes antigas, anteriores à coluna user_id
  select p.id into v_paciente_id
  from public.pacientes p
  where p.user_id = auth.uid() or p.id = auth.uid()
  limit 1;

  if v_paciente_id is null then
    raise exception 'Paciente não encontrada para o usuário atual'
      using errcode = '42501';
  end if;

  -- Só a própria consulta, futura, agendada e com data marcada — a mesma
  -- regra do podeConfirmar() da Agenda. O SET tem só as TRÊS colunas de
  -- confirmação, com valores calculados no servidor: data_hora, status e o
  -- resto ficam fora de alcance.
  update public.consultas c
     set confirmada_em     = now(),
         confirmada_por    = 'paciente',
         nao_confirmada_em = null
   where c.id           = p_consulta_id
     and c.paciente_id  = v_paciente_id
     and c.status       = 'agendada'
     and c.data_hora is not null
     and c.data_hora   >= now()
     and c.confirmada_em is null     -- não reescreve carimbo já existente
  returning c.confirmada_em into v_confirmada;

  if v_confirmada is null then
    -- Chegou aqui por um de três motivos: não é dela, não está
    -- confirmável, ou já estava confirmada. Só o último é benigno —
    -- devolve o carimbo atual e deixa o clique repetido ser inofensivo.
    select c.confirmada_em into v_confirmada
    from public.consultas c
    where c.id = p_consulta_id and c.paciente_id = v_paciente_id;

    if v_confirmada is null then
      raise exception 'Consulta não encontrada ou não pode ser confirmada'
        using errcode = '42501';
    end if;
  end if;

  return v_confirmada;
end;
$$;

-- O SET nao toca data_hora, entao o trigger `before update of data_hora` nem
-- chega a disparar aqui. Os grants de 2026-07-29 sobrevivem ao create or
-- replace (a funcao e a mesma, mesma assinatura), mas repetir e barato e
-- protege um banco recriado do zero fora de ordem.
revoke all on function public.confirmar_consulta(uuid) from public, anon;
grant execute on function public.confirmar_consulta(uuid) to authenticated;


-- =============================================================
-- Conferência (rode depois do Run)
--
--   -- a coluna existe?
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='consultas'
--      and column_name = 'nao_confirmada_em';
--
--   -- a constraint de exclusividade entrou?
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.consultas'::regclass
--      and conname='consultas_confirmacao_exclusiva';
--
--   -- as duas funcoes conhecem a coluna nova? (esperado: t e t)
--   select proname, prosrc like '%nao_confirmada_em%' as tem_coluna_nova
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public'
--      and proname in ('consultas_limpa_ao_reagendar','confirmar_consulta')
--    order by proname;
--
--   -- o trigger continua unico e apontando para a funcao certa?
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid='public.consultas'::regclass and not tgisinternal;
--
--   -- nenhuma linha viola a exclusividade (esperado: 0)
--   select count(*) from public.consultas
--    where confirmada_em is not null and nao_confirmada_em is not null;
--
--   -- a RPC segue definer e so para authenticated?
--   select prosecdef, proconfig from pg_proc where proname='confirmar_consulta';
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_name='confirmar_consulta';
-- =============================================================
