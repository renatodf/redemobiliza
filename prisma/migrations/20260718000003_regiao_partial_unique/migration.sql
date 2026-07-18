-- Regiao permitia criar duplicatas sem nenhum aviso. O índice parcial
-- (WHERE ativa = true) já estava desenhado em scripts/setup-supabase.sql
-- mas nunca foi aplicado ao banco real — reaproveitado aqui como migration
-- (achado de baixa severidade, auditoria de terceira ordem, 2026-07-17).
CREATE UNIQUE INDEX IF NOT EXISTS "Regiao_gabineteId_nome_ativo_idx"
  ON "Regiao"("gabineteId", "nome") WHERE ativa = true;
