-- Segmento não tinha nenhuma constraint de unicidade — dois admins criando
-- o mesmo segmento simultaneamente geravam duplicata silenciosa (achado
-- 1.2/1.6 da auditoria de terceira ordem, 2026-07-17). O índice parcial
-- (WHERE status = 'ativo') já estava desenhado em scripts/setup-supabase.sql
-- mas nunca foi aplicado ao banco real — reaproveitado aqui como migration.
CREATE UNIQUE INDEX IF NOT EXISTS "Segmento_gabineteId_nome_ativo_idx"
  ON "Segmento"("gabineteId", "nome") WHERE status = 'ativo';

CREATE UNIQUE INDEX IF NOT EXISTS "Segmento_gabineteId_slug_ativo_idx"
  ON "Segmento"("gabineteId", "slug") WHERE status = 'ativo';
