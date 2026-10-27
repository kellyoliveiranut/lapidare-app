-- Local que só começa a atender à tarde mais tarde que o resto: no endereço da
-- Almirante Wandenkolk o primeiro horário da tarde é 14:30. A regra mora na
-- linha do local (como dias_semana), não no código, e casa pelo ENDEREÇO só
-- aqui, uma vez — renomear o local depois não quebra nada.
-- Null = sem regra (grade normal). Idempotente. Ctrl+A antes do Run.
alter table public.locais_atendimento add column if not exists primeiro_horario_tarde text;
alter table public.locais_atendimento drop constraint if exists locais_primeiro_horario_tarde_chk;
alter table public.locais_atendimento add constraint locais_primeiro_horario_tarde_chk
  check (primeiro_horario_tarde is null or primeiro_horario_tarde ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

update public.locais_atendimento
   set primeiro_horario_tarde = '14:30'
 where endereco ilike '%wandenkolk%' and primeiro_horario_tarde is null;

-- Conferir: deve listar o local da Wandenkolk com 14:30.
select nome, endereco, primeiro_horario_tarde from public.locais_atendimento order by nome;
