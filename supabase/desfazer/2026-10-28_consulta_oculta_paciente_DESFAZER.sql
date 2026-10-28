-- DESFAZER da 2026-10-28. NÃO colocar em supabase/migrations/.
-- Antes: publicar o app sem o filtro oculta_paciente (Inicio, PacienteLayout,
-- Agenda e lembretes-consulta.js leem a coluna).
drop trigger if exists consultas_reexibe_ao_reagendar_tg on public.consultas;
drop function if exists public.consultas_reexibe_ao_reagendar();
alter table public.consultas drop column if exists oculta_paciente;
