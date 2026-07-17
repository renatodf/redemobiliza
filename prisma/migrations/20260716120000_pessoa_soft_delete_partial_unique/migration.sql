-- prisma/migrations/20260716120000_pessoa_soft_delete_partial_unique/migration.sql

-- Remove os índices únicos simples gerados originalmente pelo Prisma
-- (bloqueavam recriar whatsapp/tokenMobilizador depois de soft-delete).
DROP INDEX IF EXISTS "Pessoa_gabineteId_whatsapp_key";
DROP INDEX IF EXISTS "Pessoa_gabineteId_tokenMobilizador_key";

-- Recria como índice único PARCIAL — unicidade só entre pessoas ativas.
-- Uma pessoa soft-deletada libera o whatsapp/token para reuso por um
-- cadastro novo, sem colidir com o registro antigo (que continua existindo,
-- só não conta mais pra unicidade).
CREATE UNIQUE INDEX IF NOT EXISTS "Pessoa_gabineteId_whatsapp_key"
  ON "Pessoa"("gabineteId", "whatsapp")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Pessoa_gabineteId_tokenMobilizador_key"
  ON "Pessoa"("gabineteId", "tokenMobilizador")
  WHERE "deletedAt" IS NULL;
