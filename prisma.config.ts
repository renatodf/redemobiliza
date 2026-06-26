import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Carrega .env.local (o Next.js faz isso automaticamente, mas o CLI do Prisma não)
config({ path: '.env.local' })

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
