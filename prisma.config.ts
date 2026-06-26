import { defineConfig } from 'prisma/config'

// Em desenvolvimento, carrega .env.local (Next.js faz isso automaticamente, mas o CLI do Prisma não)
// Em Docker/produção, DATABASE_URL já está no ambiente — o try/catch evita falha quando dotenv não está disponível
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require('dotenv')
  dotenv.config({ path: '.env.local' })
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // DIRECT_URL: conexão direta (porta 5432) usada pelo Prisma Migrate
    // Fallback para DATABASE_URL se DIRECT_URL não estiver definida
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
})
