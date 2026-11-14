-- =============================================================
-- SECRETARIA — PASSO 2: SIMULAÇÃO (só lê, não altera NADA)
-- =============================================================
-- Rode DEPOIS do passo 1. Mostra, regra por regra, o que o passo 3 mudaria:
--   REESCREVER  = regra de dono (nutri_id = auth.uid()) que passa a aceitar a secretária
--   REVISAR     = ainda usa auth.uid() e NÃO será mexida (confira se é só da paciente)
--   FUNCAO      = função do banco que usa auth.uid() (não é mexida; confira)
-- Mande o resultado (print ou CSV) antes de rodar o passo 3.
-- =============================================================
with regras as (
  select schemaname, tablename, policyname, cmd, qual, with_check,
    case when tablename = 'nutris' then
      regexp_replace(
        regexp_replace(coalesce(qual,''), '(^|[^_a-z])id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', '\1id = public.nutri_efetiva()', 'g'),
        'nutri_id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', 'nutri_id = public.nutri_efetiva()', 'g')
    else
      regexp_replace(coalesce(qual,''), 'nutri_id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', 'nutri_id = public.nutri_efetiva()', 'g')
    end as qual_novo,
    case when tablename = 'nutris' then
      regexp_replace(
        regexp_replace(coalesce(with_check,''), '(^|[^_a-z])id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', '\1id = public.nutri_efetiva()', 'g'),
        'nutri_id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', 'nutri_id = public.nutri_efetiva()', 'g')
    else
      regexp_replace(coalesce(with_check,''), 'nutri_id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))', 'nutri_id = public.nutri_efetiva()', 'g')
    end as check_novo
  from pg_policies
  where schemaname in ('public','storage')
    and tablename not in ('secretarias','chat_equipe')
)
select
  case when coalesce(qual,'') <> qual_novo or coalesce(with_check,'') <> check_novo then 'REESCREVER'
       else 'REVISAR' end as acao,
  schemaname||'.'||tablename as tabela, policyname as regra, cmd,
  qual as antes_using, qual_novo as depois_using,
  with_check as antes_check, check_novo as depois_check
from regras
where coalesce(qual,'') <> qual_novo or coalesce(with_check,'') <> check_novo
   or qual ilike '%auth.uid()%' or with_check ilike '%auth.uid()%'
union all
select 'FUNCAO', 'public.'||p.proname, '(security definer: '||p.prosecdef||')', '',
       null, null, null, null
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc ilike '%auth.uid()%'
  and p.proname <> 'nutri_efetiva'
order by 1, 2, 3;
