-- Mesmo achado Minor do índice de AreaDemanda: o índice único parcial de
-- Regiao (gabineteId, nome) WHERE ativa=true era case-sensitive, mas
-- criarRegiao já verifica duplicata com mode: 'insensitive'. Substituído
-- por índice em lower(nome), mantendo a mesma condição parcial.
DROP INDEX IF EXISTS "Regiao_gabineteId_nome_ativo_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "Regiao_gabineteId_nome_ativo_idx"
  ON "Regiao"("gabineteId", lower(nome)) WHERE ativa = true;
