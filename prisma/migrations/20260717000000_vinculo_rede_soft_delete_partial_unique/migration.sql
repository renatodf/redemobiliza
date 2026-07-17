-- Mesmo problema do achado C3 em Pessoa: o @@unique simples bloquearia
-- recriar um VinculoRede depois de um soft-delete (não usado ainda, mas a
-- mesma forma — deletedAt + @@unique — foi a causa raiz do bug em Pessoa).
DROP INDEX IF EXISTS "VinculoRede_gabineteId_pessoaId_indicadoPorId_key";

-- Recria como índice único PARCIAL — unicidade só entre vínculos ativos.
CREATE UNIQUE INDEX IF NOT EXISTS "VinculoRede_gabineteId_pessoaId_indicadoPorId_key"
  ON "VinculoRede"("gabineteId", "pessoaId", "indicadoPorId")
  WHERE "deletedAt" IS NULL;
