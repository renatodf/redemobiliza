# Painel Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o painel administrativo do gabinete: layout autenticado com guards de acesso, personalização visual, CRUD de Regiões/Profissões/Segmentos, listagem de pessoas com cadastro manual, e ficha completa de pessoa com observações.

**Architecture:** Layout de servidor (`app/[slug]/admin/layout.tsx`) valida sessão + papel via `React.cache`; todas as mutações são Server Actions; uploads de logo/banner via Supabase Storage (bucket `gabinete-assets`); QR code gerado no servidor via pacote `qrcode`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Prisma, Supabase Auth (service role), Supabase Storage, Tailwind CSS, `qrcode` npm package.

## Global Constraints

- Node.js ≥ 20, Next.js 14 App Router, TypeScript strict mode
- Prisma como único ORM — nunca SQL raw para mutações de dados de aplicação
- Todas as rotas do painel admin sob `app/[slug]/admin/`
- `gabineteId` sempre extraído de sessão/cookie — nunca de parâmetro de URL para fins de autorização
- Server Actions para todas as mutações (`'use server'` + `<form action={action}>`)
- `React.cache` para deduplicar lookups de DB em layout + children
- Supabase Storage bucket `gabinete-assets` (público) — deve existir antes do deploy
- Soft delete: Regiões (`ativa=false`), Profissões (`ativa=false`), Segmentos (`status='inativo'`)
- Nomes de campos conforme schema Prisma do Plano 1 — nunca inventar nomes diferentes
- Slug do gabinete vem de `params.slug` mas `gabineteId` real vem sempre do DB

---

## Mapa de Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/gabinete.ts` | `getGabineteBySlug` com `React.cache` |
| `src/app/[slug]/admin/layout.tsx` | Guard de autenticação + banner modo suporte |
| `src/app/[slug]/admin/page.tsx` | Redirect para `/[slug]/admin/pessoas` |
| `src/app/[slug]/admin/personalizacao/page.tsx` | Módulo 5 — formulário de personalização |
| `src/actions/admin/salvar-personalizacao.ts` | Server Action — dados textuais |
| `src/actions/admin/upload-logo.ts` | Server Action — upload logo |
| `src/actions/admin/upload-banner.ts` | Server Action — upload banner |
| `src/app/[slug]/admin/regioes/page.tsx` | Módulo 7a — listagem de regiões |
| `src/actions/admin/criar-regiao.ts` | Server Action — criar região |
| `src/actions/admin/desativar-regiao.ts` | Server Action — soft delete região |
| `src/lib/seed-regioes.ts` | Seed das 35 regiões do DF por gabinete |
| `src/app/[slug]/admin/profissoes/page.tsx` | Módulo 7b — listagem de profissões |
| `src/actions/admin/criar-profissao.ts` | Server Action — criar profissão |
| `src/actions/admin/desativar-profissao.ts` | Server Action — soft delete profissão |
| `src/lib/seed-profissoes.ts` | Seed das ~17 profissões comuns por gabinete |
| `src/app/[slug]/admin/segmentos/page.tsx` | Módulo 2 — listagem de segmentos |
| `src/app/[slug]/admin/segmentos/[segmentoId]/page.tsx` | Detalhe do segmento com QR code |
| `src/actions/admin/criar-segmento.ts` | Server Action — criar segmento |
| `src/actions/admin/inativar-segmento.ts` | Server Action — soft delete segmento |
| `src/lib/whatsapp.ts` | `normalizeWhatsApp` — utilitário puro |
| `src/lib/__tests__/whatsapp.test.ts` | Testes de `normalizeWhatsApp` |
| `src/app/[slug]/admin/pessoas/page.tsx` | Listagem de pessoas com busca |
| `src/actions/admin/cadastrar-pessoa.ts` | Server Action — cadastro manual de pessoa |
| `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx` | Ficha da pessoa |
| `src/actions/admin/editar-pessoa.ts` | Server Action — editar dados da pessoa |
| `src/actions/admin/toggle-equipe.ts` | Server Action — marcar/desmarcar equipe |
| `src/actions/admin/criar-observacao.ts` | Server Action — criar observação |
| `src/actions/admin/editar-observacao.ts` | Server Action — editar observação |
| `src/actions/admin/excluir-observacao.ts` | Server Action — excluir observação |

---

### Task 1: Layout Admin + Guards de Acesso

**Files:**
- Create: `src/lib/gabinete.ts`
- Create: `src/app/[slug]/admin/layout.tsx`
- Create: `src/app/[slug]/admin/page.tsx`
- Modify: `src/middleware.ts` (adicionar `/[slug]/admin` às rotas protegidas)

**Interfaces:**
- Produz: `getGabineteBySlug(slug: string): Promise<Gabinete & { slug: string; ativo: boolean; nomeSistema: string | null; corPrimaria: string | null; corSecundaria: string | null; logoUrl: string | null; bannerUrl: string | null } | null>` — usado por layout + todas as pages de admin
- Produz: `AdminLayoutProps` implícito — `params: { slug: string }`, `children: React.ReactNode`

- [ ] **Passo 1: Criar helper `getGabineteBySlug` com `React.cache`**

```typescript
// src/lib/gabinete.ts
import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'

export const getGabineteBySlug = cache(async (slug: string) => {
  return prisma.gabinete.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      ativo: true,
      nomeSistema: true,
      corPrimaria: true,
      corSecundaria: true,
      logoUrl: true,
      bannerUrl: true,
    },
  })
})
```

- [ ] **Passo 2: Criar layout admin com guards**

```typescript
// src/app/[slug]/admin/layout.tsx
import 'server-only'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { readSuporteSessao } from '@/lib/modo-suporte'
import { sairModoSuporte } from '@/actions/super-admin/modo-suporte'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect(`/${params.slug}/login`)

  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) redirect('/404')
  if (!gabinete.ativo) redirect(`/${params.slug}/login?erro=gabinete_inativo`)

  const role = session.user.app_metadata?.role as string | undefined
  const suporteCookie = cookieStore.get('suporteSessao')?.value

  let modoSuporteAtivo = false

  if (role === 'super-admin') {
    // Super-admin só pode acessar se tiver cookie de suporte válido para este gabinete
    let sessao: { gabineteId: string; sessaoId: string } | null = null
    try {
      sessao = readSuporteSessao(role, suporteCookie)
    } catch {
      redirect('/super-admin/gabinetes')
    }
    if (!sessao || sessao.gabineteId !== gabinete.id) {
      redirect('/super-admin/gabinetes')
    }
    modoSuporteAtivo = true
  } else {
    // Admin normal: deve ter UsuarioGabinete com papel='admin' neste gabinete
    const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
      where: {
        userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id },
      },
      select: { papel: true },
    })
    if (!usuarioGabinete || usuarioGabinete.papel !== 'admin') {
      redirect(`/${params.slug}/login?erro=sem_acesso`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {modoSuporteAtivo && (
        <div className="bg-yellow-400 text-yellow-900 px-4 py-2 flex items-center justify-between text-sm font-medium">
          <span>
            Modo Suporte ativo — você está visualizando o gabinete{' '}
            <strong>{gabinete.nomeSistema ?? params.slug}</strong>
          </span>
          <form action={sairModoSuporte}>
            <button type="submit" className="underline hover:no-underline">
              Sair do modo suporte
            </button>
          </form>
        </div>
      )}
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Passo 3: Criar page raiz do admin (redirect)**

```typescript
// src/app/[slug]/admin/page.tsx
import { redirect } from 'next/navigation'

export default function AdminPage({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/admin/pessoas`)
}
```

- [ ] **Passo 4: Proteger rota no middleware**

No `src/middleware.ts` existente (do Plano 2), adicionar `/[slug]/admin` às rotas que exigem sessão. O middleware já tem a lógica — verificar se a rota `pathname` inclui `/admin` (exceto `/super-admin`) e redirecionar para `/${slug}/login` se não houver sessão. Como o layout faz o guard completo, o middleware só precisa checar existência de sessão para performance.

Abrir `src/middleware.ts` e adicionar no array de padrões protegidos:

```typescript
// No matcher do middleware, adicionar padrão para rotas de admin de gabinete:
export const config = {
  matcher: [
    '/super-admin/:path*',
    '/:slug/admin/:path*',
  ],
}
```

O corpo do middleware já redireciona para login se não houver sessão — confirmar que funciona para `/:slug/admin/:path*` redirecionando para `/${slug}/login`.

- [ ] **Passo 5: Testar navegação**

```bash
# Iniciar servidor
npm run dev

# Acessar sem sessão:
# http://localhost:3000/qualquer-slug/admin/pessoas
# → deve redirecionar para /qualquer-slug/login

# Acessar com sessão de admin válida:
# → deve carregar o layout sem banner amarelo

# Acessar com super-admin sem cookie de suporte:
# → deve redirecionar para /super-admin/gabinetes
```

- [ ] **Passo 6: Commit**

```bash
git add src/lib/gabinete.ts src/app/[slug]/admin/layout.tsx src/app/[slug]/admin/page.tsx src/middleware.ts
git commit -m "feat: layout e guards do painel admin"
```

---

### Task 2: Módulo 5 — Personalização do Gabinete

**Files:**
- Create: `src/app/[slug]/admin/personalizacao/page.tsx`
- Create: `src/actions/admin/salvar-personalizacao.ts`
- Create: `src/actions/admin/upload-logo.ts`
- Create: `src/actions/admin/upload-banner.ts`

**Interfaces:**
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts` (Task 1)
- Consome: `supabaseAdmin` de `src/lib/supabase-admin.ts` (Plano 1)
- Consome: `prisma` de `src/lib/prisma.ts` (Plano 1)

Pré-requisito: Bucket `gabinete-assets` criado no Supabase Dashboard como público antes de testar.

- [ ] **Passo 1: Criar Server Action de dados textuais**

```typescript
// src/actions/admin/salvar-personalizacao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function salvarPersonalizacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nomeSistema = (formData.get('nomeSistema') as string).trim() || null
  const corPrimaria = (formData.get('corPrimaria') as string).trim() || null
  const corSecundaria = (formData.get('corSecundaria') as string).trim() || null

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.gabinete.update({
    where: { id: gabinete.id },
    data: { nomeSistema, corPrimaria, corSecundaria },
  })

  revalidatePath(`/${slug}/admin/personalizacao`)
}
```

- [ ] **Passo 2: Criar Server Action de upload de logo**

```typescript
// src/actions/admin/upload-logo.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function uploadLogo(formData: FormData) {
  const slug = formData.get('slug') as string
  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${gabinete.id}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseAdmin.storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.gabinete.update({
    where: { id: gabinete.id },
    data: { logoUrl: publicUrl },
  })

  revalidatePath(`/${slug}/admin/personalizacao`)
}
```

- [ ] **Passo 3: Criar Server Action de upload de banner**

```typescript
// src/actions/admin/upload-banner.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function uploadBanner(formData: FormData) {
  const slug = formData.get('slug') as string
  const file = formData.get('banner') as File | null
  if (!file || file.size === 0) return

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${gabinete.id}/banner.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseAdmin.storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.gabinete.update({
    where: { id: gabinete.id },
    data: { bannerUrl: publicUrl },
  })

  revalidatePath(`/${slug}/admin/personalizacao`)
}
```

- [ ] **Passo 4: Criar page de personalização**

```typescript
// src/app/[slug]/admin/personalizacao/page.tsx
import { getGabineteBySlug } from '@/lib/gabinete'
import { salvarPersonalizacao } from '@/actions/admin/salvar-personalizacao'
import { uploadLogo } from '@/actions/admin/upload-logo'
import { uploadBanner } from '@/actions/admin/upload-banner'
import { notFound } from 'next/navigation'

export default async function PersonalizacaoPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <h1 className="text-2xl font-bold">Personalização</h1>

      {/* Dados textuais */}
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Identidade</h2>
        <form action={salvarPersonalizacao} className="space-y-4">
          <input type="hidden" name="slug" value={params.slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nome do sistema
            </label>
            <input
              name="nomeSistema"
              defaultValue={gabinete.nomeSistema ?? ''}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Mobiliza Fulano"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">
                Cor primária
              </label>
              <input
                name="corPrimaria"
                type="color"
                defaultValue={gabinete.corPrimaria ?? '#3B82F6'}
                className="mt-1 h-10 w-full border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">
                Cor secundária
              </label>
              <input
                name="corSecundaria"
                type="color"
                defaultValue={gabinete.corSecundaria ?? '#1E40AF'}
                className="mt-1 h-10 w-full border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Salvar
          </button>
        </form>
      </section>

      {/* Logo */}
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Logo</h2>
        {gabinete.logoUrl && (
          <img
            src={gabinete.logoUrl}
            alt="Logo atual"
            className="h-16 object-contain"
          />
        )}
        <form action={uploadLogo} encType="multipart/form-data">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="block text-sm"
          />
          <button
            type="submit"
            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Enviar logo
          </button>
        </form>
      </section>

      {/* Banner */}
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Banner</h2>
        {gabinete.bannerUrl && (
          <img
            src={gabinete.bannerUrl}
            alt="Banner atual"
            className="w-full h-32 object-cover rounded"
          />
        )}
        <form action={uploadBanner} encType="multipart/form-data">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="banner"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="block text-sm"
          />
          <button
            type="submit"
            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Enviar banner
          </button>
        </form>
      </section>
    </div>
  )
}
```

- [ ] **Passo 5: Testar personalização**

```bash
# Acessar http://localhost:3000/[slug]/admin/personalizacao
# 1. Alterar nome do sistema e cores → Salvar → página deve recarregar com valores atualizados
# 2. Fazer upload de logo (PNG/JPG) → deve aparecer preview
# 3. Fazer upload de banner → deve aparecer preview
# Verificar no Supabase Storage: bucket gabinete-assets → pasta [gabineteId]/
```

- [ ] **Passo 6: Commit**

```bash
git add src/app/[slug]/admin/personalizacao/page.tsx \
        src/actions/admin/salvar-personalizacao.ts \
        src/actions/admin/upload-logo.ts \
        src/actions/admin/upload-banner.ts
git commit -m "feat: módulo de personalização do gabinete"
```

---

### Task 3: Módulo 7a — Regiões

**Files:**
- Create: `src/lib/seed-regioes.ts`
- Create: `src/app/[slug]/admin/regioes/page.tsx`
- Create: `src/actions/admin/criar-regiao.ts`
- Create: `src/actions/admin/desativar-regiao.ts`
- Modify: `src/actions/super-admin/criar-gabinete.ts` (chamar seed após criar gabinete)

**Interfaces:**
- Produz: `seedRegioes(gabineteId: string): Promise<void>` — chamada em `criar-gabinete.ts`
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts`

- [ ] **Passo 1: Criar seed de regiões do DF**

```typescript
// src/lib/seed-regioes.ts
import { prisma } from '@/lib/prisma'

const REGIOES_DF = [
  'Asa Norte',
  'Asa Sul',
  'Lago Norte',
  'Lago Sul',
  'Cruzeiro',
  'Sudoeste/Octogonal',
  'Noroeste',
  'Guará',
  'Taguatinga',
  'Ceilândia',
  'Samambaia',
  'Recanto das Emas',
  'Riacho Fundo',
  'Riacho Fundo II',
  'Candangolândia',
  'Núcleo Bandeirante',
  'Park Way',
  'Águas Claras',
  'Vicente Pires',
  'Sobradinho',
  'Sobradinho II',
  'Planaltina',
  'Paranoá',
  'São Sebastião',
  'Santa Maria',
  'Gama',
  'Brazlândia',
  'Estrutural',
  'SIA',
  'SCIA/Estrutural',
  'Fercal',
  'Varjão',
  'Jardim Botânico',
  'Itapoã',
  'Arniqueira',
]

export async function seedRegioes(gabineteId: string): Promise<void> {
  await prisma.regiao.createMany({
    data: REGIOES_DF.map((nome) => ({ nome, gabineteId, ativa: true })),
    skipDuplicates: true,
  })
}
```

- [ ] **Passo 2: Modificar `criar-gabinete.ts` para chamar seed**

Abrir `src/actions/super-admin/criar-gabinete.ts` (criado no Plano 2). Após o `prisma.gabinete.create(...)` que retorna o `gabinete`, adicionar:

```typescript
import { seedRegioes } from '@/lib/seed-regioes'
import { seedProfissoes } from '@/lib/seed-profissoes' // será criado na Task 4

// Logo após criar o gabinete:
await seedRegioes(gabinete.id)
// await seedProfissoes(gabinete.id)  // descomentar na Task 4
```

Neste momento, adicionar apenas `seedRegioes`. O import de `seedProfissoes` será adicionado na Task 4.

- [ ] **Passo 3: Criar Server Action criar-regiao**

```typescript
// src/actions/admin/criar-regiao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function criarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.regiao.create({
    data: { nome, gabineteId: gabinete.id, ativa: true },
  })

  revalidatePath(`/${slug}/admin/regioes`)
}
```

- [ ] **Passo 4: Criar Server Action desativar-regiao**

```typescript
// src/actions/admin/desativar-regiao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function desativarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const regiaoId = formData.get('regiaoId') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  // Garantir que a região pertence ao gabinete antes de desativar
  await prisma.regiao.updateMany({
    where: { id: regiaoId, gabineteId: gabinete.id },
    data: { ativa: false },
  })

  revalidatePath(`/${slug}/admin/regioes`)
}
```

- [ ] **Passo 5: Criar page de regiões**

```typescript
// src/app/[slug]/admin/regioes/page.tsx
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarRegiao } from '@/actions/admin/criar-regiao'
import { desativarRegiao } from '@/actions/admin/desativar-regiao'
import { notFound } from 'next/navigation'

export default async function RegioesPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const regioes = await prisma.regiao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Regiões</h1>

      <form action={criarRegiao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova região"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>

      <ul className="divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
        {regioes.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{r.nome}</span>
            <form action={desativarRegiao}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="regiaoId" value={r.id} />
              <button
                type="submit"
                className="text-red-600 text-xs hover:underline"
              >
                Desativar
              </button>
            </form>
          </li>
        ))}
        {regioes.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">
            Nenhuma região ativa
          </li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Passo 6: Testar regiões**

```bash
# http://localhost:3000/[slug]/admin/regioes
# 1. Deve listar as 35 regiões do DF (se o gabinete foi criado após a Task 3)
# 2. Adicionar nova região → aparece na lista
# 3. Clicar Desativar → some da lista
# Para testar o seed em gabinete existente, executar via Prisma Studio ou
# criar um novo gabinete no super-admin
```

- [ ] **Passo 7: Commit**

```bash
git add src/lib/seed-regioes.ts \
        src/app/[slug]/admin/regioes/page.tsx \
        src/actions/admin/criar-regiao.ts \
        src/actions/admin/desativar-regiao.ts \
        src/actions/super-admin/criar-gabinete.ts
git commit -m "feat: módulo de regiões com seed do DF"
```

---

### Task 4: Módulo 7b — Profissões

**Files:**
- Create: `src/lib/seed-profissoes.ts`
- Create: `src/app/[slug]/admin/profissoes/page.tsx`
- Create: `src/actions/admin/criar-profissao.ts`
- Create: `src/actions/admin/desativar-profissao.ts`
- Modify: `src/actions/super-admin/criar-gabinete.ts` (adicionar seedProfissoes)

**Interfaces:**
- Produz: `seedProfissoes(gabineteId: string): Promise<void>`
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts`

- [ ] **Passo 1: Criar seed de profissões**

```typescript
// src/lib/seed-profissoes.ts
import { prisma } from '@/lib/prisma'

const PROFISSOES_COMUNS = [
  'Servidor Público',
  'Aposentado(a)',
  'Comerciante',
  'Autônomo(a)',
  'Professor(a)',
  'Estudante',
  'Profissional de Saúde',
  'Advogado(a)',
  'Engenheiro(a)',
  'Agricultor(a)',
  'Trabalhador(a) da Construção Civil',
  'Doméstico(a)',
  'Motorista / Transporte',
  'Empresário(a)',
  'Profissional de Segurança',
  'Comunicador(a) / Jornalista',
  'Outros',
]

export async function seedProfissoes(gabineteId: string): Promise<void> {
  await prisma.profissao.createMany({
    data: PROFISSOES_COMUNS.map((nome) => ({ nome, gabineteId, ativa: true })),
    skipDuplicates: true,
  })
}
```

- [ ] **Passo 2: Modificar `criar-gabinete.ts` para chamar seedProfissoes**

Abrir `src/actions/super-admin/criar-gabinete.ts`. Adicionar import e chamada:

```typescript
import { seedProfissoes } from '@/lib/seed-profissoes'

// Logo após seedRegioes:
await seedRegioes(gabinete.id)
await seedProfissoes(gabinete.id)
```

- [ ] **Passo 3: Criar Server Action criar-profissao**

```typescript
// src/actions/admin/criar-profissao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function criarProfissao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.profissao.create({
    data: { nome, gabineteId: gabinete.id, ativa: true },
  })

  revalidatePath(`/${slug}/admin/profissoes`)
}
```

- [ ] **Passo 4: Criar Server Action desativar-profissao**

```typescript
// src/actions/admin/desativar-profissao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function desativarProfissao(formData: FormData) {
  const slug = formData.get('slug') as string
  const profissaoId = formData.get('profissaoId') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.profissao.updateMany({
    where: { id: profissaoId, gabineteId: gabinete.id },
    data: { ativa: false },
  })

  revalidatePath(`/${slug}/admin/profissoes`)
}
```

- [ ] **Passo 5: Criar page de profissões**

```typescript
// src/app/[slug]/admin/profissoes/page.tsx
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarProfissao } from '@/actions/admin/criar-profissao'
import { desativarProfissao } from '@/actions/admin/desativar-profissao'
import { notFound } from 'next/navigation'

export default async function ProfissoesPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const profissoes = await prisma.profissao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Profissões</h1>

      <form action={criarProfissao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova profissão"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>

      <ul className="divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
        {profissoes.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{p.nome}</span>
            <form action={desativarProfissao}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="profissaoId" value={p.id} />
              <button
                type="submit"
                className="text-red-600 text-xs hover:underline"
              >
                Desativar
              </button>
            </form>
          </li>
        ))}
        {profissoes.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">
            Nenhuma profissão ativa
          </li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Passo 6: Commit**

```bash
git add src/lib/seed-profissoes.ts \
        src/app/[slug]/admin/profissoes/page.tsx \
        src/actions/admin/criar-profissao.ts \
        src/actions/admin/desativar-profissao.ts \
        src/actions/super-admin/criar-gabinete.ts
git commit -m "feat: módulo de profissões com seed"
```

---

### Task 5: Módulo 2 — Segmentos

**Files:**
- Create: `src/app/[slug]/admin/segmentos/page.tsx`
- Create: `src/app/[slug]/admin/segmentos/[segmentoId]/page.tsx`
- Create: `src/actions/admin/criar-segmento.ts`
- Create: `src/actions/admin/inativar-segmento.ts`

Pré-requisito: Instalar pacote `qrcode`:

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

**Interfaces:**
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts`
- O link de cadastro público de cada segmento é: `https://[domínio]/[slug]/cadastro/[segmentoSlug]`
- `segmentoSlug` é o `slug` do segmento — gerado via `toSlug(nome)` do Plano 1 no momento da criação

- [ ] **Passo 1: Criar Server Action criar-segmento**

```typescript
// src/actions/admin/criar-segmento.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { toSlug } from '@/lib/slug'

export async function criarSegmento(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const segmentoSlug = toSlug(nome)

  // Verificar unicidade no nível da aplicação (segmentos ativos com mesmo slug)
  const existente = await prisma.segmento.findFirst({
    where: {
      gabineteId: gabinete.id,
      slug: segmentoSlug,
      status: 'ativo',
    },
  })
  if (existente) {
    throw new Error(`Já existe um segmento ativo com nome similar: "${existente.nome}"`)
  }

  await prisma.segmento.create({
    data: {
      nome,
      slug: segmentoSlug,
      gabineteId: gabinete.id,
      status: 'ativo',
    },
  })

  revalidatePath(`/${slug}/admin/segmentos`)
}
```

- [ ] **Passo 2: Criar Server Action inativar-segmento**

```typescript
// src/actions/admin/inativar-segmento.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function inativarSegmento(formData: FormData) {
  const slug = formData.get('slug') as string
  const segmentoId = formData.get('segmentoId') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.segmento.updateMany({
    where: { id: segmentoId, gabineteId: gabinete.id },
    data: { status: 'inativo' },
  })

  revalidatePath(`/${slug}/admin/segmentos`)
}
```

- [ ] **Passo 3: Criar page de listagem de segmentos**

```typescript
// src/app/[slug]/admin/segmentos/page.tsx
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarSegmento } from '@/actions/admin/criar-segmento'
import { inativarSegmento } from '@/actions/admin/inativar-segmento'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function SegmentosPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, slug: true },
  })

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Segmentos</h1>

      <form action={criarSegmento} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome do novo segmento"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Criar
        </button>
      </form>

      <ul className="divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
        {segmentos.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3">
            <Link
              href={`/${params.slug}/admin/segmentos/${s.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              {s.nome}
            </Link>
            <form action={inativarSegmento}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="segmentoId" value={s.id} />
              <button
                type="submit"
                className="text-red-600 text-xs hover:underline"
              >
                Inativar
              </button>
            </form>
          </li>
        ))}
        {segmentos.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">
            Nenhum segmento ativo
          </li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Passo 4: Criar page de detalhe do segmento com QR code**

```typescript
// src/app/[slug]/admin/segmentos/[segmentoId]/page.tsx
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'

export default async function SegmentoDetalhePage({
  params,
}: {
  params: { slug: string; segmentoId: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const segmento = await prisma.segmento.findFirst({
    where: {
      id: params.segmentoId,
      gabineteId: gabinete.id,
      status: 'ativo',
    },
    select: { id: true, nome: true, slug: true },
  })
  if (!segmento) notFound()

  const linkCadastro = `${process.env.NEXT_PUBLIC_APP_URL}/${params.slug}/cadastro/${segmento.slug}`

  const qrDataUrl = await QRCode.toDataURL(linkCadastro, {
    width: 256,
    margin: 2,
  })

  return (
    <div className="max-w-md mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">{segmento.nome}</h1>

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <p className="text-sm font-medium text-gray-700">Link de cadastro público</p>
        <p className="text-sm text-blue-600 break-all">{linkCadastro}</p>
        <a
          href={linkCadastro}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-blue-600 underline"
        >
          Abrir link
        </a>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm flex flex-col items-center gap-4">
        <p className="text-sm font-medium text-gray-700">QR Code</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`QR Code — ${segmento.nome}`} className="w-64 h-64" />
        <a
          href={qrDataUrl}
          download={`qr-${segmento.slug}.png`}
          className="text-sm text-blue-600 underline"
        >
          Baixar QR Code
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Passo 5: Adicionar `NEXT_PUBLIC_APP_URL` ao `.env.local`**

```bash
# Adicionar no .env.local:
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Em produção: NEXT_PUBLIC_APP_URL=https://seudominio.com.br
```

- [ ] **Passo 6: Testar segmentos**

```bash
# http://localhost:3000/[slug]/admin/segmentos
# 1. Criar segmento "Saúde Pública" → aparece na lista
# 2. Tentar criar segmento "Saude Publica" (mesmo slug) → deve retornar erro
# 3. Clicar no segmento → página de detalhe com link e QR code
# 4. Baixar QR code → arquivo PNG válido
# 5. Inativar segmento → some da lista
```

- [ ] **Passo 7: Commit**

```bash
git add src/app/[slug]/admin/segmentos/ \
        src/actions/admin/criar-segmento.ts \
        src/actions/admin/inativar-segmento.ts \
        .env.local
git commit -m "feat: módulo de segmentos com link de cadastro e QR code"
```

---

### Task 6: Listagem de Pessoas + Cadastro Manual + normalizeWhatsApp (TDD)

**Files:**
- Create: `src/lib/whatsapp.ts`
- Create: `src/lib/__tests__/whatsapp.test.ts`
- Create: `src/actions/admin/cadastrar-pessoa.ts`
- Create: `src/app/[slug]/admin/pessoas/page.tsx`

**Interfaces:**
- Produz: `normalizeWhatsApp(input: string): string | null` — retorna número normalizado (12 ou 13 dígitos, com DDI 55) ou `null`
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts`
- Consome: `normalizeWhatsApp` em `cadastrar-pessoa.ts`

**Regras de normalização do WhatsApp:**
- Remover tudo que não for dígito
- 10 dígitos → prefixar com `55` → resultado 12 dígitos (DDD 2 + número 8, sem 9)
- 11 dígitos → prefixar com `55` → resultado 13 dígitos (DDD 2 + número 9)
- 12 dígitos → manter (já tem DDI 55 + DDD 2 + número 8)
- 13 dígitos → manter (já tem DDI 55 + DDD 2 + número 9)
- qualquer outro comprimento → retornar `null`

- [ ] **Passo 1: Escrever os testes de `normalizeWhatsApp`**

```typescript
// src/lib/__tests__/whatsapp.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeWhatsApp } from '../whatsapp'

describe('normalizeWhatsApp', () => {
  it('aceita 11 dígitos e prefixa com 55', () => {
    expect(normalizeWhatsApp('61912345678')).toBe('5561912345678')
  })

  it('aceita 10 dígitos e prefixa com 55', () => {
    expect(normalizeWhatsApp('6112345678')).toBe('556112345678')
  })

  it('aceita 13 dígitos (já com DDI) e mantém', () => {
    expect(normalizeWhatsApp('5561912345678')).toBe('5561912345678')
  })

  it('aceita 12 dígitos (DDI + DDD + 8) e mantém', () => {
    expect(normalizeWhatsApp('556112345678')).toBe('556112345678')
  })

  it('remove formatação antes de normalizar', () => {
    expect(normalizeWhatsApp('+55 (61) 9 1234-5678')).toBe('5561912345678')
  })

  it('retorna null para número muito curto', () => {
    expect(normalizeWhatsApp('123')).toBeNull()
  })

  it('retorna null para número com 14 dígitos', () => {
    expect(normalizeWhatsApp('55619123456789')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(normalizeWhatsApp('')).toBeNull()
  })
})
```

- [ ] **Passo 2: Rodar os testes para confirmar que falham**

```bash
npx vitest run src/lib/__tests__/whatsapp.test.ts
```

Saída esperada: FAIL — `normalizeWhatsApp is not a function` ou similar.

- [ ] **Passo 3: Implementar `normalizeWhatsApp`**

```typescript
// src/lib/whatsapp.ts
export function normalizeWhatsApp(input: string): string | null {
  const digits = input.replace(/\D/g, '')

  if (digits.length === 10) return `55${digits}`
  if (digits.length === 11) return `55${digits}`
  if (digits.length === 12) return digits
  if (digits.length === 13) return digits
  return null
}
```

- [ ] **Passo 4: Rodar os testes para confirmar que passam**

```bash
npx vitest run src/lib/__tests__/whatsapp.test.ts
```

Saída esperada: 8 testes passando.

- [ ] **Passo 5: Criar Server Action cadastrar-pessoa**

```typescript
// src/actions/admin/cadastrar-pessoa.ts
'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'

export async function cadastrarPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null
  const logradouro = (formData.get('logradouro') as string | null)?.trim() || null
  const complemento = (formData.get('complemento') as string | null)?.trim() || null
  const bairro = (formData.get('bairro') as string | null)?.trim() || null
  const cep = (formData.get('cep') as string | null)?.replace(/\D/g, '') || null

  if (!nome) throw new Error('Nome é obrigatório')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const whatsapp = whatsappRaw ? normalizeWhatsApp(whatsappRaw) : null
  if (whatsappRaw && !whatsapp) {
    throw new Error('Número de WhatsApp inválido')
  }

  const pessoa = await prisma.pessoa.create({
    data: {
      nome,
      whatsapp,
      email,
      genero,
      logradouro,
      complemento,
      bairro,
      cep,
      gabineteId: gabinete.id,
      regiaoId,
      profissaoId,
      isEquipe: false,
    },
  })

  redirect(`/${slug}/admin/pessoas/${pessoa.id}`)
}
```

- [ ] **Passo 6: Criar page de listagem de pessoas com formulário de cadastro**

```typescript
// src/app/[slug]/admin/pessoas/page.tsx
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { cadastrarPessoa } from '@/actions/admin/cadastrar-pessoa'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function PessoasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const q = searchParams.q?.trim() ?? ''

  const pessoas = await prisma.pessoa.findMany({
    where: {
      gabineteId: gabinete.id,
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { whatsapp: { contains: q } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { nome: 'asc' },
    take: 50,
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      isEquipe: true,
      regiao: { select: { nome: true } },
    },
  })

  const regioes = await prisma.regiao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  const profissoes = await prisma.profissao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pessoas</h1>
      </div>

      {/* Busca */}
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, WhatsApp ou e-mail..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Buscar
        </button>
      </form>

      {/* Cadastro manual */}
      <details className="bg-white rounded-lg shadow-sm">
        <summary className="px-4 py-3 text-sm font-medium cursor-pointer">
          + Cadastrar pessoa manualmente
        </summary>
        <form action={cadastrarPessoa} className="px-4 pb-4 space-y-3">
          <input type="hidden" name="slug" value={params.slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome *</label>
            <input
              name="nome"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
              <input
                name="whatsapp"
                placeholder="(61) 9 9999-9999"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">E-mail</label>
              <input
                name="email"
                type="email"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Região</label>
              <select
                name="regiaoId"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Selecionar...</option>
                {regioes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Profissão</label>
              <select
                name="profissaoId"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Selecionar...</option>
                {profissoes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gênero</label>
            <select
              name="genero"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Prefiro não informar / Não selecionado</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Cadastrar
          </button>
        </form>
      </details>

      {/* Listagem */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Região</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Equipe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pessoas.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/${params.slug}/admin/pessoas/${p.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {p.nome}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{p.whatsapp ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{p.regiao?.nome ?? '—'}</td>
                <td className="px-4 py-3">
                  {p.isEquipe && (
                    <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                      Equipe
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  Nenhuma pessoa encontrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Passo 7: Testar**

```bash
# http://localhost:3000/[slug]/admin/pessoas
# 1. Expandir "Cadastrar pessoa manualmente"
# 2. Preencher nome + WhatsApp "(61) 9 1234-5678" → Cadastrar
# 3. Deve redirecionar para ficha da pessoa recém-criada
# 4. Voltar para /pessoas → pessoa aparece na lista
# 5. Buscar por nome → filtra corretamente
# 6. WhatsApp inválido (ex: "123") → deve retornar erro
```

- [ ] **Passo 8: Commit**

```bash
git add src/lib/whatsapp.ts \
        src/lib/__tests__/whatsapp.test.ts \
        src/actions/admin/cadastrar-pessoa.ts \
        src/app/[slug]/admin/pessoas/page.tsx
git commit -m "feat: listagem de pessoas, cadastro manual e normalizeWhatsApp (TDD)"
```

---

### Task 7: Ficha de Pessoa + Toggle Equipe + Observações (Módulo 8)

**Files:**
- Create: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`
- Create: `src/actions/admin/editar-pessoa.ts`
- Create: `src/actions/admin/toggle-equipe.ts`
- Create: `src/actions/admin/criar-observacao.ts`
- Create: `src/actions/admin/editar-observacao.ts`
- Create: `src/actions/admin/excluir-observacao.ts`

**Interfaces:**
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts`
- Consome: `normalizeWhatsApp` de `src/lib/whatsapp.ts`
- Permissões de Observações:
  - `admin` (papel no `UsuarioGabinete`) ou `super-admin` com modo suporte: pode criar, editar e excluir qualquer observação
  - `isEquipe=true` (mobilizador da equipe): pode criar + editar/excluir somente as próprias (`autorUserId === session.user.id`)
  - Para determinar o papel do usuário atual, verificar `UsuarioGabinete.papel` na action

- [ ] **Passo 1: Criar Server Action editar-pessoa**

```typescript
// src/actions/admin/editar-pessoa.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'

export async function editarPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsappRaw = (formData.get('whatsapp') as string | null) ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const regiaoId = (formData.get('regiaoId') as string | null) || null
  const profissaoId = (formData.get('profissaoId') as string | null) || null
  const genero = (formData.get('genero') as string | null) || null
  const logradouro = (formData.get('logradouro') as string | null)?.trim() || null
  const complemento = (formData.get('complemento') as string | null)?.trim() || null
  const bairro = (formData.get('bairro') as string | null)?.trim() || null
  const cep = (formData.get('cep') as string | null)?.replace(/\D/g, '') || null

  if (!nome) throw new Error('Nome é obrigatório')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const whatsapp = whatsappRaw ? normalizeWhatsApp(whatsappRaw) : null
  if (whatsappRaw && !whatsapp) throw new Error('Número de WhatsApp inválido')

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { nome, whatsapp, email, genero, logradouro, complemento, bairro, cep, regiaoId, profissaoId },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Passo 2: Criar Server Action toggle-equipe**

```typescript
// src/actions/admin/toggle-equipe.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function toggleEquipe(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const acao = formData.get('acao') as 'marcar' | 'desmarcar'

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { isEquipe: acao === 'marcar' },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Passo 3: Criar Server Action criar-observacao**

```typescript
// src/actions/admin/criar-observacao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function criarObservacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const texto = (formData.get('texto') as string).trim()
  if (!texto) throw new Error('Texto é obrigatório')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  // Verificar que a pessoa pertence ao gabinete
  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!pessoa) throw new Error('Pessoa não encontrada')

  // Obter nome do autor
  const autorNome = session.user.user_metadata?.full_name as string | undefined
    ?? session.user.email
    ?? session.user.id

  await prisma.observacaoPessoa.create({
    data: {
      gabineteId: gabinete.id,
      pessoaId,
      autorUserId: session.user.id,
      autorNome: autorNome as string,
      texto,
    },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Passo 4: Criar Server Action editar-observacao**

```typescript
// src/actions/admin/editar-observacao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function editarObservacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const observacaoId = formData.get('observacaoId') as string
  const texto = (formData.get('texto') as string).trim()
  if (!texto) throw new Error('Texto é obrigatório')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const obs = await prisma.observacaoPessoa.findFirst({
    where: { id: observacaoId, gabineteId: gabinete.id },
    select: { autorUserId: true },
  })
  if (!obs) throw new Error('Observação não encontrada')

  const role = session.user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })

  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isAutor = obs.autorUserId === session.user.id

  if (!isAdmin && !isAutor) throw new Error('Sem permissão para editar esta observação')

  await prisma.observacaoPessoa.update({
    where: { id: observacaoId },
    data: { texto, editadoEm: new Date() },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Passo 5: Criar Server Action excluir-observacao**

```typescript
// src/actions/admin/excluir-observacao.ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function excluirObservacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const observacaoId = formData.get('observacaoId') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const obs = await prisma.observacaoPessoa.findFirst({
    where: { id: observacaoId, gabineteId: gabinete.id },
    select: { autorUserId: true },
  })
  if (!obs) throw new Error('Observação não encontrada')

  const role = session.user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })

  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isAutor = obs.autorUserId === session.user.id

  if (!isAdmin && !isAutor) throw new Error('Sem permissão para excluir esta observação')

  await prisma.observacaoPessoa.delete({ where: { id: observacaoId } })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
```

- [ ] **Passo 6: Criar page da ficha de pessoa**

```typescript
// src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { editarPessoa } from '@/actions/admin/editar-pessoa'
import { toggleEquipe } from '@/actions/admin/toggle-equipe'
import { criarObservacao } from '@/actions/admin/criar-observacao'
import { editarObservacao } from '@/actions/admin/editar-observacao'
import { excluirObservacao } from '@/actions/admin/excluir-observacao'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export default async function FichaPessoaPage({
  params,
}: {
  params: { slug: string; pessoaId: string }
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

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: params.pessoaId, gabineteId: gabinete.id },
    include: {
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      observacoes: { orderBy: { criadoEm: 'desc' } },
    },
  })
  if (!pessoa) notFound()

  const regioes = await prisma.regiao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  const profissoes = await prisma.profissao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  const role = session.user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{pessoa.nome}</h1>
        {pessoa.isEquipe && (
          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
            Membro da Equipe
          </span>
        )}
      </div>

      {/* Toggle equipe */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        {pessoa.isEquipe ? (
          <form action={toggleEquipe}>
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="pessoaId" value={pessoa.id} />
            <input type="hidden" name="acao" value="desmarcar" />
            <button
              type="submit"
              className="text-sm text-red-600 hover:underline"
              onClick={(e) => {
                if (!confirm(`Remover ${pessoa.nome} da equipe?`)) e.preventDefault()
              }}
            >
              Remover da equipe
            </button>
          </form>
        ) : (
          <form action={toggleEquipe}>
            <input type="hidden" name="slug" value={params.slug} />
            <input type="hidden" name="pessoaId" value={pessoa.id} />
            <input type="hidden" name="acao" value="marcar" />
            <button type="submit" className="text-sm text-green-700 hover:underline">
              Adicionar à equipe
            </button>
          </form>
        )}
      </div>

      {/* Formulário de edição */}
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Dados</h2>
        <form action={editarPessoa} className="space-y-4">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="pessoaId" value={pessoa.id} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome *</label>
            <input
              name="nome"
              required
              defaultValue={pessoa.nome}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
              <input
                name="whatsapp"
                defaultValue={pessoa.whatsapp ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">E-mail</label>
              <input
                name="email"
                type="email"
                defaultValue={pessoa.email ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Região</label>
              <select
                name="regiaoId"
                defaultValue={pessoa.regiaoId ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Selecionar...</option>
                {regioes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Profissão</label>
              <select
                name="profissaoId"
                defaultValue={pessoa.profissaoId ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Selecionar...</option>
                {profissoes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gênero</label>
            <select
              name="genero"
              defaultValue={pessoa.genero ?? ''}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Não informado</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Logradouro</label>
              <input
                name="logradouro"
                defaultValue={pessoa.logradouro ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Complemento</label>
              <input
                name="complemento"
                defaultValue={pessoa.complemento ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Bairro</label>
              <input
                name="bairro"
                defaultValue={pessoa.bairro ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">CEP</label>
              <input
                name="cep"
                defaultValue={pessoa.cep ?? ''}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Salvar alterações
          </button>
        </form>
      </section>

      {/* Observações */}
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Observações</h2>

        {/* Nova observação */}
        <form action={criarObservacao} className="space-y-2">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="pessoaId" value={pessoa.id} />
          <textarea
            name="texto"
            required
            rows={3}
            placeholder="Adicionar observação..."
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Adicionar observação
          </button>
        </form>

        {/* Lista de observações */}
        <div className="space-y-3 mt-4">
          {pessoa.observacoes.map((obs) => {
            const podeEditar = isAdmin || obs.autorUserId === session.user.id
            return (
              <div key={obs.id} className="border border-gray-200 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {obs.autorNome} —{' '}
                    {new Date(obs.criadoEm).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {obs.editadoEm && ' (editado)'}
                  </span>
                  {podeEditar && (
                    <div className="flex gap-3">
                      <form action={excluirObservacao}>
                        <input type="hidden" name="slug" value={params.slug} />
                        <input type="hidden" name="pessoaId" value={pessoa.id} />
                        <input type="hidden" name="observacaoId" value={obs.id} />
                        <button
                          type="submit"
                          className="text-red-600 text-xs hover:underline"
                        >
                          Excluir
                        </button>
                      </form>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{obs.texto}</p>
                {podeEditar && (
                  <form action={editarObservacao} className="space-y-1">
                    <input type="hidden" name="slug" value={params.slug} />
                    <input type="hidden" name="pessoaId" value={pessoa.id} />
                    <input type="hidden" name="observacaoId" value={obs.id} />
                    <textarea
                      name="texto"
                      required
                      rows={2}
                      defaultValue={obs.texto}
                      className="block w-full border border-gray-200 rounded px-2 py-1 text-sm"
                    />
                    <button
                      type="submit"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Salvar edição
                    </button>
                  </form>
                )}
              </div>
            )
          })}
          {pessoa.observacoes.length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma observação ainda.</p>
          )}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Passo 7: Testar ficha de pessoa**

```bash
# http://localhost:3000/[slug]/admin/pessoas/[pessoaId]
# 1. Editar nome + whatsapp → Salvar → dados atualizados
# 2. Clicar "Adicionar à equipe" → badge "Membro da Equipe" aparece
# 3. Clicar "Remover da equipe" → confirm dialog → badge some
# 4. Adicionar observação → aparece na lista com nome do autor e data
# 5. Editar observação → texto atualizado com "(editado)" marcado
# 6. Excluir observação → some da lista
# 7. Logar como mobilizador (isEquipe=true, sem UsuarioGabinete papel='admin'):
#    → pode criar observação
#    → pode editar/excluir apenas as próprias
#    → não vê botão de editar/excluir nas observações alheias
```

- [ ] **Passo 8: Commit**

```bash
git add src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx \
        src/actions/admin/editar-pessoa.ts \
        src/actions/admin/toggle-equipe.ts \
        src/actions/admin/criar-observacao.ts \
        src/actions/admin/editar-observacao.ts \
        src/actions/admin/excluir-observacao.ts
git commit -m "feat: ficha de pessoa com edição, toggle equipe e observações"
```

---

## Auto-Review

**Cobertura da spec:**

| Módulo | Tasks que cobrem |
|---|---|
| Módulo 2 — Segmentos (CRUD + link + QR code) | Task 5 |
| Módulo 5 — Personalização (textos + logo + banner) | Task 2 |
| Módulo 7a — Regiões | Task 3 |
| Módulo 7b — Profissões | Task 4 |
| Módulo 8 — Observações em perfis | Task 7 (observacoes) |
| Layout admin + guards | Task 1 |
| Listagem e cadastro manual de pessoas | Task 6 |
| Ficha de pessoa (editar + isEquipe) | Task 7 |
| `normalizeWhatsApp` TDD | Task 6 |
| Seed regiões DF (35) na criação do gabinete | Task 3 |
| Seed profissões (17) na criação do gabinete | Task 4 |
| Banner modo suporte no layout | Task 1 |
| Botão "Sair do modo suporte" | Task 1 (chama action do Plano 2) |

**Verificações de placeholder:** Nenhum "TBD", "TODO" ou "implementar depois" encontrado.

**Consistência de tipos:**
- `getGabineteBySlug` retornado em Task 1, consumido em Tasks 2-7 — assinatura consistente
- `normalizeWhatsApp(input: string): string | null` definida em Task 6, consumida em Tasks 6 e 7
- `seedRegioes(gabineteId: string)` definida em Task 3, chamada em Task 3 (criar-gabinete)
- `seedProfissoes(gabineteId: string)` definida em Task 4, chamada em Task 4 (criar-gabinete)
- `toggleEquipe` recebe `acao: 'marcar' | 'desmarcar'` — consistente com o formulário

**Pré-requisitos externos:**
- Bucket `gabinete-assets` público no Supabase Dashboard (Task 2)
- `NEXT_PUBLIC_APP_URL` no `.env.local` (Task 5)
- `npm install qrcode @types/qrcode` (Task 5)
