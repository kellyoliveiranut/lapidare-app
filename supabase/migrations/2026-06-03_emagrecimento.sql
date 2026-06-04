-- Tabela de sintomas de emagrecimento / menopausa oncológica
CREATE TABLE IF NOT EXISTS emagrecimento_sintomas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id   UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  nutri_id      UUID NOT NULL,
  categoria     TEXT NOT NULL,
  sintoma       TEXT NOT NULL,
  presente      BOOLEAN NOT NULL DEFAULT FALSE,
  valor         TEXT,            -- JSON livre: escalas, frequências, observações
  data_registro DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (paciente_id, sintoma)
);

ALTER TABLE emagrecimento_sintomas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nutri_acesso_emagrecimento" ON emagrecimento_sintomas
  FOR ALL USING (nutri_id = auth.uid());
