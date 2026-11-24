-- Desfaz 2026-11-24_fotos_pratos_retencao.sql. NÃO recupera fotos já apagadas.
-- Publicar antes o app sem a limpeza (ele lê pacientes.encerrada_em).
drop policy if exists fotos_pratos_storage_delete_nutri_encerrada on storage.objects;
drop policy if exists feed_delete_nutri_encerrada on public.feed_pratos;
drop trigger if exists trg_marca_encerrada_em on public.pacientes;
drop function if exists public.marca_encerrada_em();
alter table public.pacientes drop column if exists encerrada_em;
