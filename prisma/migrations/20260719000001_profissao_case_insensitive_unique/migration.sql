-- Mesmo achado Minor do índice de AreaDemanda: o índice único parcial de
-- Profissao (gabineteId, nome) WHERE ativa=true era case-sensitive, mas
-- criarProfissao já verifica duplicata com mode: 'insensitive'.
-- Substituído por índice em lower(nome), mantendo a mesma condição parcial.
DROP INDEX IF EXISTS "Profissao_gabineteId_nome_ativo_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "Profissao_gabineteId_nome_ativo_idx"
  ON "Profissao"("gabineteId", lower(nome)) WHERE ativa = true;
