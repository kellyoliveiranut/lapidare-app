-- =============================================================
-- Migration 2026-09-02
-- REMOÇÃO DEFINITIVA — evolução por fotos (fotos_evolucao)
-- =============================================================
-- DESTRUTIVA E IRREVERSÍVEL. Só rode com o backup na máquina e CONFERIDO:
-- em 2026-09-02 foram 8 arquivos (4 da Gisella, 4 da Jordana Conduru),
-- baixados pelo painel e abertos um a um antes desta migration existir.
--
-- CONTEXTO: a feature saiu do lado da NUTRI em 2026-06-05 (commits 0fd264a e
-- 74ba7e9) e ficou no ar só na tela da PACIENTE até 2026-09-02 — com o botão
-- de excluir ativo, ou seja, a paciente podia apagar uma foto que ninguém mais
-- conseguia ver. O componente foi desmontado e depois removido do
-- Progresso.jsx no mesmo dia; isto aqui é a parte do banco.
--
-- O BUCKET NÃO ESTÁ NESTE ARQUIVO. Ver passo 4, no fim — é de propósito.
--
-- SEM begin/commit DE PROPÓSITO: no SQL Editor do Supabase a conexão é pooled
-- e uma transação explícita pode terminar em rollback SILENCIOSO. Rode tudo de
-- uma vez (Ctrl+A antes do Run).
-- =============================================================


-- 0. ANTES DE RODAR ----------------------------------------------------
-- Confira que o que vai cair é o que você espera. Se algum número divergir,
-- PARE: significa que a base não está no estado em que este arquivo foi
-- escrito.
--
--   select count(*) from public.fotos_evolucao;                     -- esperado: 8
--   select count(*) from storage.objects
--    where bucket_id = 'fotos_evolucao';                            -- esperado: 8
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'fotos_evolucao%';                       -- esperado: 4 linhas


-- 1. TABELA ------------------------------------------------------------
-- O cascade leva junto, sem precisar nomear:
--   · as 4 policies da tabela (select, insert_nutri, insert_paciente, delete)
--   · o índice fotos_evolucao_paciente_idx
--   · os grants para anon / authenticated / service_role
--
-- Nenhuma outra tabela tem FK apontando para cá — a FK é DAQUI para pacientes,
-- não o contrário — então o cascade não alcança dado de mais ninguém.
drop table if exists public.fotos_evolucao cascade;


-- 2. POLICIES DO STORAGE -----------------------------------------------
-- Estas NÃO caem com a tabela: vivem em storage.objects, que continua
-- existindo para os outros buckets (avatares, fotos de prato, anexos do chat).
--
-- Varredura em vez de nome fixo DE PROPÓSITO: `drop policy` com um nome que
-- não casa não dá erro, só não faz nada — a falha silenciosa que já custou
-- tempo nesta base (o seed com 'Wanderloock', o mapa de locais por nome). O
-- loop pega o que existir, com o nome que tiver, e diz no console o que
-- removeu.
do $$
declare p record;
begin
  for p in
    select policyname
      from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and policyname like 'fotos_evolucao%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
    raise notice 'policy removida: %', p.policyname;
  end loop;
end $$;


-- 3. CONFERÊNCIA — a prova, não a expectativa --------------------------
select to_regclass('public.fotos_evolucao') is null as tabela_removida,
       (select count(*)
          from pg_policies
         where schemaname = 'storage'
           and tablename  = 'objects'
           and policyname like 'fotos_evolucao%') = 0 as policies_removidas;
-- Esperado: t | t


-- 4. BUCKET — À MÃO, NO DASHBOARD --------------------------------------
-- NÃO faça por SQL. `delete from storage.objects` apaga só a linha de
-- metadado; o arquivo continua no backend de storage, agora inalcançável e sem
-- nada que o colete. Apagar bucket por SQL é o jeito de gerar lixo permanente.
-- O caminho correto passa pela API de storage, que é o que o painel usa.
--
--   Storage → fotos_evolucao → selecionar os 8 arquivos → Delete
--   Storage → fotos_evolucao → Delete bucket
--
-- A linha de storage.buckets sai junto com o bucket. Conferência depois:
--   select count(*) from storage.buckets where id = 'fotos_evolucao';  -- 0
--
-- A ordem entre este passo e os passos 1-2 não importa: as policies de storage
-- referenciam public.pacientes, não a tabela que caiu.


-- =============================================================
-- PENDÊNCIA CONHECIDA, DE PROPÓSITO
-- supabase/setup.sql ainda descreve a tabela, o bucket e as 8 policies em 7
-- blocos (239-249, 368, 564-586, 713-715, 783-822, 2030-2045, 2128-2131).
-- Limpeza adiada para sessão própria, bloco a bloco.
--
-- As migrations antigas (2026-05-22_evolucao_csv_links.sql,
-- 2026-07-23_fix_fotos_evolucao_storage_select.sql e o comentário em
-- 2026-07-23_chat_anexos.sql) NÃO devem ser editadas: são o registro histórico
-- do que foi feito. Este arquivo é o que as supersede.
-- =============================================================
