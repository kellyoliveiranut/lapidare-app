-- Esconde a data de uma consulta da paciente enquanto a nutri reagenda.
-- A consulta continua na Agenda da nutri com a data e tudo o mais; só a tela
-- da paciente (banner, cartão "próxima consulta") e o push de lembrete da
-- véspera deixam de enxergá-la. Quem escreve é a nutri/SQL; o app da paciente
-- só filtra por esta coluna.
--
-- Mudou a data → volta a aparecer sozinha (trigger próprio, separado do
-- consultas_limpa_ao_reagendar para não mexer na função que já está no ar). O
-- guard "is not distinct from" deixa passar o caso de a mesma gravação ligar a
-- coluna e mexer na data.
--
-- Idempotente. Rodar com Ctrl+A antes do Run. Rodar ANTES de publicar o app.
alter table public.consultas add column if not exists oculta_paciente boolean not null default false;

create or replace function public.consultas_reexibe_ao_reagendar()
returns trigger
language plpgsql
as $$
begin
  if new.data_hora is distinct from old.data_hora
     and new.oculta_paciente is not distinct from old.oculta_paciente then
    new.oculta_paciente := false;
  end if;
  return new;
end;
$$;

drop trigger if exists consultas_reexibe_ao_reagendar_tg on public.consultas;
create trigger consultas_reexibe_ao_reagendar_tg
  before update of data_hora on public.consultas
  for each row execute function public.consultas_reexibe_ao_reagendar();
