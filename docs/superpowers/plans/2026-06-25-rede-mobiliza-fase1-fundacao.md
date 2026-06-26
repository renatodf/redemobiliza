# REDE MOBILIZA Fase 1 — Plano 1: Fundação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a base técnica do projeto — scaffold Next.js 14, schema Prisma com todos os modelos, SQL do banco (função auth.uid_gabinete + RLS + índices parciais), clientes Supabase/Prisma, middleware de rotas e Dockerfile — com a aplicação rodando localmente e o banco migrado no Supabase.

**Architecture:** Next.js 14 App Router com TypeScript strict. Prisma como ORM conectando ao PostgreSQL do Supabase via connection pooler; migrations via conexão direta. Todo acesso a dados passa por Server Actions/Route Handlers server-side (Prisma bypassa RLS automaticamente). RLS é camada de defesa secundária contra acesso direto ao PostgREST. Docker com output `standalone` para deploy no EasyPanel.

**Tech Stack:** Next.js 14, TypeScript 5 (strict), Prisma 5, Supabase (PostgreSQL + Auth), Tailwind CSS, Vitest, Docker (node:20-alpine)

## Global Constraints

- TypeScript strict mode em todos os arquivos — sem `any` implícito
- Next.js 14 App Router exclusivamente — sem Pages Router
- Todo acesso a dados via Prisma server-side (nunca PostgREST client-side com dados sensíveis)
- `gabineteId` nunca vem de parâmetros de URL — sempre do banco via sessão autenticada
- `tokenMobilizador` nunca retornado como campo JSON isolado em respostas de API
- `app_metadata` para roles/gabineteId (nunca `user_metadata`)
- Cookie `suporteSessao`: `httpOnly=true, secure=true, sameSite='strict', path='/'`
- Slug: apenas letras minúsculas, números e hífens

---

## Mapa de Arquivos

**Criados neste plano:**

```
meubd/
├── .dockerignore
├── .env.local.example
├── Dockerfile
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── prisma/
│   └── schema.prisma
├── scripts/
│   └── setup-supabase.sql
└── src/
    ├── lib/
    │   ├── prisma.ts
    │   ├── supabase/
    │   │   ├── server.ts
    │   │   └── admin.ts
    │   └── slug.ts
    ├── lib/__tests__/
    │   └── slug.test.ts
    ├── middleware.ts
    └── app/
        ├── globals.css
        ├── layout.tsx
        ├── page.tsx
        └── login/
            └── page.tsx
```

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `vitest.config.ts`, `.env.local.example`

**Interfaces:**
- Produces: `prisma` CLI disponível, `npm run dev` funcional, `npm test` funcional

- [ ] **Step 1: Criar o projeto Next.js**

No diretório raiz do projeto (`meubd/`), execute:

```bash
npx create-next-app@14 . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git
```

Quando perguntado sobre qualquer default interativo, aceite todos.

- [ ] **Step 2: Instalar dependências adicionais**

```bash
npm install @prisma/client @supabase/supabase-js @supabase/ssr
npm install --save-dev prisma vitest @vitejs/plugin-react @vitest/coverage-v8
```

- [ ] **Step 3: Configurar Vitest**

Criar `vitest.config.ts` na raiz do projeto:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Adicionar scripts ao `package.json` (merge com os scripts gerados pelo create-next-app — não substitua os existentes):

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Criar .env.local.example**

Criar `.env.local.example` na raiz do projeto:

```
# Supabase — obter em: Supabase Dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Prisma — obter em: Supabase Dashboard → Project Settings → Database → Connection string
# DATABASE_URL: Transaction Mode pooler (porta 6543) — para queries em produção
DATABASE_URL=postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
# DIRECT_URL: conexão direta (porta 5432) — apenas para migrations
DIRECT_URL=postgresql://postgres:[senha]@db.[ref].supabase.co:5432/postgres

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Verificar que o projeto inicia**

```bash
npm run dev
```

Esperado: servidor inicia em http://localhost:3000, página padrão do Next.js visível sem erros no terminal.

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js 14 + Prisma + Supabase + Vitest"
```

---

### Task 2: Dockerfile e configuração de build

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `docker build -t rede-mobiliza .` bem-sucedido

- [ ] **Step 1: Atualizar next.config.ts**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default nextConfig
```

`output: 'standalone'` é obrigatório para o Docker: gera um servidor Node autônomo em `.next/standalone/` sem precisar do `node_modules` completo em runtime.

- [ ] **Step 2: Criar Dockerfile**

```dockerfile
FROM node:20-alpine AS base

# ---- deps ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

- [ ] **Step 3: Criar .dockerignore**

```
node_modules
.next
.env*
!.env.local.example
.git
*.md
```

- [ ] **Step 4: Verificar o build**

```bash
npm run build
```

Esperado: build completo sem erros TypeScript ou ESLint. A pasta `.next/standalone/` deve existir.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore next.config.ts
git commit -m "feat: Dockerfile standalone + next.config output"
```

---

### Task 3: Schema Prisma + migration inicial

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env.local` (a partir do `.env.local.example` — **nunca commitar este arquivo**)

**Interfaces:**
- Produces:
  - Todas as tabelas criadas no Supabase
  - Prisma Client tipado gerado em `node_modules/.prisma/client`

**Pré-requisito:** `.env.local` com `DATABASE_URL` e `DIRECT_URL` preenchidos com valores reais do Supabase.

- [ ] **Step 1: Inicializar o Prisma**

```bash
npx prisma init
```

Isso cria `prisma/schema.prisma` com um template e adiciona `DATABASE_URL` ao `.env`. O arquivo `.env` gerado pode ser ignorado — usamos `.env.local` (carregado automaticamente pelo Next.js).

Adicionar `prisma/.env` e `.env` ao `.gitignore` se não estiverem (o `.env.local` já é ignorado por padrão no create-next-app).

- [ ] **Step 2: Escrever o schema.prisma completo**

Substituir todo o conteúdo de `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Gabinete {
  id              String   @id @default(cuid())
  nome            String
  slug            String   @unique
  nomeSistema     String   @default("Rede Mobiliza")
  corPrimaria     String   @default("#1D4ED8")
  corSecundaria   String   @default("#3B82F6")
  logoUrl         String?
  imagemBannerUrl String?
  ativo           Boolean  @default(true)
  criadoEm       DateTime @default(now())
  atualizadoEm   DateTime @updatedAt

  pessoas              Pessoa[]
  segmentos            Segmento[]
  regioes              Regiao[]
  profissoes           Profissao[]
  usuarios             UsuarioGabinete[]
  vinculos             VinculoRede[]
  linksCompostos       LinkComposto[]
  logsSuporteAcessados LogSuporte[]
}

model UsuarioGabinete {
  id         String   @id @default(cuid())
  userId     String
  gabineteId String
  papel      String
  criadoEm  DateTime @default(now())

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])

  @@unique([userId, gabineteId])
}

model LinkComposto {
  id            String   @id @default(cuid())
  gabineteId    String
  mobilizadorId String
  segmentoId    String
  criadoEm     DateTime @default(now())

  gabinete    Gabinete @relation(fields: [gabineteId], references: [id])
  mobilizador Pessoa   @relation("LinksMobilizador", fields: [mobilizadorId], references: [id])
  segmento    Segmento @relation(fields: [segmentoId], references: [id])

  @@unique([gabineteId, mobilizadorId, segmentoId])
}

model Regiao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
  pessoas  Pessoa[]
}

model Profissao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
  pessoas  Pessoa[]
}

model Pessoa {
  id               String    @id @default(cuid())
  gabineteId       String
  nome             String
  whatsapp         String
  email            String?
  regiaoId         String?
  profissaoId      String?
  nascimento       DateTime?
  origem           String?
  genero           String?
  isEquipe         Boolean   @default(false)
  isMobilizador    Boolean   @default(false)
  tokenMobilizador String?
  userId           String?
  criadoEm        DateTime  @default(now())
  atualizadoEm    DateTime  @updatedAt

  gabinete           Gabinete         @relation(fields: [gabineteId], references: [id])
  regiao             Regiao?          @relation(fields: [regiaoId], references: [id])
  profissao          Profissao?       @relation(fields: [profissaoId], references: [id])
  segmentos          PessoaSegmento[]
  redesComoIndicado  VinculoRede[]    @relation("Indicado")
  redesComoIndicador VinculoRede[]    @relation("Indicador")
  linksCompostos     LinkComposto[]   @relation("LinksMobilizador")

  @@unique([gabineteId, whatsapp])
  @@unique([gabineteId, tokenMobilizador])
}

model Segmento {
  id           String   @id @default(cuid())
  gabineteId   String
  nome         String
  descricao    String?
  cor          String?
  icone        String?
  tipo         String
  slug         String
  status       String   @default("ativo")
  criadoEm    DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  gabinete       Gabinete         @relation(fields: [gabineteId], references: [id])
  pessoas        PessoaSegmento[]
  linksCompostos LinkComposto[]
}

model PessoaSegmento {
  pessoaId   String
  segmentoId String
  criadoEm  DateTime @default(now())

  pessoa   Pessoa   @relation(fields: [pessoaId], references: [id])
  segmento Segmento @relation(fields: [segmentoId], references: [id])

  @@id([pessoaId, segmentoId])
}

model VinculoRede {
  id            String   @id @default(cuid())
  gabineteId    String
  pessoaId      String
  indicadoPorId String?
  nivel         Int
  criadoEm     DateTime @default(now())

  gabinete    Gabinete @relation(fields: [gabineteId], references: [id])
  pessoa      Pessoa   @relation("Indicado", fields: [pessoaId], references: [id])
  indicadoPor Pessoa?  @relation("Indicador", fields: [indicadoPorId], references: [id])

  @@unique([gabineteId, pessoaId, indicadoPorId])
}

model LogSuporte {
  id               String    @id @default(cuid())
  gabineteId       String
  superAdminUserId String
  acao             String
  detalhes         String?
  sessaoId         String
  criadoEm        DateTime  @default(now())
  saidoEm         DateTime?

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
}
```

- [ ] **Step 3: Executar a migration**

```bash
npx prisma migrate dev --name initial
```

Esperado: migration criada em `prisma/migrations/TIMESTAMP_initial/migration.sql`, tabelas criadas no Supabase, Prisma Client gerado.

- [ ] **Step 4: Verificar no Supabase**

No Supabase Dashboard → Table Editor, confirmar que todas as tabelas existem:
`Gabinete`, `UsuarioGabinete`, `Pessoa`, `Segmento`, `Regiao`, `Profissao`, `PessoaSegmento`, `VinculoRede`, `LinkComposto`, `LogSuporte`

- [ ] **Step 5: Commit**

Nunca commitar `.env.local`. Commitar apenas o schema e a migration gerada:

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: schema Prisma completo + migration inicial"
```

---

### Task 4: SQL do banco — função, RLS e índices parciais

**Files:**
- Create: `scripts/setup-supabase.sql`

**Interfaces:**
- Produces:
  - `auth.uid_gabinete()` disponível para uso em políticas RLS
  - RLS habilitado em todas as tabelas (sem política = acesso negado por padrão)
  - 5 índices parciais criados para unicidade com soft delete

**Pré-requisito:** Task 3 concluída — tabelas existem no Supabase.

- [ ] **Step 1: Criar scripts/setup-supabase.sql**

```sql
-- ============================================================
-- REDE MOBILIZA — SQL de setup do banco Supabase
-- Executar no Supabase SQL Editor após prisma migrate dev
-- ============================================================

-- ------------------------------------------------------------
-- 1. Função auth.uid_gabinete()
-- Retorna o gabineteId do usuário autenticado via PostgREST.
-- SET search_path = '' previne injection via SECURITY DEFINER.
-- ORDER BY garante resultado determinístico (usuários têm 1 gabinete).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.uid_gabinete()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "gabineteId"
  FROM public."UsuarioGabinete"
  WHERE "userId" = auth.uid()::text
  ORDER BY "gabineteId"
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 2. Habilitar RLS em todas as tabelas
-- Sem política explícita = acesso negado por padrão (deny all).
-- Prisma usa conexão direta como postgres e bypassa RLS.
-- Estas políticas protegem apenas acesso direto via PostgREST/SDK.
-- ------------------------------------------------------------
ALTER TABLE "Gabinete"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsuarioGabinete" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pessoa"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Segmento"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Regiao"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profissao"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VinculoRede"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PessoaSegmento"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LinkComposto"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LogSuporte"      ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Políticas RLS para role authenticated
-- ------------------------------------------------------------

-- Gabinete: membro autenticado lê apenas seu próprio gabinete
CREATE POLICY "gabinete_select" ON "Gabinete"
  FOR SELECT TO authenticated
  USING (id = auth.uid_gabinete());

-- UsuarioGabinete: usuário vê apenas seus próprios vínculos
CREATE POLICY "usuario_gabinete_select" ON "UsuarioGabinete"
  FOR SELECT TO authenticated
  USING ("userId" = auth.uid()::text);

-- Pessoa: leitura e escrita restritas ao próprio gabinete
CREATE POLICY "pessoa_select" ON "Pessoa"
  FOR SELECT TO authenticated
  USING ("gabineteId" = auth.uid_gabinete());

CREATE POLICY "pessoa_write" ON "Pessoa"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- Segmento
CREATE POLICY "segmento_select" ON "Segmento"
  FOR SELECT TO authenticated
  USING ("gabineteId" = auth.uid_gabinete());

CREATE POLICY "segmento_write" ON "Segmento"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- Regiao
CREATE POLICY "regiao_all" ON "Regiao"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- Profissao
CREATE POLICY "profissao_all" ON "Profissao"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- VinculoRede
CREATE POLICY "vinculo_rede_all" ON "VinculoRede"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- PessoaSegmento: sem gabineteId — join via Pessoa do mesmo gabinete
CREATE POLICY "pessoa_segmento_all" ON "PessoaSegmento"
  FOR ALL TO authenticated
  USING (
    "pessoaId" IN (
      SELECT id FROM "Pessoa" WHERE "gabineteId" = auth.uid_gabinete()
    )
  );

-- LinkComposto
CREATE POLICY "link_composto_all" ON "LinkComposto"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- LogSuporte: sem política para authenticated.
-- Super-admin usa SUPABASE_SERVICE_ROLE_KEY (bypassa RLS).
-- Nenhum usuário autenticado normal acessa esta tabela via PostgREST.

-- ------------------------------------------------------------
-- 4. Índices parciais para unicidade com soft delete
-- Substitui @@unique do Prisma onde há deleção lógica.
-- ------------------------------------------------------------

-- Segmento: nome único entre segmentos com status = 'ativo'
CREATE UNIQUE INDEX IF NOT EXISTS "Segmento_gabineteId_nome_ativo_idx"
  ON "Segmento"("gabineteId", "nome") WHERE status = 'ativo';

-- Segmento: slug único entre segmentos com status = 'ativo'
CREATE UNIQUE INDEX IF NOT EXISTS "Segmento_gabineteId_slug_ativo_idx"
  ON "Segmento"("gabineteId", "slug") WHERE status = 'ativo';

-- Regiao: nome único entre regiões ativas
CREATE UNIQUE INDEX IF NOT EXISTS "Regiao_gabineteId_nome_ativo_idx"
  ON "Regiao"("gabineteId", "nome") WHERE ativa = true;

-- Profissao: nome único entre profissões ativas
CREATE UNIQUE INDEX IF NOT EXISTS "Profissao_gabineteId_nome_ativo_idx"
  ON "Profissao"("gabineteId", "nome") WHERE ativa = true;

-- VinculoRede: pessoaId único por gabinete QUANDO não tem indicador.
-- NULL != NULL em UNIQUE convencional — este índice resolve a race condition.
CREATE UNIQUE INDEX IF NOT EXISTS "VinculoRede_gabineteId_pessoaId_sem_indicador_idx"
  ON "VinculoRede"("gabineteId", "pessoaId") WHERE "indicadoPorId" IS NULL;
```

- [ ] **Step 2: Executar no Supabase SQL Editor**

Acesse: Supabase Dashboard → SQL Editor → New Query
Cole o conteúdo completo de `scripts/setup-supabase.sql` e clique em **Run**.

Esperado: "Success. No rows returned."

- [ ] **Step 3: Verificar a função**

No SQL Editor, execute:

```sql
SELECT proname, prosecdef
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE nspname = 'auth' AND proname = 'uid_gabinete';
```

Esperado: 1 linha com `uid_gabinete` e `prosecdef = true`.

- [ ] **Step 4: Verificar os índices parciais**

```sql
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE indexname IN (
  'Segmento_gabineteId_nome_ativo_idx',
  'Segmento_gabineteId_slug_ativo_idx',
  'Regiao_gabineteId_nome_ativo_idx',
  'Profissao_gabineteId_nome_ativo_idx',
  'VinculoRede_gabineteId_pessoaId_sem_indicador_idx'
);
```

Esperado: 5 linhas.

- [ ] **Step 5: Verificar RLS habilitado**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'Gabinete','UsuarioGabinete','Pessoa','Segmento',
    'Regiao','Profissao','VinculoRede','PessoaSegmento',
    'LinkComposto','LogSuporte'
  );
```

Esperado: 10 linhas, todas com `rowsecurity = true`.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-supabase.sql
git commit -m "feat: SQL setup — auth.uid_gabinete, RLS, índices parciais"
```

---

### Task 5: Clientes Prisma + Supabase

**Files:**
- Create: `src/lib/prisma.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`

**Interfaces:**
- Produces:
  - `prisma` — `PrismaClient` singleton, importado em Server Actions e Route Handlers
  - `createSupabaseServerClient()` — `SupabaseClient`, lê a sessão do usuário atual via cookies SSR
  - `supabaseAdmin` — `SupabaseClient` com service role key, para `supabaseAdmin.auth.admin.*`

- [ ] **Step 1: Criar src/lib/prisma.ts**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

O singleton evita múltiplas conexões durante hot reload no desenvolvimento.

- [ ] **Step 2: Criar src/lib/supabase/server.ts**

Este client usa as cookies do request para autenticar o usuário atual (SSR):

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components são read-only; erros de set são esperados e inócuos
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Criar src/lib/supabase/admin.ts**

Este client usa a service role key para operações administrativas de auth (criar usuários, updateUserById, generateLink, inviteUserByEmail):

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
```

**NUNCA** expor `supabaseAdmin` ou `SUPABASE_SERVICE_ROLE_KEY` ao client-side. Este módulo deve ser importado apenas em Server Actions e Route Handlers.

- [ ] **Step 4: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/
git commit -m "feat: clientes Prisma + Supabase SSR + admin"
```

---

### Task 6: Utilitário toSlug + testes (TDD)

**Files:**
- Create: `src/lib/__tests__/slug.test.ts`
- Create: `src/lib/slug.ts`

**Interfaces:**
- Produces: `toSlug(text: string): string` — converte texto livre em slug com apenas letras minúsculas, números e hífens

- [ ] **Step 1: Escrever o teste antes da implementação**

Criar `src/lib/__tests__/slug.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { toSlug } from '../slug'

describe('toSlug', () => {
  it('converte para minúsculas', () => {
    expect(toSlug('JOAO')).toBe('joao')
  })

  it('substitui espaços por hífens', () => {
    expect(toSlug('gabinete joao')).toBe('gabinete-joao')
  })

  it('remove acentos', () => {
    expect(toSlug('João')).toBe('joao')
    expect(toSlug('Ação')).toBe('acao')
    expect(toSlug('ênfase')).toBe('enfase')
    expect(toSlug('universitários')).toBe('universitarios')
  })

  it('remove caracteres especiais', () => {
    expect(toSlug('teste@123!')).toBe('teste123')
  })

  it('colapsa múltiplos espaços e hífens', () => {
    expect(toSlug('a  b')).toBe('a-b')
    expect(toSlug('a--b')).toBe('a-b')
  })

  it('remove hífens no início e no fim', () => {
    expect(toSlug('-teste-')).toBe('teste')
  })

  it('mantém números', () => {
    expect(toSlug('palestra 2026')).toBe('palestra-2026')
  })

  it('exemplo completo do spec', () => {
    expect(toSlug('Gabinete João')).toBe('gabinete-joao')
  })
})
```

- [ ] **Step 2: Executar o teste e confirmar que falha**

```bash
npm test
```

Esperado: FAIL — "Cannot find module '../slug'"

- [ ] **Step 3: Implementar toSlug**

Criar `src/lib/slug.ts`:

```typescript
export function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

Cada etapa:
1. `normalize('NFD')` — decompõe caracteres acentuados (ex: `ã` → `a` + combining tilde)
2. `replace(/[̀-ͯ]/g, '')` — remove os diacríticos (combining marks)
3. `toLowerCase()` — minúsculas
4. `replace(/[^a-z0-9\s-]/g, '')` — remove tudo exceto letras, números, espaços e hífens
5. `trim()` — remove espaços das bordas
6. `replace(/[\s-]+/g, '-')` — colapsa espaços/hífens consecutivos em um único hífen
7. `replace(/^-+|-+$/g, '')` — remove hífens das bordas

- [ ] **Step 4: Executar os testes e confirmar que passam**

```bash
npm test
```

Esperado: 8 testes PASS em `src/lib/__tests__/slug.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/__tests__/slug.test.ts
git commit -m "feat: utilitário toSlug com testes"
```

---

### Task 7: Middleware de rotas + layout base

**Files:**
- Create: `src/middleware.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `createServerClient` de `@supabase/ssr`
- Produces: proteção automática de rotas — unauthenticated → `/login`, super-admin sem role → 403

- [ ] **Step 1: Criar src/middleware.ts**

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  // Rotas públicas — sem autenticação
  const isPublicAuth = ['/login', '/auth/confirm', '/auth/callback'].some((p) =>
    pathname.startsWith(p)
  )
  const isPublicCadastro = /^\/g\/[^/]+\/cadastro/.test(pathname)

  if (isPublicAuth || isPublicCadastro) return supabaseResponse

  // Super-admin: exige session + role = super-admin em app_metadata
  if (pathname.startsWith('/super-admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (session.user.app_metadata?.role !== 'super-admin') {
      return new NextResponse('Acesso negado', { status: 403 })
    }
    return supabaseResponse
  }

  // Rotas de gabinete admin/mobilizador — exige session (papel verificado nas routes)
  if (/^\/g\/[^/]+\/(admin|mobilizador)/.test(pathname)) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // Qualquer outra rota não listada acima exige autenticação
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Atualizar src/app/layout.tsx**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Rede Mobiliza',
  description: 'Plataforma de mobilização territorial',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Atualizar src/app/page.tsx**

```typescript
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login')
}
```

- [ ] **Step 4: Criar src/app/login/page.tsx (placeholder)**

```typescript
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500 text-sm">Login — implementado no Plano 2</p>
    </div>
  )
}
```

- [ ] **Step 5: Testar o middleware manualmente**

```bash
npm run dev
```

Abrir http://localhost:3000 — esperado: redireciona para `/login` (URL muda para `/login`).

Abrir http://localhost:3000/super-admin — esperado: redireciona para `/login` (sem sessão).

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts src/app/layout.tsx src/app/page.tsx src/app/login/page.tsx
git commit -m "feat: middleware de rotas + layout base + redirect para /login"
```

---

## Self-Review

### 1. Spec coverage

| Requisito do spec | Coberto |
|---|---|
| Next.js 14 App Router | ✅ Task 1 |
| TypeScript strict | ✅ Task 1 (tsconfig padrão do create-next-app) |
| Tailwind CSS | ✅ Task 1 |
| Prisma ORM + todos os modelos | ✅ Task 3 |
| `userId` em `Pessoa` (para mobilizador após signup) | ✅ Task 3 (campo incluído) |
| Dockerfile EasyPanel (standalone) | ✅ Task 2 |
| `auth.uid_gabinete()` com `SET search_path = ''` | ✅ Task 4 |
| `ORDER BY "gabineteId" LIMIT 1` na função | ✅ Task 4 |
| RLS habilitado em todas as tabelas | ✅ Task 4 |
| Índice parcial Segmento nome+status | ✅ Task 4 |
| Índice parcial Segmento slug+status | ✅ Task 4 |
| Índice parcial Regiao nome+ativa | ✅ Task 4 |
| Índice parcial Profissao nome+ativa | ✅ Task 4 |
| Índice parcial VinculoRede (indicadoPorId IS NULL) | ✅ Task 4 |
| `prisma` singleton | ✅ Task 5 |
| `createSupabaseServerClient()` SSR | ✅ Task 5 |
| `supabaseAdmin` com service role key | ✅ Task 5 |
| `toSlug()` com testes | ✅ Task 6 |
| Middleware: `/super-admin` exige `role = super-admin` em `app_metadata` | ✅ Task 7 |
| Middleware: rotas públicas (`/g/[slug]/cadastro`, `/auth/confirm`, `/auth/callback`) | ✅ Task 7 |
| `.env.local.example` documentado | ✅ Task 1 |

**Fora do escopo — cobertos nos Planos 2-5:**
- Login funcional e UI de autenticação (Plano 2)
- Super-admin: CRUD de gabinetes, convite de admin (Plano 2)
- Callback `/auth/confirm` (Plano 2)
- Callback `/auth/callback` para mobilizadores (Plano 4)
- Módulos 1, 2, 3, 5, 6, 7 (Planos 3-5)
- Dashboard (Plano 5)

### 2. Placeholder scan

Nenhum TBD, TODO ou "implement later" encontrado. O placeholder de login (Task 7, Step 4) é intencional e documentado.

### 3. Type consistency

- `toSlug` definida como `(text: string): string` na Task 6 — assinatura única, sem conflito
- `prisma` exportado como `PrismaClient` singleton — compatível com todos os usos em planos futuros
- `createSupabaseServerClient()` retorna o client tipado pelo `@supabase/ssr` — sem cast manual
- `supabaseAdmin` é o client padrão do `@supabase/supabase-js` — compatível com `auth.admin.*`
