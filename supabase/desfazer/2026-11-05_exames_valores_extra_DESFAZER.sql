-- Remove a coluna dos parâmetros extras do hemograma (APAGA os valores gravados nela).
alter table public.exames_laboratoriais drop column if exists valores_extra;
