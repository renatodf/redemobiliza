-- AreaDemanda não tinha nenhuma constraint de unicidade — dois admins
-- criando a mesma área simultaneamente geravam duplicata silenciosa
-- (achado 1.2 da auditoria de terceira ordem, 2026-07-17).
CREATE UNIQUE INDEX IF NOT EXISTS "AreaDemanda_gabineteId_nome_key"
  ON "AreaDemanda"("gabineteId", "nome");
