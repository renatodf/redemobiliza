-- Fase 1 da importação Izalci
-- (docs/superpowers/specs/2026-07-18-importacao-izalci-fase1-fundacao-schema-design.md):
-- hierarquia cidade -> bairro em Regiao, campos eleitorais em Pessoa, e
-- nova tabela TelefoneExtra para telefones adicionais de uma pessoa.

-- Regiao: hierarquia cidade -> bairro (regiaoPaiId autorreferente, opcional)
ALTER TABLE "Regiao" ADD COLUMN "regiaoPaiId" TEXT;
ALTER TABLE "Regiao" ADD CONSTRAINT "Regiao_regiaoPaiId_fkey" FOREIGN KEY ("regiaoPaiId") REFERENCES "Regiao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pessoa: campos eleitorais (armazenamento puro, sem validação/índice)
ALTER TABLE "Pessoa" ADD COLUMN "zonaEleitoral" TEXT;
ALTER TABLE "Pessoa" ADD COLUMN "secaoEleitoral" TEXT;

-- TelefoneExtra: telefones adicionais além de whatsapp/telefoneFixo
CREATE TABLE "TelefoneExtra" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TelefoneExtra_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelefoneExtra" ADD CONSTRAINT "TelefoneExtra_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelefoneExtra" ADD CONSTRAINT "TelefoneExtra_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
