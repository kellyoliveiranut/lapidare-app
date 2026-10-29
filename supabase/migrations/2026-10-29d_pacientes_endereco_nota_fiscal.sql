-- Endereço da paciente em campos separados, para emitir a nota fiscal.
-- Hoje só existe `pacientes.endereco`, um texto livre preenchido no cadastro e
-- sem tela para editar depois. A nota exige CEP, logradouro, número, bairro,
-- cidade e UF. O texto antigo NÃO é apagado nem convertido (não dá para
-- separá-lo com segurança): continua lá e a tela o mostra como referência.
--
-- Todas as colunas aceitam null (paciente antiga sem endereço). CEP guarda só
-- os 8 dígitos; UF guarda 2 letras maiúsculas. Idempotente. Ctrl+A antes do Run.
alter table public.pacientes add column if not exists end_cep         text;
alter table public.pacientes add column if not exists end_logradouro  text;
alter table public.pacientes add column if not exists end_numero      text;
alter table public.pacientes add column if not exists end_complemento text;
alter table public.pacientes add column if not exists end_bairro      text;
alter table public.pacientes add column if not exists end_cidade      text;
alter table public.pacientes add column if not exists end_uf          text;

alter table public.pacientes drop constraint if exists pacientes_end_cep_chk;
alter table public.pacientes add constraint pacientes_end_cep_chk
  check (end_cep is null or end_cep ~ '^[0-9]{8}$');

alter table public.pacientes drop constraint if exists pacientes_end_uf_chk;
alter table public.pacientes add constraint pacientes_end_uf_chk
  check (end_uf is null or end_uf ~ '^[A-Z]{2}$');

-- Conferir: deve listar as 7 colunas.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'pacientes' and column_name like 'end\_%'
 order by column_name;
