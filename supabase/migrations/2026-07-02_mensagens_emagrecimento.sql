-- Mensagens motivacionais semanais para pacientes de Emagrecimento.
-- Rotação por semana calculada no cliente: (semanas desde a âncora) módulo
-- (nº de mensagens ativas), ordenadas por `ordem`. Âncora = segunda 05/01/2026
-- à meia-noite de Brasília. Vale igualmente para todas as pacientes da nutri.

create table if not exists public.mensagens_emagrecimento (
  id         uuid primary key default gen_random_uuid(),
  nutri_id   uuid not null references public.nutris(id) on delete cascade,
  ordem      integer not null default 0,   -- ordem de rotação
  texto      text    not null,             -- usa {nome} como placeholder do 1º nome
  ativa      boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists mensagens_emag_nutri_idx
  on public.mensagens_emagrecimento(nutri_id, ordem);

alter table public.mensagens_emagrecimento enable row level security;

-- Nutri gerencia as próprias
drop policy if exists mensagens_emag_all_nutri on public.mensagens_emagrecimento;
create policy mensagens_emag_all_nutri on public.mensagens_emagrecimento
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

-- Paciente lê apenas as ativas da sua nutri
drop policy if exists mensagens_emag_select_paciente on public.mensagens_emagrecimento;
create policy mensagens_emag_select_paciente on public.mensagens_emagrecimento
  for select using (
    ativa = true
    and nutri_id in (select nutri_id from public.pacientes where id = auth.uid())
  );

-- ── Seed: 15 mensagens (associa à nutri pelo e-mail) ──────────────────────────
insert into public.mensagens_emagrecimento (nutri_id, ordem, texto)
select n.id, v.ordem, v.texto
from public.nutris n
cross join (values
  (1,  '{nome}, emagrecer com saúde não é sobre pressa. É sobre constância — um dia depois do outro, do seu jeito. Essa semana, um passo de cada vez.'),
  (2,  '{nome}, seu corpo não é um projeto pra terminar rápido. É uma casa pra cuidar todos os dias. Cuidar bem hoje já é vitória.'),
  (3,  'Não existe semana perfeita, {nome}. Existe semana real, com dias bons e dias difíceis. O que constrói resultado é você voltar, não nunca sair do caminho.'),
  (4,  'Beber água ao longo do dia parece pequeno, mas é um dos cuidados mais generosos que você faz por si. Que essa semana tenha mais goles de água e menos pressa, {nome}.'),
  (5,  'Comida de verdade, do nosso jeito: um peixe fresco, uma farinha, uma fruta da estação. Nutrir não precisa ser complicado nem de fora, {nome} — a nossa terra dá o que o corpo precisa.'),
  (6,  'Movimento não é castigo pelo que você comeu, {nome}. É presente pro seu corpo. Uma caminhada leve, um alongamento — do tamanho do seu dia de hoje.'),
  (7,  'Se essa semana não saiu como você queria, respira, {nome}. Recomeçar hoje, amanhã ou na segunda — tanto faz. O importante é recomeçar sem se cobrar demais.'),
  (8,  'Dormir bem também é cuidar de você, {nome}. Sono ruim bagunça a fome e a energia. Essa semana, cuide da sua noite tanto quanto do seu prato.'),
  (9,  'Você não precisa comer perfeito, {nome}. Precisa comer com atenção, com prazer e com constância. Reeducação é um jeito novo que dá pra manter, não uma prova pra passar.'),
  (10, 'Açaí de verdade, do nosso, é comida — não vilão. O que muda tudo é o jeito e a companhia no prato. Comida da nossa terra tem lugar no seu processo, {nome}.'),
  (11, 'Compare-se só com você de ontem, {nome}. Não com a vizinha, não com a internet, não com quem você foi aos 20. Seu processo é seu, no seu tempo.'),
  (12, 'Constância gentil vence esforço extremo, {nome}. Quem faz um pouquinho todo dia chega mais longe que quem se cobra demais e desiste na quinta. Vai com calma que você chega.'),
  (13, 'Um prato colorido conta uma história boa: legumes, uma proteína, um carboidrato de verdade. Não é sobre cortar, {nome} — é sobre montar melhor.'),
  (14, 'Fome de comida e fome de aconchego são diferentes, {nome}. Quando bater a vontade, respire um instante e pergunte: é o corpo ou é o coração? Cuidar dos dois é parte do processo.'),
  (15, 'Você começou por um motivo, {nome}. Nos dias difíceis, lembra dele com carinho — não com cobrança. Cuidar de você é um ato de respeito, não de punição. Seguimos, no seu ritmo.')
) as v(ordem, texto)
where n.email = 'kellynut01@gmail.com';
