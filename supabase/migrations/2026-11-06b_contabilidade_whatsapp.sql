-- WhatsApp da contabilidade (para enviar os dados da nota fiscal). Idempotente.
alter table public.nutris add column if not exists contabilidade_nome     text;
alter table public.nutris add column if not exists contabilidade_whatsapp text;

-- Preenche a conta da Kelly (só se ainda estiver vazio).
update public.nutris
   set contabilidade_nome = 'Escritax Serviços Contábeis',
       contabilidade_whatsapp = '+55 41 6349-1676'
 where lower(email) = 'kellynut01@gmail.com'
   and contabilidade_whatsapp is null;
