-- =============================================================
-- Migration 2026-08-28b
-- locais_atendimento — a paciente passa a ler o local da consulta dela
-- =============================================================
-- O card de consulta no app da paciente (src/app/paciente/Inicio.jsx) nunca
-- mostrou onde a consulta presencial acontece. A causa tem duas metades, e
-- esta migration é a primeira: sem ela, o código sozinho não resolve.
--
-- METADE 1 (aqui): locais_atendimento tinha UMA policy só, criada em
-- 2026-08-08_locais_atendimento.sql:
--
--     create policy locais_atendimento_nutri ... for all
--       using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());
--
-- A paciente nunca é a nutri, então ela não lê nada dessa tabela. E o modo de
-- falha é SILENCIOSO: um join barrado por RLS não devolve erro no PostgREST —
-- devolve o objeto aninhado como null. O card mostraria "local não informado"
-- sem nenhum sinal de que o problema é permissão.
--
-- METADE 2 (código, commit à parte): os dois selects de consulta em Inicio.jsx
-- não pediam modalidade, local_id nem o join com locais_atendimento.
--
-- ORDEM IMPORTA: rode esta migration ANTES de o código subir. Na ordem
-- invertida o join volta null e o card exibe exatamente o mesmo sintoma de
-- hoje, agora parecendo que a correção falhou.
--
-- ESCOPO DA POLICY: só os locais que aparecem em consulta DELA. A lista de
-- locais da nutri não é dado da paciente, e não há por que expor os outros.
--
-- POR QUE OS DOIS RAMOS DE paciente_id: é o predicado canônico da paciente
-- neste banco, copiado de consultas_select (setup.sql). Existem duas gerações
-- de vínculo — o id da ficha igual ao auth.uid(), e o vínculo via
-- minha_paciente_id(). Usar só auth.uid() funcionaria para uma parte das
-- pacientes e falharia CALADA para a outra.
--
-- POLICY ADITIVA, não substitui nada: policies permissivas se somam com OR.
-- Para SELECT, a nutri continua coberta pela policy antiga (for all inclui
-- select) e a paciente passa a ser coberta por esta. Nenhum drop da antiga.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled
-- e uma transação explícita pode terminar em rollback SILENCIOSO. Rode tudo de
-- uma vez (Ctrl+A antes do Run).
-- =============================================================

drop policy if exists locais_atendimento_paciente on public.locais_atendimento;

create policy locais_atendimento_paciente on public.locais_atendimento
  for select
  using (
    exists (
      select 1
        from public.consultas c
       where c.local_id = locais_atendimento.id
         and (c.paciente_id = auth.uid()
              or c.paciente_id = public.minha_paciente_id())
    )
  );

-- =============================================================
-- Conferência
--   -- devem aparecer DUAS policies: a _nutri (ALL) e a _paciente (SELECT)
--   select policyname, cmd, qual
--     from pg_policies
--    where schemaname='public' and tablename='locais_atendimento'
--    order by policyname;
--
--   -- RLS continua ligado
--   select relrowsecurity from pg_class
--    where oid='public.locais_atendimento'::regclass;
--
--   -- quantas consultas presenciais têm local preenchido (o que a paciente
--   -- vai passar a enxergar)
--   select count(*) filter (where local_id is not null) as com_local,
--          count(*)                                     as presenciais
--     from public.consultas
--    where modalidade = 'presencial';
--
-- TESTE REAL (o único que prova): entrar no app COMO PACIENTE que tenha
-- consulta presencial com local, e ver o nome e o endereço no card. A
-- conferência acima mostra que a policy existe, não que ela devolve linha.
-- =============================================================
