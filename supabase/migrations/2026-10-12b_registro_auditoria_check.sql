-- Exige quem conferiu e a fonte para qualquer linha confirmada. Aplicar só depois do deploy do código novo.
alter table public.tratamentos_oncologicos
  drop constraint if exists trat_onco_registro_conferencia_chk;
alter table public.tratamentos_oncologicos
  add constraint trat_onco_registro_conferencia_chk check (
    registro_pendente is distinct from false
    or (
      registro_confirmado_em is not null
      and char_length(btrim(coalesce(registro_confirmado_por, ''))) between 5 and 120
      and char_length(btrim(coalesce(registro_confirmado_fonte, ''))) between 5 and 300
    )
  );
