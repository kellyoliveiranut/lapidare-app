-- Novos campos na tabela treinos_prescritos
alter table treinos_prescritos
  add column if not exists precaucoes      text,
  add column if not exists objetivo_treino text,
  add column if not exists progressao      text,
  add column if not exists dias_semana     text[];
