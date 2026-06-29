# Ordenação, Colunas de Rede e Navegação em Cascata — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ordenação por nome, colunas de Redes/Cadastros nas redes e navegação em cascata pela árvore da rede em todas as listagens de pessoas.

**Architecture:** URL params (`?sort`, `?order`, `?rede`, `?path`) controlam ordenação e navegação — server components releem os params a cada request, sem state no cliente. Um client component `SortableHeader` apenas empurra a nova URL. A contagem de redes usa `_count` aninhado do Prisma processado em TypeScript.

**Tech Stack:** Next.js 14 App Router (server components), Prisma 7, Tailwind CSS, Vitest

## Global Constraints

- Manter `take: 50` na paginação existente
- `deletedAt: null` em todos os filtros de Pessoa e VinculoRede
- Zeros exibidos como `—` (em dash) nas colunas Redes e Cadastros nas redes
- Links de zero não são clicáveis
- Tailwind CSS — sem CSS externo
- Server components sempre; client component somente para `SortableHeader`
- `'use client'` só no `SortableHeader`

---

## Mapa de Arquivos

| Arquivo | Ação |
|---|---|
| `src/components/SortableHeader.tsx` | CRIAR — client component para cabeçalho ordenável |
| `src/app/[slug]/admin/pessoas/page.tsx` | MODIFICAR — sort + novas colunas + cascata + breadcrumb |
| `src/app/[slug]/mobilizador/page.tsx` | MODIFICAR — seção convidados → contagem + link |
| `src/app/[slug]/mobilizador/rede/page.tsx` | CRIAR — listagem da rede do mobilizador com cascata |
| `src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx` | CRIAR — perfil read-only para mobilizador |

---

## Task 1: SortableHeader — client component de ordenação

**Files:**
- Create: `src/components/SortableHeader.tsx`

**Interfaces:**
- Produces: `<SortableHeader label="Nome" field="nome" />` — lê `?sort` e `?order` da URL atual, cicla os estados e chama `router.push`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/components/SortableHeader.tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Suspense } from 'react'

type Props = {
  label: string
  field: string
}

function SortableHeaderInner({ label, field }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentSort = searchParams.get('sort')
  const currentOrder = searchParams.get('order')

  const isActive = currentSort === field
  const isAsc = isActive && currentOrder === 'asc'

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('sort')
    params.delete('order')

    if (!isActive) {
      // padrão → asc
      params.set('sort', field)
      params.set('order', 'asc')
    } else if (isAsc) {
      // asc → desc
      params.set('sort', field)
      params.set('order', 'desc')
    }
    // desc → padrão (params já limpos acima)

    router.push(`${pathname}?${params.toString()}`)
  }

  const icon = !isActive ? '↕' : isAsc ? '↑' : '↓'

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
    >
      {label} <span className="text-gray-400 text-xs">{icon}</span>
    </button>
  )
}

export default function SortableHeader(props: Props) {
  return (
    <Suspense fallback={<span className="font-medium text-gray-600">{props.label}</span>}>
      <SortableHeaderInner {...props} />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verificar que o arquivo não tem erros de TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep SortableHeader
```

Esperado: sem saída (sem erros).

- [ ] **Step 3: Commit**

```bash
git add src/components/SortableHeader.tsx
git commit -m "feat: SortableHeader — client component de ordenação por URL param"
```

---

## Task 2: Admin pessoas page — ordenação + colunas de rede

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/page.tsx`

**Interfaces:**
- Consumes: `SortableHeader` de `@/components/SortableHeader`
- Produces: tabela com colunas `Nome | WhatsApp | Região | Redes | Cadastros nas redes | Colaborador | Mobilizador`

- [ ] **Step 1: Reescrever `src/app/[slug]/admin/pessoas/page.tsx`**

Substitua o conteúdo inteiro do arquivo:

```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { cadastrarPessoa } from '@/actions/admin/cadastrar-pessoa'
import SortableHeader from '@/components/SortableHeader'

const pessoaSelect = {
  id: true,
  nome: true,
  whatsapp: true,
  isColaborador: true,
  isMobilizador: true,
  regiao: { select: { nome: true } },
  _count: { select: { redesComoIndicador: { where: { deletedAt: null } } } },
  redesComoIndicador: {
    where: { deletedAt: null },
    select: {
      pessoa: {
        select: {
          _count: { select: { redesComoIndicador: { where: { deletedAt: null } } } },
        },
      },
    },
  },
} as const

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
}

function buildRedeUrl(slug: string, pessoaId: string, currentPathIds: string[]): string {
  const newPath = [...currentPathIds, pessoaId].join(',')
  return `/${slug}/admin/pessoas?rede=${pessoaId}&path=${newPath}`
}

export default async function PessoasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; sort?: string; order?: string; rede?: string; path?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const q = searchParams.q?.trim() ?? ''
  const { sort, order, rede, path } = searchParams
  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []

  const searchFilter = q
    ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { whatsapp: { contains: q } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  // Busca pessoas (cascata ou todas)
  let pessoasRaw: Awaited<ReturnType<typeof prisma.pessoa.findMany<{ select: typeof pessoaSelect }>>> = []

  if (rede) {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: rede, gabineteId: gabinete.id, deletedAt: null },
      select: { pessoaId: true },
    })
    const ids = vinculos.map((v) => v.pessoaId)
    if (ids.length > 0) {
      pessoasRaw = await prisma.pessoa.findMany({
        where: { id: { in: ids }, deletedAt: null, ...searchFilter },
        orderBy,
        take: 50,
        select: pessoaSelect,
      })
    }
  } else {
    pessoasRaw = await prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, deletedAt: null, ...searchFilter },
      orderBy,
      take: 50,
      select: pessoaSelect,
    })
  }

  const pessoas = pessoasRaw.map((p) => ({
    ...p,
    totalRedes: p._count.redesComoIndicador,
    totalCadastros: p.redesComoIndicador.reduce(
      (acc, v) => acc + v.pessoa._count.redesComoIndicador,
      0
    ),
  }))

  // Breadcrumb
  const breadcrumbPessoas =
    pathIds.length > 0
      ? await prisma.pessoa.findMany({
          where: { id: { in: pathIds }, gabineteId: gabinete.id },
          select: { id: true, nome: true },
        })
      : []

  const breadcrumb = pathIds
    .map((id) => breadcrumbPessoas.find((p) => p.id === id))
    .filter(Boolean) as { id: string; nome: string }[]

  // Formulário de cadastro
  const [regioes, profissoes] = await Promise.all([
    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.profissao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Pessoas</h1>

      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <nav className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
          <Link href={`/${params.slug}/admin/pessoas`} className="hover:text-gray-900">
            Pessoas
          </Link>
          {breadcrumb.map((item, i) => {
            const isLast = i === breadcrumb.length - 1
            const crumbPath = pathIds.slice(0, i + 1).join(',')
            return (
              <span key={item.id} className="flex items-center gap-1">
                <span>›</span>
                {isLast ? (
                  <span className="text-gray-900 font-medium">Rede de {item.nome}</span>
                ) : (
                  <Link
                    href={`/${params.slug}/admin/pessoas?rede=${item.id}&path=${crumbPath}`}
                    className="hover:text-gray-900"
                  >
                    Rede de {item.nome}
                  </Link>
                )}
              </span>
            )
          })}
        </nav>
      )}

      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, WhatsApp ou e-mail..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Buscar
        </button>
      </form>

      {!rede && (
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
                <label className="block text-sm font-medium text-gray-700">WhatsApp *</label>
                <input
                  name="whatsapp"
                  required
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
                <option value="">Prefiro não informar</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
              Cadastrar
            </button>
          </form>
        </details>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Nome" field="nome" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Região</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Redes</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Cadastros nas redes</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Mobilizador</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pessoas.map((p) => {
              const redeUrl = buildRedeUrl(params.slug, p.id, pathIds)
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${params.slug}/admin/pessoas/${p.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {p.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.whatsapp}</td>
                  <td className="px-4 py-3 text-gray-600">{p.regiao?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {p.totalRedes === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <Link href={redeUrl} className="text-blue-600 hover:underline font-medium">
                        {p.totalRedes}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.totalCadastros === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <Link href={redeUrl} className="text-blue-600 hover:underline font-medium">
                        {p.totalCadastros}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.isColaborador && (
                      <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                        Colaborador
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.isMobilizador && (
                      <Link
                        href={redeUrl}
                        className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full hover:bg-purple-200"
                      >
                        Mobilizador
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
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

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "pessoas/page"
```

Esperado: sem erros.

- [ ] **Step 3: Testar manualmente no browser**

Acesse `http://localhost:3001/[slug]/admin/pessoas`:
- Colunas "Redes" e "Cadastros nas redes" aparecem
- Clicar em "Nome" cicla os ícones ↕ → ↑ → ↓ → ↕
- Pessoa com `totalRedes > 0`: número clicável em azul
- Pessoa com `totalRedes = 0`: exibe `—` não clicável
- Clicar no número de Redes ou no badge Mobilizador navega para a rede
- Breadcrumb aparece ao navegar
- Itens do breadcrumb são clicáveis e voltam ao nível correto

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/pessoas/page.tsx
git commit -m "feat: admin pessoas — ordenação, colunas de rede e navegação em cascata"
```

---

## Task 3: Mobilizador page — atualizar seção de convidados

**Files:**
- Modify: `src/app/[slug]/mobilizador/page.tsx`

**Interfaces:**
- Consumes: nada novo
- Produces: seção "Minha rede" com contagem e link para `/mobilizador/rede`

- [ ] **Step 1: Substituir a seção `convidados` na page do mobilizador**

No arquivo `src/app/[slug]/mobilizador/page.tsx`, localize e substitua a query de `convidados` e a section correspondente.

Troque a query de convidados (atualmente `vinculoRede.findMany`) por uma contagem simples:

```typescript
// Substituir:
const convidados = await prisma.vinculoRede.findMany({
  where: { gabineteId: gabinete.id, indicadoPorId: pessoa.id, deletedAt: null },
  orderBy: { criadoEm: 'desc' },
  select: {
    id: true,
    criadoEm: true,
    pessoa: { select: { id: true, nome: true, whatsapp: true, isMobilizador: true } },
  },
})

// Por:
const totalConvidados = await prisma.vinculoRede.count({
  where: { gabineteId: gabinete.id, indicadoPorId: pessoa.id, deletedAt: null },
})
```

Troque a section inteira de "Pessoas convidadas":

```typescript
// Substituir a section de convidados por:
<section className="bg-white rounded-lg p-6 shadow-sm space-y-3">
  <div className="flex items-center justify-between">
    <h2 className="text-base font-semibold text-gray-800">
      Minha rede ({totalConvidados})
    </h2>
    {totalConvidados > 0 && (
      <Link
        href={`/${params.slug}/mobilizador/rede`}
        className="text-sm text-blue-600 hover:underline"
      >
        Ver rede →
      </Link>
    )}
  </div>
  {totalConvidados === 0 && (
    <p className="text-sm text-gray-500">Nenhuma pessoa convidada ainda.</p>
  )}
</section>
```

Certifique-se de que `Link` está importado do `next/link` (já deve estar ou adicionar a importação).

Remover imports de `PromoverMobilizadorDialog` se não for mais usado nesta page (verificar se é usado em outro lugar na mesma página antes de remover).

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "mobilizador/page"
```

Esperado: sem erros.

- [ ] **Step 3: Testar manualmente**

Acesse como mobilizador: seção "Minha rede" mostra contagem e link "Ver rede →". Clicar no link navega para `/mobilizador/rede`.

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/mobilizador/page.tsx
git commit -m "feat: mobilizador page — seção de rede com contagem e link para /rede"
```

---

## Task 4: Mobilizador rede page — tabela completa com cascata

**Files:**
- Create: `src/app/[slug]/mobilizador/rede/page.tsx`

**Interfaces:**
- Consumes: `SortableHeader` de `@/components/SortableHeader`
- Produces: página com tabela e cascata, acessível em `/[slug]/mobilizador/rede`

- [ ] **Step 1: Criar `src/app/[slug]/mobilizador/rede/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import SortableHeader from '@/components/SortableHeader'

const pessoaSelect = {
  id: true,
  nome: true,
  whatsapp: true,
  isColaborador: true,
  isMobilizador: true,
  regiao: { select: { nome: true } },
  _count: { select: { redesComoIndicador: { where: { deletedAt: null } } } },
  redesComoIndicador: {
    where: { deletedAt: null },
    select: {
      pessoa: {
        select: {
          _count: { select: { redesComoIndicador: { where: { deletedAt: null } } } },
        },
      },
    },
  },
} as const

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
}

function buildRedeUrl(slug: string, pessoaId: string, currentPathIds: string[]): string {
  const newPath = [...currentPathIds, pessoaId].join(',')
  return `/${slug}/mobilizador/rede?rede=${pessoaId}&path=${newPath}`
}

export default async function MobilizadorRedePage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { sort?: string; order?: string; rede?: string; path?: string }
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

  const mobilizadorPessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true },
  })
  if (!mobilizadorPessoa) notFound()

  const { sort, order, rede, path } = searchParams
  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []

  // ID do mobilizador atual para a rede raiz
  const indicadorId = rede ?? mobilizadorPessoa.id

  const vinculos = await prisma.vinculoRede.findMany({
    where: { indicadoPorId: indicadorId, gabineteId: gabinete.id, deletedAt: null },
    select: { pessoaId: true },
  })
  const ids = vinculos.map((v) => v.pessoaId)

  const pessoasRaw =
    ids.length > 0
      ? await prisma.pessoa.findMany({
          where: { id: { in: ids }, deletedAt: null },
          orderBy,
          take: 50,
          select: pessoaSelect,
        })
      : []

  const pessoas = pessoasRaw.map((p) => ({
    ...p,
    totalRedes: p._count.redesComoIndicador,
    totalCadastros: p.redesComoIndicador.reduce(
      (acc, v) => acc + v.pessoa._count.redesComoIndicador,
      0
    ),
  }))

  // Breadcrumb — a raiz é sempre "Minha Rede"
  const breadcrumbPessoas =
    pathIds.length > 0
      ? await prisma.pessoa.findMany({
          where: { id: { in: pathIds }, gabineteId: gabinete.id },
          select: { id: true, nome: true },
        })
      : []

  const breadcrumb = pathIds
    .map((id) => breadcrumbPessoas.find((p) => p.id === id))
    .filter(Boolean) as { id: string; nome: string }[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Minha Rede</h1>
        <Link href={`/${params.slug}/mobilizador`} className="text-sm text-gray-500 hover:underline">
          ← Voltar
        </Link>
      </div>

      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <nav className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
          <Link href={`/${params.slug}/mobilizador/rede`} className="hover:text-gray-900">
            Minha Rede
          </Link>
          {breadcrumb.map((item, i) => {
            const isLast = i === breadcrumb.length - 1
            const crumbPath = pathIds.slice(0, i + 1).join(',')
            return (
              <span key={item.id} className="flex items-center gap-1">
                <span>›</span>
                {isLast ? (
                  <span className="text-gray-900 font-medium">Rede de {item.nome}</span>
                ) : (
                  <Link
                    href={`/${params.slug}/mobilizador/rede?rede=${item.id}&path=${crumbPath}`}
                    className="hover:text-gray-900"
                  >
                    Rede de {item.nome}
                  </Link>
                )}
              </span>
            )
          })}
        </nav>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Nome" field="nome" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Região</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Redes</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Cadastros nas redes</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Mobilizador</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pessoas.map((p) => {
              const redeUrl = buildRedeUrl(params.slug, p.id, pathIds)
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${params.slug}/mobilizador/pessoas/${p.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {p.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.whatsapp}</td>
                  <td className="px-4 py-3 text-gray-600">{p.regiao?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {p.totalRedes === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <Link href={redeUrl} className="text-blue-600 hover:underline font-medium">
                        {p.totalRedes}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.totalCadastros === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <Link href={redeUrl} className="text-blue-600 hover:underline font-medium">
                        {p.totalCadastros}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.isColaborador && (
                      <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                        Colaborador
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.isMobilizador && (
                      <Link
                        href={redeUrl}
                        className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full hover:bg-purple-200"
                      >
                        Mobilizador
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Nenhuma pessoa nesta rede
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

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "mobilizador/rede"
```

Esperado: sem erros.

- [ ] **Step 3: Testar manualmente**

Acesse como mobilizador → "Ver rede →":
- Tabela com todas as colunas
- Ordenação por nome funciona
- Clicar em número de Redes navega para sub-rede com breadcrumb
- Breadcrumb "Minha Rede › Rede de [nome]" aparece, itens clicáveis
- Clicar em "← Voltar" retorna à página principal do mobilizador

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/mobilizador/rede/page.tsx
git commit -m "feat: mobilizador/rede — tabela com cascata, breadcrumb e ordenação"
```

---

## Task 5: Mobilizador pessoas/[pessoaId] — perfil read-only

**Files:**
- Create: `src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx`

**Interfaces:**
- Produces: página de perfil read-only acessível em `/[slug]/mobilizador/pessoas/[pessoaId]`

- [ ] **Step 1: Criar `src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export default async function MobilizadorPessoaPage({
  params,
}: {
  params: { slug: string; pessoaId: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: params.pessoaId, gabineteId: gabinete.id, deletedAt: null },
    include: {
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      observacoes: {
        where: { deletedAt: null },
        orderBy: { criadoEm: 'desc' },
        select: { id: true, texto: true, autorNome: true, criadoEm: true },
      },
    },
  })
  if (!pessoa) notFound()

  const demandas = await prisma.demanda.findMany({
    where: { solicitanteId: pessoa.id, gabineteId: gabinete.id, deletedAt: null },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      area: { select: { nome: true } },
    },
  })

  const statusLabel: Record<string, string> = {
    aberta: 'Em aberto',
    expirada: 'Expirada',
    atendida: 'Atendida',
    nao_atendida: 'Não atendida',
  }
  const statusCor: Record<string, string> = {
    aberta: 'text-yellow-600',
    expirada: 'text-orange-600',
    atendida: 'text-green-600',
    nao_atendida: 'text-red-600',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{pessoa.nome}</h1>
        <Link href={`/${params.slug}/mobilizador/rede`} className="text-sm text-gray-500 hover:underline">
          ← Voltar
        </Link>
      </div>

      {/* Dados cadastrais */}
      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Dados cadastrais</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500">WhatsApp</p>
            <p className="font-medium">{pessoa.whatsapp}</p>
          </div>
          {pessoa.email && (
            <div>
              <p className="text-gray-500">E-mail</p>
              <p className="font-medium">{pessoa.email}</p>
            </div>
          )}
          {pessoa.regiao && (
            <div>
              <p className="text-gray-500">Região</p>
              <p className="font-medium">{pessoa.regiao.nome}</p>
            </div>
          )}
          {pessoa.profissao && (
            <div>
              <p className="text-gray-500">Profissão</p>
              <p className="font-medium">{pessoa.profissao.nome}</p>
            </div>
          )}
          {pessoa.genero && (
            <div>
              <p className="text-gray-500">Gênero</p>
              <p className="font-medium capitalize">{pessoa.genero}</p>
            </div>
          )}
          {pessoa.nascimento && (
            <div>
              <p className="text-gray-500">Nascimento</p>
              <p className="font-medium">
                {new Date(pessoa.nascimento).toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          {pessoa.isColaborador && (
            <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
              Colaborador
            </span>
          )}
          {pessoa.isMobilizador && (
            <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full">
              Mobilizador
            </span>
          )}
        </div>
      </div>

      {/* Observações */}
      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-800">
          Observações ({pessoa.observacoes.length})
        </h2>
        {pessoa.observacoes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma observação registrada.</p>
        ) : (
          <ul className="divide-y divide-gray-100 space-y-0">
            {pessoa.observacoes.map((obs) => (
              <li key={obs.id} className="py-3">
                <p className="text-sm text-gray-800">{obs.texto}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {obs.autorNome} · {new Date(obs.criadoEm).toLocaleDateString('pt-BR')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Demandas */}
      <div className="bg-white rounded-lg p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-800">
          Demandas ({demandas.length})
        </h2>
        {demandas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma demanda registrada.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {demandas.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.titulo}</p>
                    <p className="text-xs text-gray-500">
                      {d.area.nome} · Prazo:{' '}
                      {new Date(d.prazoDesfecho).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${statusCor[d.status] ?? 'text-gray-600'}`}>
                    {statusLabel[d.status] ?? d.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "mobilizador/pessoas"
```

Esperado: sem erros.

- [ ] **Step 3: Testar manualmente**

Na lista `/mobilizador/rede`, clicar no nome de uma pessoa:
- Abre `/mobilizador/pessoas/[id]`
- Dados cadastrais exibidos corretamente
- Observações e demandas carregam (podem estar vazias)
- Link "← Voltar" retorna para `/mobilizador/rede`

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx
git commit -m "feat: mobilizador — perfil read-only de pessoa da rede"
```

---

## Checklist de Verificação Final

Após todas as tasks:

- [ ] Admin: colunas Redes e Cadastros nas redes visíveis
- [ ] Admin: zeros exibidos como `—`, não clicáveis
- [ ] Admin: ordenação por nome funciona nos 3 estados
- [ ] Admin: clicar em Redes, Cadastros ou badge Mobilizador navega para a rede
- [ ] Admin: breadcrumb aparece e os itens são clicáveis
- [ ] Admin: clicar no nome abre o perfil completo (`/admin/pessoas/[id]`)
- [ ] Mobilizador: seção "Minha rede" mostra contagem e link
- [ ] Mobilizador: `/rede` tem tabela completa com todas as colunas
- [ ] Mobilizador: navegação em cascata funciona na `/rede`
- [ ] Mobilizador: clicar no nome abre perfil read-only (`/mobilizador/pessoas/[id]`)
- [ ] TypeScript sem erros: `npx tsc --noEmit`
