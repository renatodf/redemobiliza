-- prisma/migrations/20260707100000_add_banco_talentos/migration.sql

-- CreateTable: AreaColocacao
CREATE TABLE "AreaColocacao" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AreaColocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BancoTalentos
CREATE TABLE "BancoTalentos" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "curriculoUrl" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 3,
    "isPcd" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "colocado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BancoTalentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BancoTalentosArea
CREATE TABLE "BancoTalentosArea" (
    "bancoTalentosId" TEXT NOT NULL,
    "areaColocacaoId" TEXT NOT NULL,

    CONSTRAINT "BancoTalentosArea_pkey" PRIMARY KEY ("bancoTalentosId","areaColocacaoId")
);

-- CreateIndex
CREATE INDEX "AreaColocacao_gabineteId_idx" ON "AreaColocacao"("gabineteId");

-- CreateIndex
CREATE UNIQUE INDEX "AreaColocacao_gabineteId_nome_key" ON "AreaColocacao"("gabineteId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "BancoTalentos_pessoaId_key" ON "BancoTalentos"("pessoaId");

-- AddForeignKey
ALTER TABLE "AreaColocacao" ADD CONSTRAINT "AreaColocacao_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BancoTalentos" ADD CONSTRAINT "BancoTalentos_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BancoTalentosArea" ADD CONSTRAINT "BancoTalentosArea_bancoTalentosId_fkey" FOREIGN KEY ("bancoTalentosId") REFERENCES "BancoTalentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BancoTalentosArea" ADD CONSTRAINT "BancoTalentosArea_areaColocacaoId_fkey" FOREIGN KEY ("areaColocacaoId") REFERENCES "AreaColocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: áreas de colocação padrão para gabinetes já existentes (novos gabinetes recebem via seedAreasColocacao no momento da criação)
INSERT INTO "AreaColocacao" ("id", "gabineteId", "nome", "status")
SELECT gen_random_uuid()::text, g."id", area.nome, 'ativa'
FROM "Gabinete" g
CROSS JOIN (VALUES
  ('Serviços Gerais'),
  ('Administrativo'),
  ('Saúde'),
  ('Educação'),
  ('Segurança'),
  ('Tecnologia'),
  ('Comércio'),
  ('Construção Civil'),
  ('Transporte'),
  ('Alimentação')
) AS area(nome);
