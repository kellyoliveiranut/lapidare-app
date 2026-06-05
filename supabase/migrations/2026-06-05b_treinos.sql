-- Treinos prescritos pela nutricionista
create table if not exists treinos_prescritos (
  id                  uuid default gen_random_uuid() primary key,
  paciente_id         uuid references pacientes(id) on delete cascade,
  nutri_id            uuid,
  tipo                text,
  intensidade         text,
  frequencia_semanal  int,
  duracao_minutos     int,
  fase_tratamento     text,
  observacoes         text,
  video_url           text,
  ativo               boolean default true,
  created_at          timestamptz default now()
);

alter table treinos_prescritos enable row level security;

create policy "nutri_all_treinos_prescritos" on treinos_prescritos
  for all using (
    nutri_id = auth.uid()
    or paciente_id = auth.uid()
  );

-- Registros de execução da paciente
create table if not exists treinos_registros (
  id                  uuid default gen_random_uuid() primary key,
  paciente_id         uuid references pacientes(id) on delete cascade,
  treino_id           uuid references treinos_prescritos(id) on delete set null,
  data_execucao       timestamptz default now(),
  intensidade_sentida text,
  como_se_sentiu      text,
  observacao          text
);

alter table treinos_registros enable row level security;

create policy "paciente_own_treinos_registros" on treinos_registros
  for all using (paciente_id = auth.uid());

create policy "nutri_read_treinos_registros" on treinos_registros
  for select using (
    exists (
      select 1 from treinos_prescritos tp
      where tp.id = treino_id
        and tp.nutri_id = auth.uid()
    )
  );
