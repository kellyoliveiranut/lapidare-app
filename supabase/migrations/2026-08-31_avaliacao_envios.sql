-- =============================================================
-- Migration 2026-08-31
-- avaliacao_envios — o link da avaliação física (Shaped) vira registro
-- =============================================================
-- O QUE ESTAVA ERRADO: o link do Shaped que a nutri envia existia SÓ dentro do
-- payload da notificação push, embutido na querystring
-- (/paciente/avaliacao?link=...). enviarLinkAvaliacao, no PacientePerfil.jsx,
-- fazia um único fetch para a function send-push e não gravava nada; a function
-- validava a URL contra a allowlist, mandava o push e também não gravava nada.
--
-- Consequência: notificação dispensada, deslizada ou perdida = link perdido de
-- vez, sem nenhum caminho de recuperação dentro do app — abrir
-- /paciente/avaliacao sem o parâmetro cai em "Link inválido ou expirado". E
-- pior: 60 das 93 pacientes não têm assinatura de push. Para elas o envio nunca
-- entregou nada, e a tela da nutri dizia "Ninguém recebeu".
--
-- Este era o único recurso do app em que o push ERA o dado. Os outros quatro
-- pushes de paciente (material, comentario_prato, plano, mensagem) são aviso
-- SOBRE algo que já está numa tabela. Esta migration põe o link na mesma
-- posição: o push vira aviso, e para de ser o portador.
--
-- MODELO: um pendente por paciente, que some quando ela preenche — mesmo padrão
-- de checkin_envios, que resolve a entrega inteira SEM push nenhum, só pela
-- linha que a tela inicial consulta.
--
-- ORDEM IMPORTA: rode esta migration ANTES de o código subir. Na ordem
-- invertida, a tela consulta uma tabela que não existe e a falha parece bug do
-- código novo. Mesmo cuidado de 2026-08-28b_locais_atendimento_paciente.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled e
-- uma transação explícita pode terminar em rollback SILENCIOSO. Ctrl+A antes do
-- Run.
--
-- Idempotente: create table/index if not exists, drop+create policy,
-- create or replace function.
-- =============================================================


-- 1. TABELA ------------------------------------------------------------

create table if not exists public.avaliacao_envios (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid not null references public.pacientes(id) on delete cascade,
  nutri_id       uuid not null references public.nutris(id)    on delete cascade,
  url            text not null,
  enviado_em     timestamptz not null default now(),
  preenchido_em  timestamptz,
  preenchido_por text,

  -- Segunda camada, atrás de normalizarUrlShaped (send-push.js e
  -- src/lib/shaped.js). Esta URL vira href na tela da paciente; o banco não
  -- deve ser capaz de guardar outra coisa, nem por bug nem por insert manual.
  -- O sufixo obrigatório [:/?#] ou fim de string é o que barra
  -- 'shaped.com.br.evil.com' — sem ele o prefixo casaria e o host seria outro.
  -- Se um dia a allowlist ganhar outro host, ESTE check também precisa mudar.
  constraint avaliacao_envios_url_shaped
    check (url ~* '^https://([a-z0-9-]+\.)*shaped\.com\.br([:/?#]|$)'),

  -- Os dois andam juntos: pendente não tem quem preencheu, e preenchido nunca
  -- fica sem essa informação. Separados, um bug deixaria passar linha fechada
  -- sem autoria, e a nutri perderia a distinção que é o motivo da coluna.
  constraint avaliacao_envios_preenchido_coerente
    check ((preenchido_em is null) = (preenchido_por is null)),

  -- Quem fechou. 'paciente' = ela tocou "Já preenchi" (autodeclarado, pode ser
  -- otimista). 'nutri' = o resultado do Shaped foi importado e virou linha em
  -- peso_registros. NÃO são a mesma coisa, e a nutri precisa saber qual dos
  -- dois aconteceu antes de contar a avaliação como feita.
  constraint avaliacao_envios_preenchido_por_valido
    check (preenchido_por is null or preenchido_por in ('paciente', 'nutri'))
);

-- UM pendente por paciente. É a decisão de produto: a tela inicial pergunta
-- "qual é o link dela?" e essa pergunta precisa ter uma resposta só. Reenviar
-- não cria linha nova — atualiza a pendente (on conflict ... do update, no
-- send-push.js). Fechadas podem ser várias, uma por avaliação ao longo do
-- acompanhamento. Mesmo molde de contratos_essentia_pendente_unq.
create unique index if not exists avaliacao_envios_pendente_unq
  on public.avaliacao_envios (paciente_id)
  where preenchido_em is null;

-- Histórico na tela da nutri.
create index if not exists avaliacao_envios_nutri_idx
  on public.avaliacao_envios (nutri_id, enviado_em desc);

comment on column public.avaliacao_envios.url is
  'Sempre a versao NORMALIZADA (u.href) que passou por normalizarUrlShaped no
   servidor, nunca a string crua digitada pela nutri.';

comment on column public.avaliacao_envios.preenchido_por is
  'paciente = autodeclarado pelo botao "Ja preenchi". nutri = resultado do
   Shaped importado. O primeiro nao prova que o resultado existe.';


-- 2. RLS ---------------------------------------------------------------

alter table public.avaliacao_envios enable row level security;

-- A nutri manda no que é dela: cria, lê, e fecha ao importar o resultado.
drop policy if exists avaliacao_envios_nutri on public.avaliacao_envios;
create policy avaliacao_envios_nutri on public.avaliacao_envios
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

-- Paciente: SELECT e só. Sem UPDATE de propósito — RLS no PostgREST não
-- restringe COLUNA, então UPDATE na tabela deixaria ela mandar `url`,
-- `preenchido_por` e `nutri_id` no mesmo payload. O "Já preenchi" dela passa
-- exclusivamente pelo RPC da seção 3. Mesmo raciocínio de
-- contratos_essentia_paciente_select e de confirmar_consulta.
--
-- Os dois ramos de paciente_id são o predicado canônico deste banco
-- (2026-08-21_rls_trat_paciente_select, 2026-08-28b_locais_atendimento_paciente):
-- `= auth.uid()` cobre o legado, de quando pacientes.id era o próprio id de
-- auth; minha_paciente_id() resolve pelo user_id, para quem a nutri cadastrou e
-- que ativou depois por token. Usar só um dos dois funcionaria para parte das
-- pacientes e falharia CALADA para a outra — PostgREST devolve zero linhas, não
-- erro.
drop policy if exists avaliacao_envios_paciente_select on public.avaliacao_envios;
create policy avaliacao_envios_paciente_select on public.avaliacao_envios
  for select using (
    paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
  );


-- 3. RPC: "Já preenchi" ------------------------------------------------
-- Fecha o pendente por declaração da paciente. Existe para cobrir a janela
-- entre ela preencher no Shaped e a nutri importar o PDF: sem isso o banner
-- ficaria de pé por dias sem motivo real.
--
-- SEM PARÂMETRO de propósito: o id do envio não é prova de nada, e receber um
-- abriria a porta para fechar o envio de outra paciente. A função descobre
-- sozinha de quem é a sessão e fecha o pendente DELA, se houver.
--
-- security definer porque precisa escrever numa tabela em que a paciente só tem
-- SELECT. Como definer ignora RLS, a autorização é explícita no corpo.
create or replace function public.marcar_avaliacao_preenchida()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente_id uuid;
  v_em          timestamptz;
begin
  -- 1) Quem sou eu. Vínculo duplo, igual ao aceitar_contrato_essentia: cobre a
  --    paciente antiga (pacientes.id = auth.uid()) e a cadastrada pela nutri
  --    (pacientes.user_id = auth.uid()).
  select p.id into v_paciente_id
  from public.pacientes p
  where p.user_id = auth.uid() or p.id = auth.uid()
  limit 1;

  if v_paciente_id is null then
    raise exception 'Paciente não encontrada para o usuário atual'
      using errcode = '42501';
  end if;

  -- 2) Fecha o pendente DELA. O `preenchido_em is null` no where é o que impede
  --    uma corrida de sobrescrever um fechamento já gravado — inclusive o da
  --    nutri, que vale mais que o autodeclarado.
  update public.avaliacao_envios a
     set preenchido_em  = now(),
         preenchido_por = 'paciente'
   where a.paciente_id = v_paciente_id
     and a.preenchido_em is null
  returning a.preenchido_em into v_em;

  if v_em is not null then
    return v_em;
  end if;

  -- 3) Não havia pendente. Toque repetido, ou a nutri já fechou pela
  --    importação: devolve o carimbo que existe em vez de erro. Mesmo
  --    comportamento inofensivo do aceitar_contrato_essentia.
  select a.preenchido_em into v_em
  from public.avaliacao_envios a
  where a.paciente_id = v_paciente_id
    and a.preenchido_em is not null
  order by a.preenchido_em desc
  limit 1;

  if v_em is null then
    raise exception 'Nenhuma avaliação pendente para marcar.'
      using errcode = 'P0001';
  end if;

  return v_em;
end;
$$;


-- 4. GRANTS ------------------------------------------------------------
-- O Postgres concede execute a `public` por padrão em função nova, então o
-- revoke vem ANTES do grant — mesmo cuidado de previa_contrato_essentia.
revoke all on function public.marcar_avaliacao_preenchida() from public, anon;
grant execute on function public.marcar_avaliacao_preenchida() to authenticated;


-- =============================================================
-- Conferência (rode DEPOIS do Run, em Run separado)
--
--   -- a tabela existe com RLS ligada?
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename = 'avaliacao_envios';
--   -- esperado: avaliacao_envios | t
--
--   -- duas policies: a da nutri (ALL) e a de select da paciente?
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'avaliacao_envios'
--    order by policyname;
--   -- pg_policies imprime minha_paciente_id() SEM o `public.`: mostra o corpo
--   -- ja resolvido pelo search_path. As duas formas sao equivalentes.
--
--   -- minha_paciente_id() existe mesmo? (nao esta versionada em migration
--   -- nenhuma deste repo — o banco nao e versionado)
--   select proname, prosecdef from pg_proc where proname = 'minha_paciente_id';
--
--   -- os tres checks e o indice parcial entraram?
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.avaliacao_envios'::regclass order by conname;
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename = 'avaliacao_envios'
--    order by indexname;
--
--   -- o RPC e definer e so authenticated executa?
--   select proname, prosecdef, proconfig from pg_proc
--    where proname = 'marcar_avaliacao_preenchida';
--   -- esperado: prosecdef = true, proconfig = {search_path=public}
--   select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--    where routine_name = 'marcar_avaliacao_preenchida';
--
--   -- o check da URL aceita e barra o que deve? (a linha inteira de uma vez)
--   select
--     'https://shaped.com.br/x'        ~* '^https://([a-z0-9-]+\.)*shaped\.com\.br([:/?#]|$)' as ok_true,
--     'https://app.shaped.com.br/x'    ~* '^https://([a-z0-9-]+\.)*shaped\.com\.br([:/?#]|$)' as sub_true,
--     'https://shaped.com.br.evil.com' ~* '^https://([a-z0-9-]+\.)*shaped\.com\.br([:/?#]|$)' as evil_false,
--     'http://shaped.com.br/x'         ~* '^https://([a-z0-9-]+\.)*shaped\.com\.br([:/?#]|$)' as http_false,
--     'https://user@evil.com/'         ~* '^https://([a-z0-9-]+\.)*shaped\.com\.br([:/?#]|$)' as userinfo_false;
--   -- esperado: t | t | f | f | f
-- =============================================================
