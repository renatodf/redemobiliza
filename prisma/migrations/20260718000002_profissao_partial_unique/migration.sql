-- Profissao permitia criar duplicatas sem nenhum aviso (nem findFirst
-- prévio existia). O índice parcial (WHERE ativa = true) já estava
-- desenhado em scripts/setup-supabase.sql mas nunca foi aplicado ao banco
-- real — reaproveitado aqui como migration (achado de baixa severidade,
-- seção 3 do relatório da auditoria de terceira ordem, 2026-07-17,
-- reclassificado como correção estrutural real após a descoberta de que o
-- design já existia).
CREATE UNIQUE INDEX IF NOT EXISTS "Profissao_gabineteId_nome_ativo_idx"
  ON "Profissao"("gabineteId", "nome") WHERE ativa = true;
