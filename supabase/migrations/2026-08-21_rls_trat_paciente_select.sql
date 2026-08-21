-- 2026-08-21: a paciente passa a ler o próprio tratamento oncológico.
--
-- BUG: tratamentos_oncologicos tinha uma policy só — trat_onco_nutri
-- (for all, nutri_id = auth.uid()). Nenhuma de select para a paciente. Sob
-- RLS, toda consulta da paciente a essa tabela voltava vazia EM SILÊNCIO:
-- PostgREST devolve zero linhas, não erro, então nenhuma tela reclamou.
--
-- Confirmado por simulação de RLS (set role authenticated + request.jwt.claims)
-- com o cadastro do Antônio Luiz: protocolo 'Flox' existe na tabela, e pela
-- sessão dele o registro inteiro voltava null.
--
-- Consequência em duas telas da paciente, as duas silenciosas:
--
--   • paciente/Inicio.jsx — faseDoDia sempre recebia protocolo null e caía no
--     MARCOS_FALLBACK (+3/+7/+10/+14), nunca nos marcos do protocolo real. O
--     grupo da mensagem motivacional saía do fallback para todo mundo.
--
--   • paciente/MonitoramentoOncologico.jsx — a linha do tempo do ciclo usava
--     os mesmos marcos genéricos e o intervalo caía no `?? 21`. Este é o mais
--     antigo dos dois: vale desde que a tela existe, muito antes da mensagem
--     por grupo de ciclo.
--
-- exames_laboratoriais foi conferido no banco e JÁ TEM a policy de paciente,
-- apesar de o setup.sql não registrar isso. Só faltava esta.
--
-- Espelha ciclos_paciente_select, a policy irmã em ciclos_quimio, cujo `qual`
-- foi conferido em pg_policies e é exatamente este. Os dois ramos cobrem as
-- duas gerações de cadastro: `paciente_id = auth.uid()` é o legado, de quando
-- pacientes.id era o próprio id de auth; minha_paciente_id() resolve pelo
-- user_id, para quem a nutri cadastrou e que ativou depois por token — o caso
-- em que pacientes.id ≠ auth.uid() (ver 2026-06-05d_fix_rls_minha_paciente).
--
-- Só SELECT. Quem escreve tratamento é a nutri, e isso continua exclusivo da
-- trat_onco_nutri, que este arquivo não toca.
--
-- Idempotente: drop if exists + create. Reverter é dropar a policy — e voltar
-- ao comportamento silencioso descrito acima.
--
-- RODAR SEM begin/commit no SQL Editor do Supabase (Ctrl+A antes do Run).

drop policy if exists trat_paciente_select on public.tratamentos_oncologicos;
create policy trat_paciente_select on public.tratamentos_oncologicos
  for select
  using (
    paciente_id = auth.uid()
    or paciente_id = public.minha_paciente_id()
  );

-- Conferência, em Run separado. Devem voltar duas linhas: trat_onco_nutri
-- (ALL) e trat_paciente_select (SELECT).
--
-- O pg_policies mostra `minha_paciente_id()` SEM o `public.` que está escrito
-- acima — ele imprime o corpo já resolvido pelo search_path. As duas formas
-- são equivalentes; a qualificada é a que se quer num arquivo de reconstrução.
--
--   select policyname, cmd, qual
--   from pg_policies
--   where schemaname = 'public' and tablename = 'tratamentos_oncologicos'
--   order by policyname;
