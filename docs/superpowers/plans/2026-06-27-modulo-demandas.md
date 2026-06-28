# Módulo de Demandas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo de Demandas completo — schema, CRUD de áreas, abertura e gestão de demandas pelo admin, painel do mobilizador e cron de expiração com e-mail.

**Architecture:** Status armazenado em DB (`aberta | expirada | atendida | nao_atendida`), atualizado por cron via API route protegida por `CRON_SECRET`. Server Components + Server Actions seguindo padrão existente do projeto. Isolamento multi-tenant via `gabineteId` em todos os models.

**Tech Stack:** Next.js 14 App Router, Prisma, PostgreSQL/Supabase, Tailwind CSS, Resend (e-mail), Vitest.

## Global Constraints

- Sempre usar `assertAdminAccess(slug)` em server actions do admin
- Sempre usar `assertMobilizadorAccess(slug)` em server actions do mobilizador (criado na Task 1)
- Toda query Prisma inclui `gabineteId` — sem exceção
- `isColaborador` é o nome correto do campo (não `isEquipe`)
- Padrão de revalidação: `revalidatePath(`/${slug}/admin/demandas`)` após mutations
- Imports de `@/` mapeiam para `src/`
- Não criar testes para server actions ou pages — apenas para funções em `src/lib/`

---

### Task 1: isEquipe → isColaborador + assertMobilizadorAccess

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/[timestamp]_rename_isequipe_to_iscolaborador/migration.sql` (gerada pelo Prisma, editada manualmente)
- Modify: `src/actions/admin/toggle-equipe.ts`
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`
- Modify: `src/app/[slug]/admin/pessoas/page.tsx`
- Modify: `src/app/[slug]/admin/dashboard/page.tsx`
- Create: `src/lib/assert-mobilizador-access.ts`

**Interfaces:**
- Produces: `assertMobilizadorAccess(slug: string): Promise<{ session, gabinete, pessoa: { id: string, nome: string } }>`

- [ ] **Step 1: Renomear campo no schema**

Em `prisma/schema.prisma`, no model `Pessoa`, alterar:
```prisma
isEquipe         Boolean   @default(false)
```
para:
```prisma
isColaborador    Boolean   @default(false)
```

- [ ] **Step 2: Gerar a migration sem aplicar**

```bash
npx prisma migrate dev --name rename_isequipe_to_iscolaborador --create-only
```

- [ ] **Step 3: Editar o SQL da migration para RENAME em vez de DROP+CREATE**

Abrir o arquivo gerado em `prisma/migrations/[timestamp]_rename_isequipe_to_iscolaborador/migration.sql` e substituir o conteúdo gerado pelo Prisma (que faria DROP + ADD) por:

```sql
ALTER TABLE "Pessoa" RENAME COLUMN "isEquipe" TO "isColaborador";
```

- [ ] **Step 4: Aplicar a migration**

```bash
npx prisma migrate dev
```

Expected: `1 migration applied` sem erros.

- [ ] **Step 5: Regenerar o cliente Prisma**

```bash
npx prisma generate
```

- [ ] **Step 6: Atualizar toggle-equipe.ts**

Conteúdo completo de `src/actions/admin/toggle-equipe.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function toggleColaborador(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const acao = formData.get('acao') as 'marcar' | 'desmarcar'

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { isColaborador: acao === 'marcar' },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Step 7: Atualizar page.tsx da ficha da pessoa**

Em `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`, fazer as seguintes substituições:
- Import: `import { toggleEquipe } from '@/actions/admin/toggle-equipe'` → `import { toggleColaborador } from '@/actions/admin/toggle-equipe'`
- Campo: todas ocorrências de `pessoa.isEquipe` → `pessoa.isColaborador`
- Label: `"Membro da Equipe"` → `"Colaborador"`
- Action: todas ocorrências de `toggleEquipe` → `toggleColaborador`
- Select: adicionar `isColaborador: true` ao select do Prisma query

- [ ] **Step 8: Atualizar pessoas/page.tsx**

Em `src/app/[slug]/admin/pessoas/page.tsx`:
- No select Prisma: `isEquipe: true` → `isColaborador: true`
- No JSX: `p.isEquipe` → `p.isColaborador`
- Header da coluna: `"Equipe"` → `"Colaborador"`
- Badge text: `"Equipe"` → `"Colaborador"`

- [ ] **Step 9: Atualizar dashboard/page.tsx**

Em `src/app/[slug]/admin/dashboard/page.tsx`:
- Query: `isEquipe: true` → `isColaborador: true`
- Label: `"Equipe"` → `"Colaboradores"`

- [ ] **Step 10: Criar assertMobilizadorAccess**

Criar `src/lib/assert-mobilizador-access.ts`:
```typescript
import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'
import { prisma } from '@/lib/prisma'

export async function assertMobilizadorAccess(slug: string) {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  if (!usuarioGabinete || usuarioGabinete.papel !== 'mobilizador') {
    throw new Error('Não autorizado')
  }

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true },
  })
  if (!pessoa) throw new Error('Mobilizador não encontrado')

  return { session, gabinete, pessoa }
}
```

- [ ] **Step 11: Verificar que o build compila**

```bash
npx tsc --noEmit
```

Expected: zero erros de tipo.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/actions/admin/toggle-equipe.ts src/lib/assert-mobilizador-access.ts src/app/[slug]/admin/pessoas/ src/app/[slug]/admin/dashboard/page.tsx
git commit -m "feat: renomeia isEquipe para isColaborador, adiciona assertMobilizadorAccess"
```

---

### Task 2: Schema — endereço na Pessoa + models de Demanda

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/seed-areas-demanda.ts`
- Create: `src/lib/__tests__/seed-areas-demanda.test.ts`
- Modify: `src/actions/super-admin/criar-gabinete.ts`

**Interfaces:**
- Produces: `seedAreasDemanda(gabineteId: string): Promise<void>`

- [ ] **Step 1: Adicionar campos de endereço ao model Pessoa no schema**

Em `prisma/schema.prisma`, no model `Pessoa`, após `fotoUrl String?` adicionar:
```prisma
bairro           String?
logradouro       String?
numero           String?
complemento      String?
cep              String?
```

- [ ] **Step 2: Adicionar novos models ao schema**

Ao final de `prisma/schema.prisma`, adicionar:

```prisma
model AreaDemanda {
  id         String    @id @default(cuid())
  nome       String
  gabineteId String
  gabinete   Gabinete  @relation(fields: [gabineteId], references: [id])
  demandas   Demanda[]

  @@index([gabineteId])
}

model Demanda {
  id              String    @id @default(cuid())
  gabineteId      String
  titulo          String
  descricao       String
  solicitanteId   String
  responsavelId   String
  areaId          String
  status          String    @default("aberta")
  prazoDesfecho   DateTime
  prazoAlterado   Boolean   @default(false)
  alertaEnviadoEm DateTime?
  observacao      String?
  criadoEm        DateTime  @default(now())
  criadoPorId     String

  gabinete    Gabinete            @relation(fields: [gabineteId], references: [id])
  solicitante Pessoa              @relation("DemandaSolicitante", fields: [solicitanteId], references: [id])
  responsavel Pessoa              @relation("DemandaResponsavel", fields: [responsavelId], references: [id])
  area        AreaDemanda         @relation(fields: [areaId], references: [id])
  criadoPor   Pessoa              @relation("DemandaCriadoPor", fields: [criadoPorId], references: [id])
  historico   MovimentacaoDemanda[]

  @@index([gabineteId])
  @@index([status])
  @@index([responsavelId])
  @@index([prazoDesfecho])
}

model MovimentacaoDemanda {
  id        String   @id @default(cuid())
  demandaId String
  tipo      String
  descricao String
  autorId   String
  criadoEm  DateTime @default(now())

  demanda Demanda @relation(fields: [demandaId], references: [id])
  autor   Pessoa  @relation("MovimentacaoAutor", fields: [autorId], references: [id])

  @@index([demandaId])
}

model ConfiguracaoSistema {
  id                   String   @id @default(cuid())
  gabineteId           String   @unique
  prazoDemandasHoras   Int      @default(72)
  alertaExpiracaoHoras Int      @default(12)

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
}
```

- [ ] **Step 3: Adicionar relações ao model Gabinete**

No model `Gabinete`, adicionar ao bloco de relações:
```prisma
  areasDemanda         AreaDemanda[]
  demandas             Demanda[]
  configuracaoSistema  ConfiguracaoSistema?
```

- [ ] **Step 4: Adicionar relações ao model Pessoa**

No model `Pessoa`, adicionar ao bloco de relações:
```prisma
  demandasSolicitadas    Demanda[]              @relation("DemandaSolicitante")
  demandasResponsavel    Demanda[]              @relation("DemandaResponsavel")
  demandasCriadas        Demanda[]              @relation("DemandaCriadoPor")
  movimentacoesDemanda   MovimentacaoDemanda[]  @relation("MovimentacaoAutor")
```

- [ ] **Step 5: Gerar e aplicar migration**

```bash
npx prisma migrate dev --name add_demanda_models
npx prisma generate
```

Expected: migration aplicada sem erros.

- [ ] **Step 6: Criar seed-areas-demanda.ts**

Criar `src/lib/seed-areas-demanda.ts`:
```typescript
import { prisma } from '@/lib/prisma'

const AREAS_PADRAO = [
  'Saúde',
  'Educação',
  'Habitação',
  'Social',
  'Segurança',
  'Infraestrutura',
  'Empreendedorismo',
]

export async function seedAreasDemanda(gabineteId: string): Promise<void> {
  await prisma.areaDemanda.createMany({
    data: AREAS_PADRAO.map((nome) => ({ nome, gabineteId })),
    skipDuplicates: true,
  })
}
```

- [ ] **Step 7: Escrever teste para seedAreasDemanda**

Criar `src/lib/__tests__/seed-areas-demanda.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMany = vi.fn().mockResolvedValue({ count: 7 })
vi.mock('@/lib/prisma', () => ({
  prisma: { areaDemanda: { createMany } },
}))

import { seedAreasDemanda } from '@/lib/seed-areas-demanda'

describe('seedAreasDemanda', () => {
  beforeEach(() => createMany.mockClear())

  it('cria 7 áreas padrão para o gabinete', async () => {
    await seedAreasDemanda('gab-1')
    expect(createMany).toHaveBeenCalledOnce()
    const { data } = createMany.mock.calls[0][0]
    expect(data).toHaveLength(7)
    expect(data[0]).toEqual({ nome: 'Saúde', gabineteId: 'gab-1' })
  })

  it('usa skipDuplicates para ser idempotente', async () => {
    await seedAreasDemanda('gab-1')
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true)
  })
})
```

- [ ] **Step 8: Rodar o teste**

```bash
npx vitest run src/lib/__tests__/seed-areas-demanda.test.ts
```

Expected: 2 passed.

- [ ] **Step 9: Integrar seedAreasDemanda no criar-gabinete**

Em `src/actions/super-admin/criar-gabinete.ts`, adicionar import e chamada:
```typescript
import { seedAreasDemanda } from '@/lib/seed-areas-demanda'

// Dentro da função, na linha do Promise.all:
await Promise.all([seedRegioes(gabinete.id), seedProfissoes(gabinete.id), seedAreasDemanda(gabinete.id)])
```

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/seed-areas-demanda.ts src/lib/__tests__/seed-areas-demanda.test.ts src/actions/super-admin/criar-gabinete.ts
git commit -m "feat: schema de demandas, endereço na pessoa, seed de áreas"
```

---

### Task 3: CRUD de Áreas + Configurações do Sistema

**Files:**
- Create: `src/actions/admin/criar-area-demanda.ts`
- Create: `src/actions/admin/editar-area-demanda.ts`
- Create: `src/actions/admin/excluir-area-demanda.ts`
- Create: `src/app/[slug]/admin/demandas/areas/page.tsx`
- Create: `src/actions/admin/salvar-configuracao.ts`
- Create: `src/app/[slug]/admin/configuracoes/page.tsx`
- Modify: `src/app/[slug]/admin/layout.tsx`

- [ ] **Step 1: Criar actions de áreas**

Criar `src/actions/admin/criar-area-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function criarAreaDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  const { gabinete } = await assertAdminAccess(slug)

  const existente = await prisma.areaDemanda.findFirst({
    where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' } },
  })
  if (existente) return { erro: 'Já existe uma área com esse nome' }

  await prisma.areaDemanda.create({ data: { nome, gabineteId: gabinete.id } })
  revalidatePath(`/${slug}/admin/demandas/areas`)
  return {}
}
```

Criar `src/actions/admin/editar-area-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function editarAreaDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const areaId = formData.get('areaId') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.areaDemanda.updateMany({
    where: { id: areaId, gabineteId: gabinete.id },
    data: { nome },
  })
  revalidatePath(`/${slug}/admin/demandas/areas`)
  return {}
}
```

Criar `src/actions/admin/excluir-area-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function excluirAreaDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const areaId = formData.get('areaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  const emUso = await prisma.demanda.count({ where: { areaId, gabineteId: gabinete.id } })
  if (emUso > 0) return { erro: 'Esta área possui demandas vinculadas e não pode ser excluída' }

  await prisma.areaDemanda.deleteMany({ where: { id: areaId, gabineteId: gabinete.id } })
  revalidatePath(`/${slug}/admin/demandas/areas`)
  return {}
}
```

- [ ] **Step 2: Criar página de áreas**

Criar `src/app/[slug]/admin/demandas/areas/page.tsx`:
```typescript
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarAreaDemanda } from '@/actions/admin/criar-area-demanda'
import { excluirAreaDemanda } from '@/actions/admin/excluir-area-demanda'

export default async function AreasPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const areas = await prisma.areaDemanda.findMany({
    where: { gabineteId: gabinete.id },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, _count: { select: { demandas: true } } },
  })

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Áreas de Demanda</h1>

      <form action={criarAreaDemanda} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova área"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Criar
        </button>
      </form>

      <ul className="divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
        {areas.map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-900">
              {a.nome}
              <span className="ml-2 text-xs text-gray-400">({a._count.demandas} demandas)</span>
            </span>
            {a._count.demandas === 0 && (
              <form action={excluirAreaDemanda}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="areaId" value={a.id} />
                <button type="submit" className="text-red-600 text-xs hover:underline">
                  Excluir
                </button>
              </form>
            )}
          </li>
        ))}
        {areas.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma área cadastrada</li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Criar action de configuração**

Criar `src/actions/admin/salvar-configuracao.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function salvarConfiguracao(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const prazoDemandasHoras = Number(formData.get('prazoDemandasHoras'))
  const alertaExpiracaoHoras = Number(formData.get('alertaExpiracaoHoras'))

  if (!prazoDemandasHoras || prazoDemandasHoras < 1) return { erro: 'Prazo inválido' }
  if (!alertaExpiracaoHoras || alertaExpiracaoHoras < 1) return { erro: 'Alerta inválido' }

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.configuracaoSistema.upsert({
    where: { gabineteId: gabinete.id },
    update: { prazoDemandasHoras, alertaExpiracaoHoras },
    create: { gabineteId: gabinete.id, prazoDemandasHoras, alertaExpiracaoHoras },
  })

  revalidatePath(`/${slug}/admin/configuracoes`)
  return {}
}
```

- [ ] **Step 4: Criar página de configurações**

Criar `src/app/[slug]/admin/configuracoes/page.tsx`:
```typescript
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { salvarConfiguracao } from '@/actions/admin/salvar-configuracao'

export default async function ConfiguracoesPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const config = await prisma.configuracaoSistema.findUnique({
    where: { gabineteId: gabinete.id },
  })

  const prazoAtual = config?.prazoDemandasHoras ?? 72
  const alertaAtual = config?.alertaExpiracaoHoras ?? 12

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-base font-semibold mb-4">Demandas</h2>
        <form action={salvarConfiguracao} className="space-y-4">
          <input type="hidden" name="slug" value={params.slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Prazo padrão de desfecho (horas)
            </label>
            <input
              name="prazoDemandasHoras"
              type="number"
              min={1}
              required
              defaultValue={prazoAtual}
              className="mt-1 block w-40 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Horas a partir da abertura da demanda. Padrão: 72h</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Alerta de expiração (horas antes)
            </label>
            <input
              name="alertaExpiracaoHoras"
              type="number"
              min={1}
              required
              defaultValue={alertaAtual}
              className="mt-1 block w-40 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Envia alerta por e-mail X horas antes de expirar. Padrão: 12h</p>
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Salvar
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Adicionar links de navegação no layout do admin**

Em `src/app/[slug]/admin/layout.tsx`, no array de links do `<nav>`, adicionar:
```typescript
{ href: `/${params.slug}/admin/demandas`, label: 'Demandas' },
{ href: `/${params.slug}/admin/configuracoes`, label: 'Configurações' },
```

- [ ] **Step 6: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/actions/admin/criar-area-demanda.ts src/actions/admin/editar-area-demanda.ts src/actions/admin/excluir-area-demanda.ts src/actions/admin/salvar-configuracao.ts src/app/[slug]/admin/demandas/areas/ src/app/[slug]/admin/configuracoes/ src/app/[slug]/admin/layout.tsx
git commit -m "feat: CRUD de áreas de demanda e configurações do sistema"
```

---

### Task 4: Server Actions de Demanda (admin)

**Files:**
- Create: `src/actions/admin/criar-demanda.ts`
- Create: `src/actions/admin/atualizar-observacao-demanda.ts`
- Create: `src/actions/admin/alterar-prazo-demanda.ts`
- Create: `src/actions/admin/marcar-desfecho-demanda.ts`
- Create: `src/actions/admin/reatribuir-responsavel.ts`

**Interfaces:**
- Produces:
  - `criarDemanda(formData): Promise<{ erro?: string; demandaId?: string }>`
  - `atualizarObservacaoDemanda(formData): Promise<{ erro?: string }>`
  - `alterarPrazoDemanda(formData): Promise<{ erro?: string }>`
  - `marcarDesfechoDemanda(formData): Promise<{ erro?: string }>`
  - `reatribuirResponsavel(formData): Promise<{ erro?: string }>`

- [ ] **Step 1: Criar criarDemanda**

Criar `src/actions/admin/criar-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

async function getAutorId(gabineteId: string): Promise<string | null> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const p = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId },
    select: { id: true },
  })
  return p?.id ?? null
}

export async function criarDemanda(formData: FormData): Promise<{ erro?: string; demandaId?: string }> {
  const slug = formData.get('slug') as string
  const titulo = (formData.get('titulo') as string).trim()
  const descricao = (formData.get('descricao') as string).trim()
  const solicitanteId = formData.get('solicitanteId') as string
  const responsavelId = formData.get('responsavelId') as string
  const areaId = formData.get('areaId') as string
  const prazoCustom = formData.get('prazoDesfecho') as string | null

  if (!titulo || !descricao || !solicitanteId || !responsavelId || !areaId) {
    return { erro: 'Preencha todos os campos obrigatórios' }
  }

  const { gabinete } = await assertAdminAccess(slug)

  const config = await prisma.configuracaoSistema.findUnique({
    where: { gabineteId: gabinete.id },
  })
  const horasPrazo = config?.prazoDemandasHoras ?? 72

  const prazoDesfecho = prazoCustom
    ? new Date(prazoCustom)
    : new Date(Date.now() + horasPrazo * 60 * 60 * 1000)

  const criadoPorId = await getAutorId(gabinete.id)
  if (!criadoPorId) return { erro: 'Não foi possível identificar o autor' }

  const demanda = await prisma.demanda.create({
    data: {
      gabineteId: gabinete.id,
      titulo,
      descricao,
      solicitanteId,
      responsavelId,
      areaId,
      prazoDesfecho,
      criadoPorId,
      historico: {
        create: {
          tipo: 'criacao',
          descricao: 'Demanda criada',
          autorId: criadoPorId,
        },
      },
    },
  })

  revalidatePath(`/${slug}/admin/demandas`)
  return { demandaId: demanda.id }
}
```

- [ ] **Step 2: Criar atualizarObservacaoDemanda**

Criar `src/actions/admin/atualizar-observacao-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function atualizarObservacaoDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const observacao = (formData.get('observacao') as string).trim()

  const { gabinete } = await assertAdminAccess(slug)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { erro: 'Não autenticado' }

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true, nome: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { observacao },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'observacao',
      descricao: observacao,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  return {}
}
```

- [ ] **Step 3: Criar alterarPrazoDemanda**

Criar `src/actions/admin/alterar-prazo-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function alterarPrazoDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const novoPrazo = formData.get('novoPrazo') as string
  const justificativa = (formData.get('justificativa') as string).trim()

  if (!novoPrazo) return { erro: 'Informe o novo prazo' }
  if (!justificativa) return { erro: 'Justificativa é obrigatória' }

  const { gabinete } = await assertAdminAccess(slug)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { erro: 'Não autenticado' }

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
    select: { prazoDesfecho: true },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }

  const prazoAnterior = demanda.prazoDesfecho.toISOString()
  const prazoNovo = new Date(novoPrazo)

  await prisma.demanda.update({
    where: { id: demandaId },
    data: { prazoDesfecho: prazoNovo, prazoAlterado: true, observacao: justificativa },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'prazo_alterado',
      descricao: `Prazo alterado de ${new Date(prazoAnterior).toLocaleDateString('pt-BR')} para ${prazoNovo.toLocaleDateString('pt-BR')}. Justificativa: ${justificativa}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  return {}
}
```

- [ ] **Step 4: Criar marcarDesfechoDemanda**

Criar `src/actions/admin/marcar-desfecho-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function marcarDesfechoDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const desfecho = formData.get('desfecho') as 'atendida' | 'nao_atendida'

  if (!['atendida', 'nao_atendida'].includes(desfecho)) return { erro: 'Desfecho inválido' }

  const { gabinete } = await assertAdminAccess(slug)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { erro: 'Não autenticado' }

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true, nome: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { status: desfecho },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'status_alterado',
      descricao: desfecho === 'atendida' ? `Demanda marcada como atendida por ${pessoa.nome}` : `Demanda marcada como não atendida por ${pessoa.nome}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  revalidatePath(`/${slug}/admin/demandas`)
  return {}
}
```

- [ ] **Step 5: Criar reatribuirResponsavel**

Criar `src/actions/admin/reatribuir-responsavel.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function reatribuirResponsavel(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const novoResponsavelId = formData.get('novoResponsavelId') as string

  if (!novoResponsavelId) return { erro: 'Selecione um responsável' }

  const { gabinete } = await assertAdminAccess(slug)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { erro: 'Não autenticado' }

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
    select: { responsavel: { select: { nome: true } } },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }

  const novoResponsavel = await prisma.pessoa.findFirst({
    where: { id: novoResponsavelId, gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
    select: { nome: true },
  })
  if (!novoResponsavel) return { erro: 'Responsável não encontrado' }

  await prisma.demanda.update({
    where: { id: demandaId },
    data: { responsavelId: novoResponsavelId },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'responsavel_alterado',
      descricao: `Responsável alterado de ${demanda.responsavel.nome} para ${novoResponsavel.nome}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  return {}
}
```

- [ ] **Step 6: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/actions/admin/criar-demanda.ts src/actions/admin/atualizar-observacao-demanda.ts src/actions/admin/alterar-prazo-demanda.ts src/actions/admin/marcar-desfecho-demanda.ts src/actions/admin/reatribuir-responsavel.ts
git commit -m "feat: server actions de demanda (criar, observação, prazo, desfecho, reatribuição)"
```

---

### Task 5: Formulário de Nova Demanda

**Files:**
- Create: `src/app/[slug]/admin/demandas/nova/page.tsx`

- [ ] **Step 1: Criar página de nova demanda**

Criar `src/app/[slug]/admin/demandas/nova/page.tsx`:
```typescript
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarDemanda } from '@/actions/admin/criar-demanda'

export default async function NovaDemandaPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; solicitanteId?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const [areas, colaboradores, config] = await Promise.all([
    prisma.areaDemanda.findMany({
      where: { gabineteId: gabinete.id },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.configuracaoSistema.findUnique({ where: { gabineteId: gabinete.id } }),
  ])

  const horasPrazo = config?.prazoDemandasHoras ?? 72
  const prazoSugerido = new Date(Date.now() + horasPrazo * 60 * 60 * 1000)
  const prazoISO = prazoSugerido.toISOString().slice(0, 16)

  // Busca de solicitante
  const q = searchParams.q?.trim() ?? ''
  const solicitanteId = searchParams.solicitanteId ?? ''

  const resultadosBusca = q
    ? await prisma.pessoa.findMany({
        where: {
          gabineteId: gabinete.id,
          OR: [
            { nome: { contains: q, mode: 'insensitive' } },
            { whatsapp: { contains: q } },
          ],
        },
        take: 10,
        select: { id: true, nome: true, whatsapp: true, regiao: { select: { nome: true } } },
      })
    : []

  const solicitante = solicitanteId
    ? await prisma.pessoa.findFirst({
        where: { id: solicitanteId, gabineteId: gabinete.id },
        select: { id: true, nome: true, whatsapp: true, bairro: true, logradouro: true, numero: true, complemento: true, cep: true, regiao: { select: { nome: true } } },
      })
    : null

  async function handleCriar(formData: FormData) {
    'use server'
    const result = await criarDemanda(formData)
    if (result.demandaId) {
      redirect(`/${params.slug}/admin/demandas/${result.demandaId}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Nova Demanda</h1>

      {/* Busca de solicitante */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Solicitante</h2>

        {solicitante ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{solicitante.nome}</p>
                <p className="text-xs text-gray-500">{solicitante.whatsapp} · {solicitante.regiao?.nome ?? 'Sem região'}</p>
              </div>
              <a href={`/${params.slug}/admin/demandas/nova`} className="text-xs text-blue-600 hover:underline">
                Trocar
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <form method="GET" className="flex gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="Buscar por nome ou WhatsApp..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm">
                Buscar
              </button>
            </form>

            {resultadosBusca.length > 0 && (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                {resultadosBusca.map((p) => (
                  <li key={p.id}>
                    <a
                      href={`/${params.slug}/admin/demandas/nova?solicitanteId=${p.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                        <p className="text-xs text-gray-500">{p.whatsapp}</p>
                      </div>
                      <span className="text-xs text-blue-600">Selecionar →</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {q && resultadosBusca.length === 0 && (
              <p className="text-sm text-gray-500">Nenhuma pessoa encontrada para &ldquo;{q}&rdquo;.</p>
            )}
          </div>
        )}
      </div>

      {/* Formulário principal — só aparece quando solicitante selecionado */}
      {solicitante && (
        <form action={handleCriar} className="space-y-6">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="solicitanteId" value={solicitante.id} />

          <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold">Dados da Demanda</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700">Título *</label>
              <input
                name="titulo"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Descrição *</label>
              <textarea
                name="descricao"
                required
                rows={4}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Área *</label>
                <select
                  name="areaId"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Responsável *</label>
                <select
                  name="responsavelId"
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {colaboradores.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Prazo de desfecho (sugestão: {horasPrazo}h)
              </label>
              <input
                name="prazoDesfecho"
                type="datetime-local"
                defaultValue={prazoISO}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Abrir Demanda
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/admin/demandas/nova/
git commit -m "feat: formulário de nova demanda com busca de solicitante"
```

---

### Task 6: Listagem de Demandas com Dashboard

**Files:**
- Create: `src/app/[slug]/admin/demandas/page.tsx`

- [ ] **Step 1: Criar listagem de demandas**

Criar `src/app/[slug]/admin/demandas/page.tsx`:
```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

const STATUS_CONFIG = {
  aberta: { label: 'Em aberto', cor: 'bg-yellow-100 text-yellow-800' },
  expirada: { label: 'Expirada', cor: 'bg-orange-100 text-orange-800' },
  atendida: { label: 'Atendida', cor: 'bg-green-100 text-green-800' },
  nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
} as const

const PAGE_SIZE = 20

export default async function DemandasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: {
    status?: string
    areaId?: string
    responsavelId?: string
    regiaoId?: string
    prazoAlterado?: string
    dataInicio?: string
    dataFim?: string
    pagina?: string
  }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const pagina = Math.max(1, Number(searchParams.pagina ?? 1))

  // Período padrão: últimos 30 dias (apenas quando não há filtros)
  const temFiltro = !!(searchParams.status || searchParams.areaId || searchParams.responsavelId || searchParams.regiaoId || searchParams.prazoAlterado || searchParams.dataInicio || searchParams.dataFim)
  const dataInicioPadrao = new Date()
  dataInicioPadrao.setDate(dataInicioPadrao.getDate() - 30)
  dataInicioPadrao.setHours(0, 0, 0, 0)

  const where = {
    gabineteId: gabinete.id,
    ...(searchParams.status ? { status: searchParams.status } : {}),
    ...(searchParams.areaId ? { areaId: searchParams.areaId } : {}),
    ...(searchParams.responsavelId ? { responsavelId: searchParams.responsavelId } : {}),
    ...(searchParams.regiaoId ? { solicitante: { regiaoId: searchParams.regiaoId } } : {}),
    ...(searchParams.prazoAlterado ? { prazoAlterado: searchParams.prazoAlterado === 'sim' } : {}),
    ...(!temFiltro
      ? { criadoEm: { gte: dataInicioPadrao } }
      : {
          criadoEm: {
            ...(searchParams.dataInicio ? { gte: new Date(`${searchParams.dataInicio}T00:00:00`) } : {}),
            ...(searchParams.dataFim ? { lte: new Date(`${searchParams.dataFim}T23:59:59.999`) } : {}),
          },
        }),
  }

  const [demandas, total, contagens, areas, colaboradores, regioes] = await Promise.all([
    prisma.demanda.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip: (pagina - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        titulo: true,
        status: true,
        prazoDesfecho: true,
        prazoAlterado: true,
        criadoEm: true,
        solicitante: { select: { nome: true } },
        responsavel: { select: { nome: true } },
        area: { select: { nome: true } },
      },
    }),
    prisma.demanda.count({ where }),
    prisma.demanda.groupBy({
      by: ['status'],
      where: { gabineteId: gabinete.id },
      _count: { id: true },
    }),
    prisma.areaDemanda.findMany({ where: { gabineteId: gabinete.id }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.pessoa.findMany({ where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])

  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  const contagemPorStatus = Object.fromEntries(contagens.map((c) => [c.status, c._count.id]))
  const totalPrazoAlterado = await prisma.demanda.count({ where: { gabineteId: gabinete.id, prazoAlterado: true } })

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Demandas</h1>
        <Link href={`/${params.slug}/admin/demandas/nova`} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          + Nova demanda
        </Link>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { key: 'aberta', label: 'Em aberto', cor: 'text-yellow-600' },
          { key: 'expirada', label: 'Expiradas', cor: 'text-orange-600' },
          { key: 'atendida', label: 'Atendidas', cor: 'text-green-600' },
          { key: 'nao_atendida', label: 'Não atendidas', cor: 'text-red-600' },
        ].map(({ key, label, cor }) => (
          <div key={key} className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${cor}`}>{contagemPorStatus[key] ?? 0}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium">Prazo alterado</p>
          <p className="text-2xl font-bold mt-1 text-gray-700">{totalPrazoAlterado}</p>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <select name="status" defaultValue={searchParams.status ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos os status</option>
            <option value="aberta">Em aberto</option>
            <option value="expirada">Expirada</option>
            <option value="atendida">Atendida</option>
            <option value="nao_atendida">Não atendida</option>
          </select>

          <select name="areaId" defaultValue={searchParams.areaId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas as áreas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>

          <select name="responsavelId" defaultValue={searchParams.responsavelId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos os responsáveis</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>

          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas as regiões</option>
            {regioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>

          <select name="prazoAlterado" defaultValue={searchParams.prazoAlterado ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Prazo alterado: todos</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>

          <button type="submit" className="bg-gray-700 text-white px-4 py-1.5 rounded-md text-sm">
            Filtrar
          </button>
        </div>

        <div className="flex gap-3 mt-3">
          <input name="dataInicio" type="date" defaultValue={searchParams.dataInicio ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input name="dataFim" type="date" defaultValue={searchParams.dataFim ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <a href={`/${params.slug}/admin/demandas`} className="text-sm text-gray-500 hover:text-gray-700 self-center">
            Limpar filtros
          </a>
        </div>
      </form>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Solicitante</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Responsável</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Área</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Prazo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {demandas.map((d) => {
              const cfg = STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG] ?? { label: d.status, cor: 'bg-gray-100 text-gray-800' }
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/${params.slug}/admin/demandas/${d.id}`} className="text-blue-600 hover:underline font-medium">
                      {d.titulo}
                      {d.prazoAlterado && <span className="ml-1 text-xs text-orange-500">⚑</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.solicitante.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{d.responsavel.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{d.area.nome}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {d.prazoDesfecho.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cor}`}>
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              )
            })}
            {demandas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nenhuma demanda encontrada</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/${params.slug}/admin/demandas?pagina=${p}&${new URLSearchParams({ ...(searchParams.status ? { status: searchParams.status } : {}), ...(searchParams.areaId ? { areaId: searchParams.areaId } : {}) }).toString()}`}
              className={`px-3 py-1 rounded text-sm ${p === pagina ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/admin/demandas/page.tsx
git commit -m "feat: listagem de demandas com filtros e dashboard de cards"
```

---

### Task 7: Tela de Detalhe da Demanda (Admin)

**Files:**
- Create: `src/app/[slug]/admin/demandas/[demandaId]/page.tsx`

- [ ] **Step 1: Criar página de detalhe**

Criar `src/app/[slug]/admin/demandas/[demandaId]/page.tsx`:
```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { atualizarObservacaoDemanda } from '@/actions/admin/atualizar-observacao-demanda'
import { alterarPrazoDemanda } from '@/actions/admin/alterar-prazo-demanda'
import { marcarDesfechoDemanda } from '@/actions/admin/marcar-desfecho-demanda'
import { reatribuirResponsavel } from '@/actions/admin/reatribuir-responsavel'

const STATUS_CONFIG = {
  aberta: { label: 'Em aberto', cor: 'bg-yellow-100 text-yellow-800' },
  expirada: { label: 'Expirada', cor: 'bg-orange-100 text-orange-800' },
  atendida: { label: 'Atendida', cor: 'bg-green-100 text-green-800' },
  nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
} as const

export default async function DetalheDemandaPage({
  params,
}: {
  params: { slug: string; demandaId: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const [demanda, colaboradores] = await Promise.all([
    prisma.demanda.findFirst({
      where: { id: params.demandaId, gabineteId: gabinete.id },
      include: {
        solicitante: { select: { nome: true, whatsapp: true, bairro: true, logradouro: true, numero: true, complemento: true, cep: true, regiao: { select: { nome: true } } } },
        responsavel: { select: { id: true, nome: true } },
        area: { select: { nome: true } },
        criadoPor: { select: { nome: true } },
        historico: { orderBy: { criadoEm: 'asc' }, include: { autor: { select: { nome: true } } } },
      },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  if (!demanda) notFound()

  const cfg = STATUS_CONFIG[demanda.status as keyof typeof STATUS_CONFIG] ?? { label: demanda.status, cor: 'bg-gray-100 text-gray-800' }
  const podeEncerrar = demanda.status === 'aberta' || demanda.status === 'expirada'
  const prazoISO = demanda.prazoDesfecho.toISOString().slice(0, 16)

  const endereco = [demanda.solicitante.logradouro, demanda.solicitante.numero, demanda.solicitante.complemento, demanda.solicitante.bairro, demanda.solicitante.cep]
    .filter(Boolean).join(', ')

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/${params.slug}/admin/demandas`} className="hover:underline">Demandas</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{demanda.titulo}</span>
      </div>

      {/* Cabeçalho */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900">{demanda.titulo}</h1>
          <span className={`shrink-0 inline-block text-xs px-2 py-1 rounded-full font-medium ${cfg.cor}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{demanda.descricao}</p>
        <div className="flex flex-wrap gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span>Área: <strong>{demanda.area.nome}</strong></span>
          <span>Criado em: <strong>{demanda.criadoEm.toLocaleDateString('pt-BR')}</strong> por {demanda.criadoPor.nome}</span>
          <span className={demanda.prazoAlterado ? 'text-orange-600 font-medium' : ''}>
            Prazo: <strong>{demanda.prazoDesfecho.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
            {demanda.prazoAlterado && ' ⚑ alterado'}
          </span>
        </div>
      </div>

      {/* Solicitante */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-1">
        <h2 className="text-base font-semibold mb-2">Solicitante</h2>
        <p className="text-sm font-medium text-gray-900">{demanda.solicitante.nome}</p>
        <p className="text-sm text-gray-600">{demanda.solicitante.whatsapp}</p>
        {demanda.solicitante.regiao && <p className="text-sm text-gray-600">Região: {demanda.solicitante.regiao.nome}</p>}
        {endereco && <p className="text-sm text-gray-600">{endereco}</p>}
      </div>

      {/* Responsável */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
        <h2 className="text-base font-semibold">Responsável</h2>
        <p className="text-sm font-medium text-gray-900">{demanda.responsavel.nome}</p>
        <details className="text-sm">
          <summary className="cursor-pointer text-blue-600 hover:underline">Reatribuir responsável</summary>
          <form action={reatribuirResponsavel} className="mt-3 flex gap-2">
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="demandaId" value={demanda.id} />
            <select name="novoResponsavelId" required className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option value="">Selecionar...</option>
              {colaboradores.filter((c) => c.id !== demanda.responsavel.id).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm">
              Confirmar
            </button>
          </form>
        </details>
      </div>

      {/* Observação */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
        <h2 className="text-base font-semibold">Observação</h2>
        {demanda.observacao && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3">{demanda.observacao}</p>
        )}
        <form action={atualizarObservacaoDemanda} className="space-y-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="demandaId" value={demanda.id} />
          <textarea
            name="observacao"
            rows={3}
            defaultValue={demanda.observacao ?? ''}
            placeholder="Adicionar ou atualizar observação..."
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            Salvar observação
          </button>
        </form>
      </div>

      {/* Alterar prazo */}
      {podeEncerrar && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
          <h2 className="text-base font-semibold">Alterar prazo</h2>
          <form action={alterarPrazoDemanda} className="space-y-3">
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="demandaId" value={demanda.id} />
            <input
              name="novoPrazo"
              type="datetime-local"
              defaultValue={prazoISO}
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <textarea
              name="justificativa"
              required
              rows={2}
              placeholder="Justificativa obrigatória..."
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium">
              Alterar prazo
            </button>
          </form>
        </div>
      )}

      {/* Desfecho */}
      {podeEncerrar && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
          <h2 className="text-base font-semibold">Desfecho</h2>
          <div className="flex gap-3">
            <form action={marcarDesfechoDemanda}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="demandaId" value={demanda.id} />
              <input type="hidden" name="desfecho" value="atendida" />
              <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700">
                ✓ Marcar como Atendida
              </button>
            </form>
            <form action={marcarDesfechoDemanda}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="demandaId" value={demanda.id} />
              <input type="hidden" name="desfecho" value="nao_atendida" />
              <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700">
                ✗ Marcar como Não Atendida
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Linha do tempo */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Histórico</h2>
        <ol className="relative border-l border-gray-200 space-y-4 ml-3">
          {demanda.historico.map((mov) => (
            <li key={mov.id} className="ml-4">
              <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-gray-400" />
              <p className="text-xs text-gray-400">
                {mov.criadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{mov.autor.nome}
              </p>
              <p className="text-sm text-gray-700 mt-0.5">{mov.descricao}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/admin/demandas/[demandaId]/
git commit -m "feat: tela de detalhe da demanda com histórico e ações"
```

---

### Task 8: Painel do Mobilizador — Demandas

**Files:**
- Create: `src/actions/mobilizador/atualizar-observacao-demanda.ts`
- Create: `src/actions/mobilizador/alterar-prazo-demanda.ts`
- Create: `src/actions/mobilizador/marcar-desfecho-demanda.ts`
- Modify: `src/app/[slug]/mobilizador/page.tsx`
- Create: `src/app/[slug]/mobilizador/demandas/[demandaId]/page.tsx`

- [ ] **Step 1: Criar actions do mobilizador**

Criar `src/actions/mobilizador/atualizar-observacao-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'

export async function atualizarObservacaoDemandaMobilizador(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const observacao = (formData.get('observacao') as string).trim()

  const { gabinete, pessoa } = await assertMobilizadorAccess(slug)

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id, responsavelId: pessoa.id },
  })
  if (!demanda) return { erro: 'Demanda não encontrada ou sem permissão' }

  await prisma.demanda.update({ where: { id: demandaId }, data: { observacao } })
  await prisma.movimentacaoDemanda.create({
    data: { demandaId, tipo: 'observacao', descricao: observacao, autorId: pessoa.id },
  })

  revalidatePath(`/${slug}/mobilizador/demandas/${demandaId}`)
  return {}
}
```

Criar `src/actions/mobilizador/alterar-prazo-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'

export async function alterarPrazoDemandaMobilizador(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const novoPrazo = formData.get('novoPrazo') as string
  const justificativa = (formData.get('justificativa') as string).trim()

  if (!novoPrazo) return { erro: 'Informe o novo prazo' }
  if (!justificativa) return { erro: 'Justificativa é obrigatória' }

  const { gabinete, pessoa } = await assertMobilizadorAccess(slug)

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id, responsavelId: pessoa.id },
    select: { prazoDesfecho: true },
  })
  if (!demanda) return { erro: 'Demanda não encontrada ou sem permissão' }

  const prazoNovo = new Date(novoPrazo)
  await prisma.demanda.update({
    where: { id: demandaId },
    data: { prazoDesfecho: prazoNovo, prazoAlterado: true, observacao: justificativa },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'prazo_alterado',
      descricao: `Prazo alterado para ${prazoNovo.toLocaleDateString('pt-BR')}. Justificativa: ${justificativa}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/mobilizador/demandas/${demandaId}`)
  return {}
}
```

Criar `src/actions/mobilizador/marcar-desfecho-demanda.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'

export async function marcarDesfechoDemandaMobilizador(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const desfecho = formData.get('desfecho') as 'atendida' | 'nao_atendida'

  if (!['atendida', 'nao_atendida'].includes(desfecho)) return { erro: 'Desfecho inválido' }

  const { gabinete, pessoa } = await assertMobilizadorAccess(slug)

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id, responsavelId: pessoa.id },
  })
  if (!demanda) return { erro: 'Demanda não encontrada ou sem permissão' }

  await prisma.demanda.update({ where: { id: demandaId }, data: { status: desfecho } })
  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'status_alterado',
      descricao: desfecho === 'atendida' ? `Marcada como atendida por ${pessoa.nome}` : `Marcada como não atendida por ${pessoa.nome}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/mobilizador/demandas/${demandaId}`)
  revalidatePath(`/${slug}/mobilizador`)
  return {}
}
```

- [ ] **Step 2: Adicionar seção "Minhas Demandas" ao page.tsx do mobilizador**

Em `src/app/[slug]/mobilizador/page.tsx`, após o bloco de `convidados` e antes do bloco de `AtualizarSenhaForm`, adicionar:

```typescript
  const minhasDemandas = await prisma.demanda.findMany({
    where: { gabineteId: gabinete.id, responsavelId: pessoa.id },
    orderBy: { prazoDesfecho: 'asc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      area: { select: { nome: true } },
    },
  })
```

E no JSX, antes da seção de atualizar senha, adicionar:
```typescript
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-gray-800">
          Minhas Demandas ({minhasDemandas.length})
        </h2>
        {minhasDemandas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma demanda atribuída.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {minhasDemandas.map((d) => {
              const statusCor = { aberta: 'text-yellow-600', expirada: 'text-orange-600', atendida: 'text-green-600', nao_atendida: 'text-red-600' }[d.status] ?? 'text-gray-600'
              const statusLabel = { aberta: 'Em aberto', expirada: 'Expirada', atendida: 'Atendida', nao_atendida: 'Não atendida' }[d.status] ?? d.status
              return (
                <li key={d.id} className="py-3">
                  <a href={`/${params.slug}/mobilizador/demandas/${d.id}`} className="flex items-center justify-between hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{d.titulo}</p>
                      <p className="text-xs text-gray-500">{d.area.nome} · Prazo: {d.prazoDesfecho.toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span className={`text-xs font-medium ${statusCor}`}>{statusLabel}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </section>
```

- [ ] **Step 3: Criar tela de detalhe do mobilizador**

Criar `src/app/[slug]/mobilizador/demandas/[demandaId]/page.tsx`:
```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { atualizarObservacaoDemandaMobilizador } from '@/actions/mobilizador/atualizar-observacao-demanda'
import { alterarPrazoDemandaMobilizador } from '@/actions/mobilizador/alterar-prazo-demanda'
import { marcarDesfechoDemandaMobilizador } from '@/actions/mobilizador/marcar-desfecho-demanda'

const STATUS_CONFIG = {
  aberta: { label: 'Em aberto', cor: 'bg-yellow-100 text-yellow-800' },
  expirada: { label: 'Expirada', cor: 'bg-orange-100 text-orange-800' },
  atendida: { label: 'Atendida', cor: 'bg-green-100 text-green-800' },
  nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
} as const

export default async function DetalheDemandaMobilizadorPage({
  params,
}: {
  params: { slug: string; demandaId: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) notFound()

  const mobilizador = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true },
  })
  if (!mobilizador) notFound()

  const demanda = await prisma.demanda.findFirst({
    where: { id: params.demandaId, gabineteId: gabinete.id, responsavelId: mobilizador.id },
    include: {
      solicitante: { select: { nome: true, whatsapp: true } },
      area: { select: { nome: true } },
      historico: { orderBy: { criadoEm: 'asc' }, include: { autor: { select: { nome: true } } } },
    },
  })
  if (!demanda) notFound()

  const cfg = STATUS_CONFIG[demanda.status as keyof typeof STATUS_CONFIG] ?? { label: demanda.status, cor: 'bg-gray-100 text-gray-800' }
  const podeEncerrar = demanda.status === 'aberta' || demanda.status === 'expirada'
  const prazoISO = demanda.prazoDesfecho.toISOString().slice(0, 16)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/${params.slug}/mobilizador`} className="hover:underline">← Voltar</Link>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-bold text-gray-900">{demanda.titulo}</h1>
          <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${cfg.cor}`}>{cfg.label}</span>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{demanda.descricao}</p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span>Área: <strong>{demanda.area.nome}</strong></span>
          <span>Solicitante: <strong>{demanda.solicitante.nome}</strong> · {demanda.solicitante.whatsapp}</span>
          <span className={demanda.prazoAlterado ? 'text-orange-600 font-medium' : ''}>
            Prazo: <strong>{demanda.prazoDesfecho.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold">Observação</h2>
        <form action={atualizarObservacaoDemandaMobilizador} className="space-y-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="demandaId" value={demanda.id} />
          <textarea
            name="observacao"
            rows={3}
            defaultValue={demanda.observacao ?? ''}
            placeholder="Adicionar observação..."
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm">
            Salvar
          </button>
        </form>
      </div>

      {podeEncerrar && (
        <>
          <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
            <h2 className="text-base font-semibold">Alterar prazo</h2>
            <form action={alterarPrazoDemandaMobilizador} className="space-y-3">
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="demandaId" value={demanda.id} />
              <input name="novoPrazo" type="datetime-local" defaultValue={prazoISO} required className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <textarea name="justificativa" required rows={2} placeholder="Justificativa..." className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm">Alterar prazo</button>
            </form>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
            <h2 className="text-base font-semibold">Encerrar demanda</h2>
            <div className="flex gap-3">
              <form action={marcarDesfechoDemandaMobilizador}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="demandaId" value={demanda.id} />
                <input type="hidden" name="desfecho" value="atendida" />
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium">✓ Atendida</button>
              </form>
              <form action={marcarDesfechoDemandaMobilizador}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="demandaId" value={demanda.id} />
                <input type="hidden" name="desfecho" value="nao_atendida" />
                <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium">✗ Não atendida</button>
              </form>
            </div>
          </div>
        </>
      )}

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold">Histórico</h2>
        <ol className="relative border-l border-gray-200 space-y-4 ml-3">
          {demanda.historico.map((mov) => (
            <li key={mov.id} className="ml-4">
              <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-gray-400" />
              <p className="text-xs text-gray-400">
                {mov.criadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{mov.autor.nome}
              </p>
              <p className="text-sm text-gray-700 mt-0.5">{mov.descricao}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/mobilizador/ src/app/[slug]/mobilizador/
git commit -m "feat: painel do mobilizador — seção demandas e tela de detalhe"
```

---

### Task 9: Email + Cron de Expiração

**Files:**
- Create: `src/lib/email.ts`
- Create: `src/lib/__tests__/email.test.ts`
- Create: `src/app/api/cron/verificar-demandas/route.ts`

**Interfaces:**
- Produces: `enviarEmail({ para: string; assunto: string; html: string }): Promise<void>`

- [ ] **Step 1: Instalar Resend**

```bash
npm install resend
```

- [ ] **Step 2: Adicionar variável de ambiente**

Adicionar ao `.env.local` (e ao `.env.local.example`):
```
RESEND_API_KEY=re_xxxxxxxxxxxx
REMETENTE_EMAIL=noreply@redemobiliza.com.br
CRON_SECRET=gerar-um-valor-aleatorio-seguro-aqui
```

- [ ] **Step 3: Criar lib/email.ts**

Criar `src/lib/email.ts`:
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.REMETENTE_EMAIL ?? 'noreply@redemobiliza.com.br'

export interface EmailPayload {
  para: string
  assunto: string
  html: string
}

export async function enviarEmail({ para, assunto, html }: EmailPayload): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to: para,
    subject: assunto,
    html,
  })
  if (error) throw new Error(`Falha ao enviar e-mail: ${error.message}`)
}

export function templateDemandaAtribuida({
  nomeResponsavel,
  tituloDemanda,
  nomeSolicitante,
  prazo,
  urlDemanda,
}: {
  nomeResponsavel: string
  tituloDemanda: string
  nomeSolicitante: string
  prazo: Date
  urlDemanda: string
}): string {
  return `
    <p>Olá, ${nomeResponsavel}!</p>
    <p>Uma nova demanda foi atribuída a você:</p>
    <p><strong>${tituloDemanda}</strong></p>
    <p>Solicitante: ${nomeSolicitante}</p>
    <p>Prazo de desfecho: ${prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    <p><a href="${urlDemanda}">Acessar demanda →</a></p>
  `
}

export function templateAlertaExpiracao({
  nomeResponsavel,
  tituloDemanda,
  prazo,
  urlDemanda,
}: {
  nomeResponsavel: string
  tituloDemanda: string
  prazo: Date
  urlDemanda: string
}): string {
  return `
    <p>Olá, ${nomeResponsavel}!</p>
    <p>A demanda <strong>${tituloDemanda}</strong> está prestes a expirar.</p>
    <p>Prazo: ${prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    <p><a href="${urlDemanda}">Acessar demanda →</a></p>
  `
}

export function templateDemandaExpirada({
  nomeDestinatario,
  tituloDemanda,
  nomeSolicitante,
  urlDemanda,
}: {
  nomeDestinatario: string
  tituloDemanda: string
  nomeSolicitante: string
  urlDemanda: string
}): string {
  return `
    <p>Olá, ${nomeDestinatario}!</p>
    <p>A demanda <strong>${tituloDemanda}</strong> (solicitante: ${nomeSolicitante}) expirou sem desfecho.</p>
    <p><a href="${urlDemanda}">Acessar demanda →</a></p>
  `
}
```

- [ ] **Step 4: Escrever teste para email.ts**

Criar `src/lib/__tests__/email.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null })
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}))

import { enviarEmail, templateDemandaAtribuida, templateAlertaExpiracao, templateDemandaExpirada } from '@/lib/email'

describe('enviarEmail', () => {
  beforeEach(() => mockSend.mockClear())

  it('chama resend.emails.send com os parâmetros corretos', async () => {
    await enviarEmail({ para: 'test@test.com', assunto: 'Teste', html: '<p>ok</p>' })
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test@test.com',
      subject: 'Teste',
      html: '<p>ok</p>',
    }))
  })

  it('lança erro quando Resend retorna error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'API key inválida' } })
    await expect(enviarEmail({ para: 'x@x.com', assunto: 'x', html: 'x' }))
      .rejects.toThrow('Falha ao enviar e-mail')
  })
})

describe('templates', () => {
  it('templateDemandaAtribuida contém nome e título', () => {
    const html = templateDemandaAtribuida({
      nomeResponsavel: 'João',
      tituloDemanda: 'Cirurgia urgente',
      nomeSolicitante: 'Maria',
      prazo: new Date('2026-07-01T10:00:00'),
      urlDemanda: 'https://example.com/demanda/1',
    })
    expect(html).toContain('João')
    expect(html).toContain('Cirurgia urgente')
    expect(html).toContain('Maria')
  })

  it('templateAlertaExpiracao contém nome e link', () => {
    const html = templateAlertaExpiracao({
      nomeResponsavel: 'Ana',
      tituloDemanda: 'Escola',
      prazo: new Date(),
      urlDemanda: 'https://example.com/d/1',
    })
    expect(html).toContain('Ana')
    expect(html).toContain('https://example.com/d/1')
  })

  it('templateDemandaExpirada contém solicitante', () => {
    const html = templateDemandaExpirada({
      nomeDestinatario: 'Admin',
      tituloDemanda: 'Habitação',
      nomeSolicitante: 'Carlos',
      urlDemanda: 'https://example.com/d/2',
    })
    expect(html).toContain('Carlos')
    expect(html).toContain('Habitação')
  })
})
```

- [ ] **Step 5: Rodar testes de email**

```bash
npx vitest run src/lib/__tests__/email.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Integrar envio de email na criarDemanda**

Em `src/actions/admin/criar-demanda.ts`, após `prisma.demanda.create`, adicionar:

```typescript
// Enviar notificação ao responsável
const responsavel = await prisma.pessoa.findUnique({
  where: { id: responsavelId },
  select: { email: true, nome: true },
})
if (responsavel?.email) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const gabineteData = await prisma.gabinete.findUnique({ where: { id: gabinete.id }, select: { slug: true } })
  try {
    await enviarEmail({
      para: responsavel.email,
      assunto: `Nova demanda atribuída: ${titulo}`,
      html: templateDemandaAtribuida({
        nomeResponsavel: responsavel.nome,
        tituloDemanda: titulo,
        nomeSolicitante: (await prisma.pessoa.findUnique({ where: { id: solicitanteId }, select: { nome: true } }))?.nome ?? '',
        prazo: prazoDesfecho,
        urlDemanda: `${appUrl}/${gabineteData?.slug}/mobilizador/demandas/${demanda.id}`,
      }),
    })
  } catch {
    // falha no email não bloqueia a criação da demanda
  }
}
```

Adicionar imports no topo do arquivo:
```typescript
import { enviarEmail, templateDemandaAtribuida } from '@/lib/email'
```

- [ ] **Step 7: Criar a rota do cron**

Criar `src/app/api/cron/verificar-demandas/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enviarEmail, templateAlertaExpiracao, templateDemandaExpirada } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const agora = new Date()
  const appUrl = getAppUrl()
  let expiradas = 0
  let alertas = 0

  // 1. Marcar demandas expiradas
  const demandasExpiradas = await prisma.demanda.findMany({
    where: { status: 'aberta', prazoDesfecho: { lt: agora } },
    include: {
      gabinete: { select: { slug: true } },
      responsavel: { select: { nome: true, email: true } },
      solicitante: { select: { nome: true } },
      criadoPor: { select: { email: true, nome: true } },
    },
  })

  for (const demanda of demandasExpiradas) {
    await prisma.demanda.update({
      where: { id: demanda.id },
      data: { status: 'expirada' },
    })
    await prisma.movimentacaoDemanda.create({
      data: {
        demandaId: demanda.id,
        tipo: 'status_alterado',
        descricao: 'Demanda expirada automaticamente por ultrapassar o prazo',
        autorId: demanda.criadoPorId,
      },
    })

    const urlDemanda = `${appUrl}/${demanda.gabinete.slug}/admin/demandas/${demanda.id}`

    if (demanda.responsavel.email) {
      try {
        await enviarEmail({
          para: demanda.responsavel.email,
          assunto: `Demanda expirada: ${demanda.titulo}`,
          html: templateDemandaExpirada({
            nomeDestinatario: demanda.responsavel.nome,
            tituloDemanda: demanda.titulo,
            nomeSolicitante: demanda.solicitante.nome,
            urlDemanda,
          }),
        })
      } catch { /* não bloqueia */ }
    }

    if (demanda.criadoPor.email && demanda.criadoPor.email !== demanda.responsavel.email) {
      try {
        await enviarEmail({
          para: demanda.criadoPor.email,
          assunto: `Demanda expirada: ${demanda.titulo}`,
          html: templateDemandaExpirada({
            nomeDestinatario: demanda.criadoPor.nome,
            tituloDemanda: demanda.titulo,
            nomeSolicitante: demanda.solicitante.nome,
            urlDemanda,
          }),
        })
      } catch { /* não bloqueia */ }
    }

    expiradas++
  }

  // 2. Alertas de expiração próxima
  const configs = await prisma.configuracaoSistema.findMany({
    select: { gabineteId: true, alertaExpiracaoHoras: true },
  })

  for (const config of configs) {
    const limiteAlerta = new Date(agora.getTime() + config.alertaExpiracaoHoras * 60 * 60 * 1000)

    const demandasAlerta = await prisma.demanda.findMany({
      where: {
        gabineteId: config.gabineteId,
        status: 'aberta',
        alertaEnviadoEm: null,
        prazoDesfecho: { gte: agora, lte: limiteAlerta },
      },
      include: {
        gabinete: { select: { slug: true } },
        responsavel: { select: { nome: true, email: true } },
      },
    })

    for (const demanda of demandasAlerta) {
      if (demanda.responsavel.email) {
        try {
          await enviarEmail({
            para: demanda.responsavel.email,
            assunto: `Atenção: demanda próxima de expirar — ${demanda.titulo}`,
            html: templateAlertaExpiracao({
              nomeResponsavel: demanda.responsavel.nome,
              tituloDemanda: demanda.titulo,
              prazo: demanda.prazoDesfecho,
              urlDemanda: `${appUrl}/${demanda.gabinete.slug}/mobilizador/demandas/${demanda.id}`,
            }),
          })
          await prisma.demanda.update({
            where: { id: demanda.id },
            data: { alertaEnviadoEm: agora },
          })
          alertas++
        } catch { /* não bloqueia */ }
      }
    }
  }

  return NextResponse.json({ expiradas, alertas })
}
```

- [ ] **Step 8: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Commit final**

```bash
git add src/lib/email.ts src/lib/__tests__/email.test.ts src/app/api/cron/ src/actions/admin/criar-demanda.ts .env.local.example
git commit -m "feat: email com Resend e cron de expiração de demandas"
```

---

## Configuração do EasyPanel (pós-deploy)

Após o deploy, configurar no EasyPanel:

1. **Variáveis de ambiente:** adicionar `RESEND_API_KEY`, `REMETENTE_EMAIL`, `CRON_SECRET`
2. **Cron job:** criar tarefa com expressão `0 * * * *` (todo início de hora) que executa:
   ```
   curl -X POST https://[domínio]/api/cron/verificar-demandas \
     -H "Authorization: Bearer [CRON_SECRET]"
   ```
3. **Domínio de e-mail no Resend:** configurar DNS do domínio `redemobiliza.com.br` no painel do Resend

---

## Self-Review — Cobertura do Spec

| Requisito | Task |
|---|---|
| isEquipe → isColaborador | Task 1 |
| assertMobilizadorAccess | Task 1 |
| Campos de endereço na Pessoa | Task 2 |
| Models Demanda, AreaDemanda, MovimentacaoDemanda, ConfiguracaoSistema | Task 2 |
| Seed de áreas por gabinete | Task 2 |
| CRUD de áreas | Task 3 |
| Configurações (prazo padrão, alerta) | Task 3 |
| criarDemanda com histórico | Task 4 |
| atualizarObservacao, alterarPrazo, marcarDesfecho | Task 4 |
| reatribuirResponsavel com registro | Task 4 |
| Formulário com busca de solicitante | Task 5 |
| Cadastro inline de solicitante | ⚠️ não implementado — ver nota abaixo |
| Listagem com filtros e paginação | Task 6 |
| Dashboard de cards por status | Task 6 |
| Tela de detalhe admin com linha do tempo | Task 7 |
| Painel mobilizador — minhas demandas | Task 8 |
| Tela de detalhe mobilizador | Task 8 |
| lib/email.ts com abstração Resend | Task 9 |
| Templates de e-mail | Task 9 |
| Cron de expiração + alertas | Task 9 |
| alertaEnviadoEm para evitar duplicatas | Task 9 |

**Nota — Cadastro inline de solicitante:** o formulário de nova demanda (Task 5) não inclui o modal de cadastro inline. O admin pode acessar `/admin/pessoas` para cadastrar a pessoa e retornar ao formulário. Implementar o cadastro inline exigiria um Client Component com estado — pode ser adicionado como melhoria futura sem bloquear o fluxo principal.
