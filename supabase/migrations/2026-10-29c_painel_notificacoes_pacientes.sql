-- Painel "Notificações das pacientes" (Visão geral da nutri).
-- push_subscriptions só deixa cada conta ler as próprias linhas (policy
-- push_subs_all), então a nutri não consegue saber quais pacientes têm
-- notificação ativa. Esta função devolve, só para as pacientes de quem chama
-- (pacientes.nutri_id = auth.uid()), os campos do painel e se existe ao menos
-- uma assinatura de push da paciente. Não expõe endpoint nem chaves.
--
-- Idempotente. Ctrl+A antes do Run.
create or replace function public.painel_notificacoes_pacientes()
returns table (
  id uuid,
  nome text,
  telefone text,
  tipo_plano text,
  ultimo_acesso timestamptz,
  volta_app_enviado_em timestamptz,
  volta_app_envios smallint,
  tem_push boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.nome, p.telefone, p.tipo_plano, p.ultimo_acesso,
         p.volta_app_enviado_em, p.volta_app_envios,
         exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id) as tem_push
  from public.pacientes p
  where p.nutri_id = auth.uid()
    and p.status_paciente = 'ativo'
    and p.user_id is not null
    and coalesce(p.acesso_pausado, false) = false;
$function$;

revoke all on function public.painel_notificacoes_pacientes() from public, anon;
grant execute on function public.painel_notificacoes_pacientes() to authenticated;
