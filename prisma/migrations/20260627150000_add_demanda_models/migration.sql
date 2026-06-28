-- AlterTable: Adicionar campos de endereço ao model Pessoa
ALTER TABLE "Pessoa" ADD COLUMN "bairro" TEXT;
ALTER TABLE "Pessoa" ADD COLUMN "logradouro" TEXT;
ALTER TABLE "Pessoa" ADD COLUMN "numero" TEXT;
ALTER TABLE "Pessoa" ADD COLUMN "complemento" TEXT;
ALTER TABLE "Pessoa" ADD COLUMN "cep" TEXT;

-- CreateTable: AreaDemanda
CREATE TABLE "AreaDemanda" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,

    CONSTRAINT "AreaDemanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Demanda
CREATE TABLE "Demanda" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "prazoDesfecho" TIMESTAMP(3) NOT NULL,
    "prazoAlterado" BOOLEAN NOT NULL DEFAULT false,
    "alertaEnviadoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT NOT NULL,

    CONSTRAINT "Demanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MovimentacaoDemanda
CREATE TABLE "MovimentacaoDemanda" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "autorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoDemanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ConfiguracaoSistema
CREATE TABLE "ConfiguracaoSistema" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "prazoDemandasHoras" INTEGER NOT NULL DEFAULT 72,
    "alertaExpiracaoHoras" INTEGER NOT NULL DEFAULT 12,

    CONSTRAINT "ConfiguracaoSistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AreaDemanda_gabineteId_idx" ON "AreaDemanda"("gabineteId");

-- CreateIndex
CREATE INDEX "Demanda_gabineteId_idx" ON "Demanda"("gabineteId");

-- CreateIndex
CREATE INDEX "Demanda_status_idx" ON "Demanda"("status");

-- CreateIndex
CREATE INDEX "Demanda_responsavelId_idx" ON "Demanda"("responsavelId");

-- CreateIndex
CREATE INDEX "Demanda_prazoDesfecho_idx" ON "Demanda"("prazoDesfecho");

-- CreateIndex
CREATE INDEX "MovimentacaoDemanda_demandaId_idx" ON "MovimentacaoDemanda"("demandaId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ConfiguracaoSistema_gabineteId_key" ON "ConfiguracaoSistema"("gabineteId");

-- AddForeignKey
ALTER TABLE "AreaDemanda" ADD CONSTRAINT "AreaDemanda_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demanda" ADD CONSTRAINT "Demanda_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demanda" ADD CONSTRAINT "Demanda_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demanda" ADD CONSTRAINT "Demanda_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demanda" ADD CONSTRAINT "Demanda_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AreaDemanda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demanda" ADD CONSTRAINT "Demanda_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoDemanda" ADD CONSTRAINT "MovimentacaoDemanda_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "Demanda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoDemanda" ADD CONSTRAINT "MovimentacaoDemanda_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoSistema" ADD CONSTRAINT "ConfiguracaoSistema_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
