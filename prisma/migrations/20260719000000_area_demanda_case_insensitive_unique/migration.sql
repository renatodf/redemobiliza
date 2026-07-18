-- O índice único de AreaDemanda (gabineteId, nome) era case-sensitive,
-- mas criarAreaDemanda já verifica duplicata com mode: 'insensitive'
-- (achado Minor da revisão final do plano de correção da auditoria de
-- terceira ordem, 2026-07-17): sob corrida real, dois nomes diferindo só
-- por maiúscula/minúscula ainda passavam pelo índice antigo. Substituído
-- por índice em lower(nome), alinhado com a checagem da aplicação.
DROP INDEX IF EXISTS "AreaDemanda_gabineteId_nome_key";

CREATE UNIQUE INDEX IF NOT EXISTS "AreaDemanda_gabineteId_nome_key"
  ON "AreaDemanda"("gabineteId", lower("nome"));
