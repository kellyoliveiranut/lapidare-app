-- APAGA os valores gravados nessas colunas.
alter table public.pacientes drop constraint if exists pacientes_nf_cpf_chk;
alter table public.pacientes drop column if exists nf_cpf;
alter table public.pacientes drop column if exists nf_nome;
alter table public.pacientes drop column if exists nf_outra_pessoa;
alter table public.pacientes drop column if exists nf_emitir;
alter table public.vendas    drop column if exists nf_lembrar;
