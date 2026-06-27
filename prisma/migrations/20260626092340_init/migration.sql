-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Gabinete" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nomeSistema" TEXT NOT NULL DEFAULT 'Rede Mobiliza',
    "corPrimaria" TEXT NOT NULL DEFAULT '#1D4ED8',
    "corSecundaria" TEXT NOT NULL DEFAULT '#3B82F6',
    "logoUrl" TEXT,
    "imagemBannerUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gabinete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioGabinete" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioGabinete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkComposto" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "mobilizadorId" TEXT NOT NULL,
    "segmentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkComposto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regiao" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Regiao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profissao" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pessoa" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "regiaoId" TEXT,
    "profissaoId" TEXT,
    "nascimento" TIMESTAMP(3),
    "origem" TEXT,
    "genero" TEXT,
    "isEquipe" BOOLEAN NOT NULL DEFAULT false,
    "isMobilizador" BOOLEAN NOT NULL DEFAULT false,
    "tokenMobilizador" TEXT,
    "userId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segmento" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT,
    "icone" TEXT,
    "tipo" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segmento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PessoaSegmento" (
    "pessoaId" TEXT NOT NULL,
    "segmentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PessoaSegmento_pkey" PRIMARY KEY ("pessoaId","segmentoId")
);

-- CreateTable
CREATE TABLE "VinculoRede" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "indicadoPorId" TEXT,
    "nivel" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VinculoRede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogSuporte" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "superAdminUserId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "detalhes" TEXT,
    "sessaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saidoEm" TIMESTAMP(3),

    CONSTRAINT "LogSuporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservacaoPessoa" (
    "id" TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "autorUserId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3),

    CONSTRAINT "ObservacaoPessoa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gabinete_slug_key" ON "Gabinete"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioGabinete_userId_gabineteId_key" ON "UsuarioGabinete"("userId", "gabineteId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkComposto_gabineteId_mobilizadorId_segmentoId_key" ON "LinkComposto"("gabineteId", "mobilizadorId", "segmentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_gabineteId_whatsapp_key" ON "Pessoa"("gabineteId", "whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_gabineteId_tokenMobilizador_key" ON "Pessoa"("gabineteId", "tokenMobilizador");

-- CreateIndex
CREATE UNIQUE INDEX "VinculoRede_gabineteId_pessoaId_indicadoPorId_key" ON "VinculoRede"("gabineteId", "pessoaId", "indicadoPorId");

-- AddForeignKey
ALTER TABLE "UsuarioGabinete" ADD CONSTRAINT "UsuarioGabinete_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkComposto" ADD CONSTRAINT "LinkComposto_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkComposto" ADD CONSTRAINT "LinkComposto_mobilizadorId_fkey" FOREIGN KEY ("mobilizadorId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkComposto" ADD CONSTRAINT "LinkComposto_segmentoId_fkey" FOREIGN KEY ("segmentoId") REFERENCES "Segmento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Regiao" ADD CONSTRAINT "Regiao_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profissao" ADD CONSTRAINT "Profissao_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_regiaoId_fkey" FOREIGN KEY ("regiaoId") REFERENCES "Regiao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_profissaoId_fkey" FOREIGN KEY ("profissaoId") REFERENCES "Profissao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segmento" ADD CONSTRAINT "Segmento_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaSegmento" ADD CONSTRAINT "PessoaSegmento_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaSegmento" ADD CONSTRAINT "PessoaSegmento_segmentoId_fkey" FOREIGN KEY ("segmentoId") REFERENCES "Segmento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoRede" ADD CONSTRAINT "VinculoRede_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoRede" ADD CONSTRAINT "VinculoRede_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoRede" ADD CONSTRAINT "VinculoRede_indicadoPorId_fkey" FOREIGN KEY ("indicadoPorId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogSuporte" ADD CONSTRAINT "LogSuporte_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservacaoPessoa" ADD CONSTRAINT "ObservacaoPessoa_gabineteId_fkey" FOREIGN KEY ("gabineteId") REFERENCES "Gabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservacaoPessoa" ADD CONSTRAINT "ObservacaoPessoa_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

