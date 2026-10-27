-- =============================================================
-- Migration 2026-10-27
-- Evolução da paciente: "ignorar nas contas" + recado da nutri
-- =============================================================
-- 1) peso_registros.ignorar_calculo
--    A nutri marca uma avaliação com valor suspeito (ex.: leitura errada do
--    Shaped). A avaliação continua guardada e visível no histórico da nutri,
--    mas deixa de entrar em gráficos, comparações e cálculos — na tela da nutri
--    e na da paciente. Hoje essa marcação só existe no navegador da nutri
--    (localStorage); com a coluna ela vale em qualquer aparelho.
--    Quem escreve: só a nutri dona (peso_all_nutri). A paciente só tem SELECT
--    em peso_registros, então não precisa de trigger de proteção.
--
-- 2) pacientes.recado_evolucao
--    Texto curto escrito pela nutri, mostrado no balão da evolução da paciente.
--    O CONTEÚDO É RESPONSABILIDADE DA NUTRICIONISTA (CFN 856): o app nunca
--    gera nem sugere esse texto. Vazio = nenhum recado aparece.
--    pacientes_update deixa a paciente dar UPDATE na própria linha, e RLS não
--    restringe coluna: sem guard ela reescreveria o próprio recado pela API.
--    O trigger abaixo (mesmo desenho de protege_acesso_pausado) só deixa a
--    nutri dona alterar a coluna. auth.uid() nulo (SQL Editor, service_role)
--    passa de propósito, para manutenção pelo painel.
--
-- Idempotente: add column if not exists / create or replace / drop+create.
-- Desfazer: supabase/desfazer/2026-10-27_evolucao_ignorar_e_recado_DESFAZER.sql
-- =============================================================

-- 1. COLUNAS ----------------------------------------------------------
alter table public.peso_registros
  add column if not exists ignorar_calculo boolean not null default false;

alter table public.pacientes
  add column if not exists recado_evolucao text;

alter table public.pacientes
  drop constraint if exists pacientes_recado_evolucao_tam_chk;
alter table public.pacientes
  add constraint pacientes_recado_evolucao_tam_chk
  check (recado_evolucao is null or char_length(recado_evolucao) <= 200);

comment on column public.peso_registros.ignorar_calculo is
  'Avaliação marcada pela nutri como suspeita: não entra em gráficos, comparações nem cálculos. O registro não é apagado.';
comment on column public.pacientes.recado_evolucao is
  'Recado curto (até 200 caracteres) escrito pela nutri para o balão da evolução da paciente. Texto da nutri; o app não gera conteúdo.';


-- 2. FUNÇÃO -----------------------------------------------------------
-- Invoker; mexe só em NEW/OLD. Texto em branco vira NULL.
create or replace function public.protege_recado_evolucao()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.nutri_id then
    raise exception 'Somente a nutricionista responsável pode alterar o recado da evolução.'
      using errcode = '42501';
  end if;
  new.recado_evolucao := nullif(btrim(new.recado_evolucao), '');
  return new;
end;
$function$;


-- 3. TRIGGER ----------------------------------------------------------
-- WHEN mantém os outros UPDATEs em pacientes (nome, objetivo, ultimo_acesso…)
-- fora do alcance do guard.
drop trigger if exists trg_protege_recado_evolucao on public.pacientes;
create trigger trg_protege_recado_evolucao
  before update on public.pacientes
  for each row
  when (old.recado_evolucao is distinct from new.recado_evolucao)
  execute function public.protege_recado_evolucao();
