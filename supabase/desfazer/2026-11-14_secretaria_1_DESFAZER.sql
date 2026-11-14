-- Só rode DEPOIS de desfazer o passo 3 (as regras não podem usar nutri_efetiva()).
drop table if exists public.chat_equipe;
drop table if exists public.secretarias;
drop function if exists public.nutri_efetiva();
