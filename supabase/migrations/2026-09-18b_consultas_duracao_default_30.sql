-- Duração padrão da consulta: 45 -> 30 minutos.
--
-- Fecha o último lugar que ainda dizia 45. O código já estava todo em 30 desde
-- cdf1649 (2026-09-01), que acertou seis lugares de uma vez — os dois modais do
-- perfil (que usavam 50), o formulário da Agenda (45), o gerarGoogleCalendarUrl
-- e a DURACAO_CONSULTA_MIN da Previsibilidade. A coluna do banco não entrou
-- naquele commit e ficou para trás.
--
-- EFEITO PRÁTICO PEQUENO, de propósito: os três insert em consultas do app
-- (Agenda.jsx:2771 e PacientePerfil.jsx:6667 e :6827) sempre mandam duracao_min
-- explícito. Este default só decide em insert feito direto no SQL Editor.
--
-- NÃO mexe em linha existente: alterar default não reescreve dado gravado. A
-- distribuição de hoje (50min=399, 45min=49, 30min=79) é histórico real, não
-- sintoma — os 399 vieram do gerador de 6 consultas em lote, que nascia com
-- useState(50) até 2026-09-01, e cada uso criava 6 linhas. Backfill foi
-- descartado de propósito: aquelas consultas foram mesmo agendadas com aquelas
-- durações, e reescrever mudaria o histórico da agenda.

alter table public.consultas alter column duracao_min set default 30;

-- Conferência (rodar depois, separado):
--   select column_name, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'consultas'
--      and column_name = 'duracao_min';
--   -- esperado: duracao_min / 30
