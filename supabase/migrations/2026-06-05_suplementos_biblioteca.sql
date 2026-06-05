-- Adiciona data_inicio e referência à biblioteca na tabela suplementos
ALTER TABLE suplementos
  ADD COLUMN IF NOT EXISTS data_inicio DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS favorito_id UUID REFERENCES suplementos_favoritos(id) ON DELETE SET NULL;
