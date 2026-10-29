-- Registra a assinatura de push de um aparelho na conta de quem está logado,
-- mesmo que o mesmo aparelho (endpoint) já estivesse gravado para OUTRA conta.
--
-- Problema: push_subscriptions tem UNIQUE(endpoint) e a policy push_subs_all
-- (user_id = auth.uid()). Quem entra num aparelho que já foi usado por outra
-- conta (nutri testando no celular da paciente, duas pacientes no mesmo
-- navegador…) faz upsert no endpoint existente e o RLS barra: "new row violates
-- row-level security policy". O aparelho fica sem receber avisos.
--
-- Solução: função security definer que move a assinatura para auth.uid().
-- Só mexe na linha desse endpoint e só para o próprio usuário logado; a policy
-- da tabela continua igual. Retorna true se gravou.
--
-- Idempotente. Ctrl+A antes do Run.
create or replace function public.registrar_push_aparelho(
  p_endpoint text,
  p_subscription jsonb,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if p_endpoint is null or length(p_endpoint) = 0 then
    raise exception 'Endpoint vazio.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, subscription, user_agent)
  values (auth.uid(), p_endpoint, p_subscription, p_user_agent)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        subscription = excluded.subscription,
        user_agent = excluded.user_agent;
  return true;
end;
$function$;

revoke all on function public.registrar_push_aparelho(text, jsonb, text) from public, anon;
grant execute on function public.registrar_push_aparelho(text, jsonb, text) to authenticated;
