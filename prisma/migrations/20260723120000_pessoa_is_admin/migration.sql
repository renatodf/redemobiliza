-- prisma/migrations/20260723120000_pessoa_is_admin/migration.sql

-- Novo campo pra marcar uma Pessoa como administradora do gabinete (mesmo
-- padrão de isColaborador/isMobilizador) — permite promover alguém a admin
-- direto pela ficha, sem passar pelo convite por e-mail do super-admin.
ALTER TABLE "Pessoa" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
