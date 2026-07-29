-- =============================================================
-- Migration 2026-07-29
-- confirmar_consulta — a PACIENTE confirma a presença pelo app
-- =============================================================
-- Etapa 2 da confirmação. A etapa 1 (2026-07-23_confirmacao_consulta.sql)
-- criou confirmada_em / confirmada_por e a marcação manual da nutri; esta
-- abre o caminho da paciente.
--
-- A paciente NÃO ganha UPDATE em public.consultas. RLS no PostgREST não
-- restringe coluna: com UPDATE na tabela ela poderia mandar data_hora,
-- status, meet_link no mesmo payload. O acesso vem por esta função
-- security definer, que passa a ser o único caminho de escrita dela na
-- tabela.
--
-- Não há DDL aqui: só a função, o revoke e o grant. As colunas já existem.
--
-- O trigger consultas_limpa_confirmacao_tg é `before update OF data_hora`
-- — como o SET abaixo não toca data_hora, ele nem chega a disparar. E o
-- caminho inverso segue valendo: quando a nutri reagenda, o trigger limpa
-- a confirmação, inclusive uma feita pela paciente. É o certo, ela
-- confirmou outro horário.
-- =============================================================

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
  -- regra do podeConfirmar() da Agenda (Agenda.jsx:69). O SET tem só as
  -- duas colunas, com valores calculados no servidor: data_hora, status e
  -- o resto ficam fora de alcance.
  update public.consultas c
     set confirmada_em  = now(),
         confirmada_por = 'paciente'
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

-- Sem anon e sem public: só usuária logada. O Postgres concede execute a
-- `public` por padrão em função nova, então o revoke tem que vir antes do
-- grant. Mesmo cuidado do drop da buscar_email_por_telefone (c065b39).
revoke all on function public.confirmar_consulta(uuid) from public, anon;
grant execute on function public.confirmar_consulta(uuid) to authenticated;


-- =============================================================
-- Conferência
--   select proname, prosecdef, proconfig
--     from pg_proc where proname = 'confirmar_consulta';
--   -- prosecdef = true, proconfig = {search_path=public}
--
--   select grantee, privilege_type
--     from information_schema.routine_privileges
--    where routine_name = 'confirmar_consulta';
--   -- só authenticated (além do owner)
--
-- Aplicada no Supabase em 2026-07-29.
-- =============================================================
