# Banco de Talentos — Fase 1 (Cadastro + Áreas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um admin inclua uma pessoa cadastrada no Banco de Talentos (currículo, áreas de interesse, prioridade, PcD, observação interna, colocado no mercado) a partir da ficha da pessoa, e gerenciar a lista de áreas de colocação em Configurações.

**Architecture:** Três modelos Prisma novos (`AreaColocacao`, `BancoTalentos`, `BancoTalentosArea`), Server Actions no padrão já usado no projeto (`assertAdminAccess` + `revalidatePath`), upload de currículo reaproveitando o bucket Supabase Storage `gabinete-assets` (mesmo padrão de `uploadLogo`/`uploadFotoPessoa`), e um diálogo modal usando o elemento nativo `<dialog>` (mesmo padrão de `PromoverMobilizadorDialog.tsx`, já usado no projeto — não depende de nenhum componente da branch de redesign da tela de Usuários, que ainda não foi mergeada).

**Tech Stack:** Next.js App Router (Server Actions, `useFormState`), Prisma, Supabase Storage. Sem biblioteca de upload adicional.

## Escopo desta Fase (Fase 1 de 3)

Cobre apenas: modelo de dados, botão "Incluir/Atualizar no Banco de Talentos" na ficha do admin (`/admin/pessoas/[pessoaId]`), pop-up de cadastro/atualização, e gestão de áreas de colocação em Configurações.

**Fora do escopo desta fase** (ficam para as Fases 2 e 3 do briefing):
- Página principal do Banco de Talentos (dashboard, listagem, filtros, paginação, aniversariantes)
- Exportação de currículos em ZIP
- Integração automática com Demandas (criação de demanda de acompanhamento, modelo `Encaminhamento`, notificação por e-mail ao gestor)
- Configuração de "gestor padrão" para demandas de encaminhamento
- Acesso ao módulo pela área do mobilizador (`/mobilizador/...`) — nesta fase o botão só aparece na ficha do admin (`/admin/pessoas/[pessoaId]`), que já é uma rota admin-only

## Global Constraints

- Responder sempre em português do Brasil em qualquer texto de UI.
- **Este ambiente de desenvolvimento não tem acesso de rede ao banco de dados Postgres** (confirmado: `ECONNREFUSED` ao tentar conectar no pooler Supabase a partir daqui). Por isso:
  - **NÃO rodar `npx prisma migrate dev` nem `npx prisma db push`** — ambos precisam de conexão com o banco (e `migrate dev` também precisa de um shadow database) e vão falhar aqui.
  - A migração desta fase é escrita **manualmente** como um arquivo `migration.sql` dentro de `prisma/migrations/`, seguindo exatamente o formato que o Prisma já usa nas migrações existentes do projeto (ver `prisma/migrations/20260627150000_add_demanda_models/migration.sql` como referência de estilo).
  - `npx prisma generate` funciona offline (só lê o `schema.prisma` local) e deve ser rodado após editar o schema, para regenerar os tipos do Prisma Client — isso é o suficiente para `tsc --noEmit` verificar o código que usa esses novos modelos.
  - A aplicação real da migração no banco de produção (`npx prisma migrate deploy`) é um passo de deploy separado, fora do escopo desta sessão — quem tiver acesso à rede do banco roda isso depois.
- `AreaColocacao` é isolada por `gabineteId` (como `Segmento`, `Regiao`, `Profissao`, `AreaDemanda`) — não é uma lista global entre gabinetes.
- O modelo `Encaminhamento` do briefing original **não é criado nesta fase** — só será desenhado na Fase 3, quando o fluxo de exportação/demanda for detalhado.
- O bucket Supabase Storage `gabinete-assets` já existe e é usado publicamente (mesma política de `uploadLogo`/`uploadFotoPessoa`) — o currículo reaproveita esse bucket com URL pública, seguindo o mesmo nível de exposição já aceito no projeto para outros arquivos de pessoa (não introduzir um novo modelo de storage privado/signed-URL nesta fase).
- Sem biblioteca de testes de componente neste projeto — verificação de UI é `npx tsc --noEmit` + revisão manual de código, não testes automatizados de DOM. Server Actions neste projeto também não têm testes unitários hoje (`cadastrarPessoa`, `criarSegmento`, etc. não têm testes) — este plano segue a mesma convenção, não introduz um padrão novo de teste que o resto do projeto não tem.

---

## Task 1: Schema Prisma, migração manual e seed de áreas

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260707100000_add_banco_talentos/migration.sql`
- Create: `src/lib/seed-areas-colocacao.ts`
- Modify: `src/actions/super-admin/criar-gabinete.ts`

**Interfaces:**
- Produces: modelos Prisma `AreaColocacao`, `BancoTalentos`, `BancoTalentosArea`; relação `Gabinete.areasColocacao`, `Pessoa.bancoTalentos`
- Produces: `seedAreasColocacao(gabineteId: string): Promise<void>`

- [ ] **Step 1: Adicionar os modelos ao `schema.prisma`**

Adicionar ao final de `prisma/schema.prisma` (antes ou depois de `ConfiguracaoSistema`, mantendo o estilo dos modelos existentes):

```prisma
model AreaColocacao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  status     String   @default("ativa")
  criadoEm   DateTime @default(now())

  gabinete Gabinete            @relation(fields: [gabineteId], references: [id])
  talentos BancoTalentosArea[]

  @@unique([gabineteId, nome])
  @@index([gabineteId])
}

model BancoTalentos {
  id           String   @id @default(cuid())
  pessoaId     String   @unique
  curriculoUrl String?
  prioridade   Int      @default(3)
  isPcd        Boolean  @default(false)
  observacao   String?
  colocado     Boolean  @default(false)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  pessoa Pessoa              @relation(fields: [pessoaId], references: [id])
  areas  BancoTalentosArea[]
}

model BancoTalentosArea {
  bancoTalentosId String
  areaColocacaoId String

  bancoTalentos BancoTalentos @relation(fields: [bancoTalentosId], references: [id])
  area          AreaColocacao @relation(fields: [areaColocacaoId], references: [id])

  @@id([bancoTalentosId, areaColocacaoId])
}
```

No `model Gabinete`, adicionar à lista de relações (junto com `segmentos`, `regioes`, etc.):

```prisma
  areasColocacao       AreaColocacao[]
```

No `model Pessoa`, adicionar à lista de relações (junto com `observacoes`, `demandasSolicitadas`, etc.):

```prisma
  bancoTalentos          BancoTalentos?
```

- [ ] **Step 2: Escrever a migração manualmente**

```sql
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
```

- [ ] **Step 3: Criar o helper de seed para novos gabinetes**

```typescript
// src/lib/seed-areas-colocacao.ts
import { prisma } from '@/lib/prisma'

const AREAS_PADRAO = [
  'Serviços Gerais',
  'Administrativo',
  'Saúde',
  'Educação',
  'Segurança',
  'Tecnologia',
  'Comércio',
  'Construção Civil',
  'Transporte',
  'Alimentação',
]

export async function seedAreasColocacao(gabineteId: string): Promise<void> {
  await prisma.areaColocacao.createMany({
    data: AREAS_PADRAO.map((nome) => ({ nome, gabineteId })),
    skipDuplicates: true,
  })
}
```

- [ ] **Step 4: Chamar o seed na criação de gabinete**

Em `src/actions/super-admin/criar-gabinete.ts`, adicionar o import e incluir na lista de seeds já existente:

```typescript
import { seedAreasColocacao } from '@/lib/seed-areas-colocacao'
```

E no `Promise.all` existente, adicionar `seedAreasColocacao(gabinete.id),` junto com `seedRegioes`, `seedProfissoes`, `seedAreasDemanda`.

- [ ] **Step 5: Regenerar o Prisma Client e verificar tipos**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client ... to ./src/generated/prisma`

Run: `npx tsc --noEmit`
Expected: sem erros (isso confirma que os novos modelos foram declarados corretamente e batem com o schema — mesmo sem conexão com o banco).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260707100000_add_banco_talentos/migration.sql src/lib/seed-areas-colocacao.ts src/actions/super-admin/criar-gabinete.ts
git commit -m "feat: modelo de dados do Banco de Talentos (AreaColocacao, BancoTalentos)"
```

---

## Task 2: CRUD de Áreas de Colocação (Server Actions + página em Configurações)

**Files:**
- Create: `src/actions/admin/criar-area-colocacao.ts`
- Create: `src/actions/admin/desativar-area-colocacao.ts`
- Create: `src/app/[slug]/admin/configuracoes/areas-colocacao/page.tsx`
- Modify: `src/app/[slug]/admin/configuracoes/ConfiguracoesSidebar.tsx`

**Interfaces:**
- Consumes: `assertAdminAccess` (`@/lib/assert-admin-access`), modelo `AreaColocacao` (Task 1)
- Produces: `criarAreaColocacao(formData: FormData): Promise<void>`, `desativarAreaColocacao(formData: FormData): Promise<void>`

- [ ] **Step 1: Server Action de criação**

```typescript
// src/actions/admin/criar-area-colocacao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function criarAreaColocacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const { gabinete } = await assertAdminAccess(slug)

  const existente = await prisma.areaColocacao.findFirst({
    where: { gabineteId: gabinete.id, nome, status: 'ativa' },
  })
  if (existente) {
    throw new Error(`Já existe uma área ativa com esse nome: "${existente.nome}"`)
  }

  await prisma.areaColocacao.create({
    data: { nome, gabineteId: gabinete.id, status: 'ativa' },
  })

  revalidatePath(`/${slug}/admin/configuracoes/areas-colocacao`)
}
```

- [ ] **Step 2: Server Action de desativação**

```typescript
// src/actions/admin/desativar-area-colocacao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function desativarAreaColocacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const areaId = formData.get('areaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.areaColocacao.updateMany({
    where: { id: areaId, gabineteId: gabinete.id },
    data: { status: 'inativa' },
  })

  revalidatePath(`/${slug}/admin/configuracoes/areas-colocacao`)
}
```

- [ ] **Step 3: Página de gestão em Configurações**

```tsx
// src/app/[slug]/admin/configuracoes/areas-colocacao/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarAreaColocacao } from '@/actions/admin/criar-area-colocacao'
import { desativarAreaColocacao } from '@/actions/admin/desativar-area-colocacao'

export default async function AreasColocacaoPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const areas = await prisma.areaColocacao.findMany({
    where: { gabineteId: gabinete.id, status: 'ativa' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Áreas de Colocação</h2>
      <p className="text-xs text-gray-500">
        Lista de áreas de interesse usada no cadastro do Banco de Talentos. Mantenha padronizada para facilitar os filtros.
      </p>
      <form action={criarAreaColocacao} className="flex gap-2">
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
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {areas.map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{a.nome}</span>
            <form action={desativarAreaColocacao}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="areaId" value={a.id} />
              <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
            </form>
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

- [ ] **Step 4: Adicionar ao submenu de Configurações**

Em `src/app/[slug]/admin/configuracoes/ConfiguracoesSidebar.tsx`, adicionar ao array `items` (mantendo a ordem que fizer mais sentido — sugestão: logo após `segmentos`):

```typescript
{ key: 'areas-colocacao', label: 'Áreas de Colocação' },
```

- [ ] **Step 5: Verificação**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/actions/admin/criar-area-colocacao.ts src/actions/admin/desativar-area-colocacao.ts "src/app/[slug]/admin/configuracoes/areas-colocacao/page.tsx" "src/app/[slug]/admin/configuracoes/ConfiguracoesSidebar.tsx"
git commit -m "feat: gestão de áreas de colocação em Configurações"
```

---

## Task 3: Server Action `salvarBancoTalentos` (upsert com upload de currículo)

**Files:**
- Create: `src/actions/admin/salvar-banco-talentos.ts`

**Interfaces:**
- Consumes: `assertAdminAccess`, `getSupabaseAdmin` (`@/lib/supabase/admin`), modelos `BancoTalentos`/`BancoTalentosArea`/`AreaColocacao` (Task 1)
- Produces: `salvarBancoTalentos(prevState: { erro?: string; ok?: boolean }, formData: FormData): Promise<{ erro?: string; ok?: boolean }>` — assinatura compatível com `useFormState`

- [ ] **Step 1: Implementar a action**

```typescript
// src/actions/admin/salvar-banco-talentos.ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const TIPOS_PERMITIDOS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

export async function salvarBancoTalentos(
  _prevState: { erro?: string; ok?: boolean },
  formData: FormData
): Promise<{ erro?: string; ok?: boolean }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const areaIds = formData.getAll('areaIds') as string[]
  const prioridade = Number(formData.get('prioridade') ?? 3)
  const isPcd = formData.get('isPcd') === 'on'
  const observacao = ((formData.get('observacao') as string | null) ?? '').trim() || null
  const colocado = formData.get('colocado') === 'on'
  const curriculo = formData.get('curriculo') as File | null

  if (areaIds.length === 0) return { erro: 'Selecione ao menos uma área.' }
  if (![1, 2, 3].includes(prioridade)) return { erro: 'Prioridade inválida.' }

  const { gabinete } = await assertAdminAccess(slug)

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, gabineteId: gabinete.id, deletedAt: null },
    select: { id: true },
  })
  if (!pessoa) return { erro: 'Pessoa não encontrada.' }

  const areasValidas = await prisma.areaColocacao.findMany({
    where: { id: { in: areaIds }, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (areasValidas.length !== areaIds.length) return { erro: 'Área inválida selecionada.' }

  let curriculoUrl: string | undefined
  if (curriculo && curriculo.size > 0) {
    const tipo = TIPOS_PERMITIDOS[curriculo.type.toLowerCase()]
    if (!tipo) return { erro: 'Formato de arquivo não permitido — use PDF, Word (doc/docx), JPG ou PNG.' }
    if (curriculo.size > 10 * 1024 * 1024) return { erro: 'Arquivo muito grande — máximo 10MB.' }

    const path = `${gabinete.id}/pessoas/${pessoaId}/curriculo.${tipo}`
    const buffer = Buffer.from(await curriculo.arrayBuffer())
    const { error } = await getSupabaseAdmin().storage
      .from('gabinete-assets')
      .upload(path, buffer, { upsert: true, contentType: curriculo.type })
    if (error) return { erro: `Erro no upload do currículo: ${error.message}` }

    const { data: { publicUrl } } = getSupabaseAdmin().storage.from('gabinete-assets').getPublicUrl(path)
    curriculoUrl = publicUrl
  }

  await prisma.$transaction(async (tx) => {
    const bancoTalentos = await tx.bancoTalentos.upsert({
      where: { pessoaId },
      create: {
        pessoaId,
        prioridade,
        isPcd,
        observacao,
        colocado,
        ...(curriculoUrl ? { curriculoUrl } : {}),
      },
      update: {
        prioridade,
        isPcd,
        observacao,
        colocado,
        ...(curriculoUrl ? { curriculoUrl } : {}),
      },
    })

    await tx.bancoTalentosArea.deleteMany({ where: { bancoTalentosId: bancoTalentos.id } })
    await tx.bancoTalentosArea.createMany({
      data: areaIds.map((areaColocacaoId) => ({ bancoTalentosId: bancoTalentos.id, areaColocacaoId })),
    })
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
  return { ok: true }
}
```

Nota sobre o upload: o mesmo arquivo (`curriculo.<ext>`) é sobrescrito a cada atualização (`upsert: true`), igual ao padrão de `uploadLogo`. Se a pessoa reenviar um currículo num formato de extensão diferente do anterior (ex: trocou de `.pdf` para `.docx`), o arquivo antigo com a extensão anterior fica órfão no bucket — mesma limitação que já existe hoje em `uploadFotoPessoa` para casos análogos; não é uma regressão introduzida por esta task, e resolver isso está fora do escopo desta fase.

- [ ] **Step 2: Verificação**

Run: `npx tsc --noEmit`
Expected: sem erros. Sem banco disponível neste ambiente, não é possível testar a query/transação de ponta a ponta — a Task 5 (verificação final) documenta isso como pendência para checagem manual com banco real.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/salvar-banco-talentos.ts
git commit -m "feat: action de cadastro/atualização do Banco de Talentos"
```

---

## Task 4: `BancoTalentosDialog` e integração na ficha da pessoa

**Files:**
- Create: `src/app/[slug]/admin/pessoas/[pessoaId]/BancoTalentosDialog.tsx`
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`

**Interfaces:**
- Consumes: `salvarBancoTalentos` (Task 3)
- Produces: `<BancoTalentosDialog slug pessoaId primeiroNome jaCadastrado areasDisponiveis bancoTalentos />`

- [ ] **Step 1: Implementar o diálogo**

```tsx
// src/app/[slug]/admin/pessoas/[pessoaId]/BancoTalentosDialog.tsx
'use client'

import { useFormState } from 'react-dom'
import { salvarBancoTalentos } from '@/actions/admin/salvar-banco-talentos'

interface Area {
  id: string
  nome: string
}

interface Props {
  slug: string
  pessoaId: string
  primeiroNome: string
  jaCadastrado: boolean
  areasDisponiveis: Area[]
  bancoTalentos: {
    curriculoUrl: string | null
    prioridade: number
    isPcd: boolean
    observacao: string | null
    colocado: boolean
    areaIds: string[]
  } | null
}

const DIALOG_ID = 'dialog-banco-talentos'

export default function BancoTalentosDialog({
  slug,
  pessoaId,
  primeiroNome,
  jaCadastrado,
  areasDisponiveis,
  bancoTalentos,
}: Props) {
  const [state, action, pending] = useFormState(salvarBancoTalentos, {})
  const titulo = jaCadastrado
    ? `Atualizar Banco de Talentos de ${primeiroNome}`
    : `Incluir ${primeiroNome} no Banco de Talentos`

  return (
    <>
      <button
        type="button"
        className="text-sm text-blue-700 hover:underline"
        onClick={() => (document.getElementById(DIALOG_ID) as HTMLDialogElement)?.showModal()}
      >
        {titulo}
      </button>

      <dialog id={DIALOG_ID} className="rounded-lg shadow-xl p-6 w-full max-w-md backdrop:bg-black/40">
        <h2 className="text-base font-semibold mb-4">{titulo}</h2>
        <form action={action} encType="multipart/form-data" className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="pessoaId" value={pessoaId} />

          <div>
            <label className="block text-sm font-medium text-gray-700">Currículo</label>
            {bancoTalentos?.curriculoUrl && (
              <p className="text-xs text-gray-500 mb-1">
                <a
                  href={bancoTalentos.curriculoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Ver currículo atual
                </a>
              </p>
            )}
            <input
              name="curriculo"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="mt-1 block w-full text-sm"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700">Área desejada *</legend>
            <div className="mt-1 grid grid-cols-2 gap-1 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
              {areasDisponiveis.map((area) => (
                <label key={area.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="areaIds"
                    value={area.id}
                    defaultChecked={bancoTalentos?.areaIds.includes(area.id) ?? false}
                  />
                  {area.nome}
                </label>
              ))}
              {areasDisponiveis.length === 0 && (
                <p className="text-xs text-gray-500 col-span-2">
                  Nenhuma área cadastrada — configure em Configurações → Áreas de Colocação.
                </p>
              )}
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-gray-700">Prioridade *</label>
            <select
              name="prioridade"
              defaultValue={String(bancoTalentos?.prioridade ?? 3)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="1">1 — Vínculo forte (ex: voluntário de campanha)</option>
              <option value="2">2 — Indicado por alguém de confiança</option>
              <option value="3">3 — Currículo recebido sem vínculo direto</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPcd" defaultChecked={bancoTalentos?.isPcd ?? false} />
            Pessoa com Deficiência (PcD)
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700">Observação interna</label>
            <textarea
              name="observacao"
              rows={3}
              defaultValue={bancoTalentos?.observacao ?? ''}
              placeholder="Justificativa da prioridade, contexto, etc. (visível apenas ao admin)"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="colocado" defaultChecked={bancoTalentos?.colocado ?? false} />
            Colocado no mercado
          </label>

          {state.erro && <p className="text-sm text-red-600">{state.erro}</p>}
          {state.ok && <p className="text-sm text-green-600">Salvo com sucesso!</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              className="text-sm text-gray-600 hover:underline"
              onClick={() => (document.getElementById(DIALOG_ID) as HTMLDialogElement)?.close()}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {pending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
```

- [ ] **Step 2: Buscar os dados necessários na página da ficha**

Em `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`, adicionar o import:

```tsx
import BancoTalentosDialog from './BancoTalentosDialog'
```

Adicionar `bancoTalentos` ao `include` do `prisma.pessoa.findFirst` já existente, junto com `observacoes`:

```tsx
      bancoTalentos: { include: { areas: { select: { areaColocacaoId: true } } } },
```

Adicionar a busca das áreas disponíveis ao `Promise.all` já existente (junto com `regioes`, `profissoes`, `demandas`, `totalRede`):

```tsx
    prisma.areaColocacao.findMany({
      where: { gabineteId: gabinete.id, status: 'ativa' },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
```

(ajustando a desestruturação do `Promise.all` para receber essa nova posição, ex: `const [regioes, profissoes, demandas, totalRede, areasColocacao] = await Promise.all([...])`).

- [ ] **Step 3: Renderizar o diálogo**

Na área de ações da ficha (perto de `PromoverMobilizadorDialog`, dentro do bloco `{isAdmin && ...}`), adicionar:

```tsx
          {isAdmin && (
            <BancoTalentosDialog
              slug={params.slug}
              pessoaId={pessoa.id}
              primeiroNome={pessoa.nome.split(' ')[0]}
              jaCadastrado={!!pessoa.bancoTalentos}
              areasDisponiveis={areasColocacao}
              bancoTalentos={
                pessoa.bancoTalentos
                  ? {
                      curriculoUrl: pessoa.bancoTalentos.curriculoUrl,
                      prioridade: pessoa.bancoTalentos.prioridade,
                      isPcd: pessoa.bancoTalentos.isPcd,
                      observacao: pessoa.bancoTalentos.observacao,
                      colocado: pessoa.bancoTalentos.colocado,
                      areaIds: pessoa.bancoTalentos.areas.map((a) => a.areaColocacaoId),
                    }
                  : null
              }
            />
          )}
```

Ler o arquivo atual antes de editar para posicionar esse bloco corretamente dentro da área de ações existente (perto de `PromoverMobilizadorDialog`), preservando todo o restante da página sem alterações.

- [ ] **Step 4: Verificação**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[slug]/admin/pessoas/[pessoaId]/BancoTalentosDialog.tsx" "src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx"
git commit -m "feat: botão e pop-up de cadastro/atualização do Banco de Talentos na ficha"
```

---

## Task 5: Verificação final da Fase 1

**Files:** nenhum arquivo novo — apenas checklist.

- [ ] **Step 1: Rodar toda a suíte disponível**

Run: `npm test && npx tsc --noEmit`
Expected: tudo verde. `npm test` deve mostrar a mesma baseline conhecida (28 passando, 2 falhas pré-existentes em `email.test.ts`, sem relação com esta fase).

- [ ] **Step 2: Checklist de conformidade com o briefing**

- Modelo de dados bate com o schema do briefing, exceto `AreaColocacao.gabineteId` (adicionado por decisão do usuário) e `Encaminhamento` (adiado pra Fase 3) — ok.
- Botão na ficha muda de texto dinamicamente: "Incluir [nome] no Banco de Talentos" vs "Atualizar Banco de Talentos de [nome]" — ok.
- Pop-up tem todos os campos da tabela do briefing: currículo (opcional), área (obrigatório, múltipla), prioridade (obrigatório, padrão 3), PcD (opcional, padrão não), observação interna (opcional), colocado no mercado (opcional, padrão não) — ok.
- Área de colocação gerenciável pelo admin em Configurações — ok.
- Lista de áreas seedada com os 10 exemplos do briefing, tanto para gabinetes existentes (migração) quanto novos (seed na criação) — ok.

- [ ] **Step 3: Pendência explícita para fora deste ambiente**

Documentar (não é uma tarefa de código, é uma nota para o usuário): a migração em `prisma/migrations/20260707100000_add_banco_talentos/migration.sql` precisa ser aplicada de verdade no banco (`npx prisma migrate deploy`, ou equivalente) e o upload de currículo/teste do pop-up precisa ser verificado num navegador de verdade com sessão logada — nada disso foi possível neste ambiente sandboxado sem acesso à rede do banco.

- [ ] **Step 4: Commit final (se houver ajustes do checklist)**

```bash
git add -A
git commit -m "fix: ajustes finais de conformidade com o briefing do Banco de Talentos — Fase 1"
```
