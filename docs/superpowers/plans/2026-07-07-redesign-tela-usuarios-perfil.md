# Redesign Tela de Usuários e Perfil do Usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de listagem de pessoas (renomeada para "Usuários") e a tela de perfil de pessoa no painel `/[slug]/admin`, seguindo o briefing de UI fornecido, e trocar o topo horizontal atual por um menu lateral + topbar pretos.

**Architecture:** Componentes de apresentação novos em `src/components/admin/` (Sidebar, Topbar, Avatar, SegmentPills, Pagination, Modal, VerMaisList) reutilizados pelas duas páginas. Lógica pura extraída em `src/lib/` com testes vitest. As páginas (`pessoas/page.tsx` e `pessoas/[pessoaId]/page.tsx`) continuam Server Components que buscam dados via Prisma e compõem os componentes; interatividade (checkbox, expandir pills, modal, paginação de "ver mais") fica isolada em Client Components.

**Tech Stack:** Next.js App Router (Server Actions), Prisma, Tailwind CSS (sem biblioteca de ícones — usar emoji, seguindo a notação do próprio briefing: ✏️ 🗑️ 🔍 🔔 👤). Vitest (`environment: 'node'`, sem DOM) para lógica pura.

## Global Constraints

- Responder sempre em português do Brasil em qualquer texto de UI (labels, mensagens, placeholders).
- Não criar nenhuma feature de Banco de Talentos / Currículo, Importar/Exportar, Tarefas ou Link de Cadastro nesta rodada — apenas itens de menu visualmente presentes e desabilitados ("em breve"), sem rota nem lógica.
- Não criar sistema de notificações — o sino da topbar é decorativo, sem contagem real.
- Campos do grid de perfil que não existem no schema (`CPF`, `Orientação Sexual`, `Religião`, `Vínculo`, `Escolaridade`, `Telefone Fixo`) **não devem aparecer** — só os campos abaixo, que existem em `Pessoa` (ver `prisma/schema.prisma:85-125`).
- "Cidade" no grid usa `Regiao.nome` (não existe campo cidade separado).
- Seguir o briefing à risca nas colunas da tabela de Usuários — as colunas antigas de navegação em cascata de redes (`Redes`, `Cadastros nas redes`, breadcrumb) saem da tabela padrão; a navegação em cascata continua funcionando via querystring `?rede=&path=` (já implementada em `pessoas/page.tsx`), acessada agora a partir do link no bloco de rede do perfil (Task 8), não mais por uma coluna da tabela.
- Não existe biblioteca de testes de componente (sem `@testing-library/react`, `vitest.config.ts` usa `environment: 'node'`). Tarefas de componente/página são verificadas manualmente no navegador (dev server), não com testes automatizados de DOM — isso é declarado explicitamente em cada tarefa de UI, em vez de forjar testes que não rodam.
- Reaproveitar Server Actions já existentes (`cadastrarPessoa`, `softDeletePessoa`, `editarPessoa`, `criarObservacao`, `editarObservacao`, `excluirObservacao`, `toggleColaborador`) sem alterar suas assinaturas.

---

## Task 1: Funções puras utilitárias (tipo de conta, status de demanda, paginação)

**Files:**
- Create: `src/lib/tipo-conta.ts`
- Create: `src/lib/status-demanda.ts`
- Create: `src/lib/paginacao.ts`
- Test: `src/lib/tipo-conta.test.ts`
- Test: `src/lib/status-demanda.test.ts`
- Test: `src/lib/paginacao.test.ts`

**Interfaces:**
- Produces: `mapPapelParaTipoConta(papel: string | null | undefined): 'Administrador' | 'Mobilizador' | '—'`
- Produces: `statusDemandaPill(status: string): { label: string; corClasse: string }`
- Produces: `foiAtendidaPill(status: string): { label: string; corClasse: string }`
- Produces: `paginar(totalItens: number, paginaAtual: number, tamanhoPagina: number): { paginaAtual: number; totalPaginas: number; skip: number; take: number }`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/tipo-conta.test.ts
import { describe, it, expect } from 'vitest'
import { mapPapelParaTipoConta } from './tipo-conta'

describe('mapPapelParaTipoConta', () => {
  it('retorna Administrador para papel admin', () => {
    expect(mapPapelParaTipoConta('admin')).toBe('Administrador')
  })
  it('retorna Mobilizador para papel mobilizador', () => {
    expect(mapPapelParaTipoConta('mobilizador')).toBe('Mobilizador')
  })
  it('retorna — para null', () => {
    expect(mapPapelParaTipoConta(null)).toBe('—')
  })
  it('retorna — para undefined', () => {
    expect(mapPapelParaTipoConta(undefined)).toBe('—')
  })
  it('retorna — para papel desconhecido', () => {
    expect(mapPapelParaTipoConta('outro')).toBe('—')
  })
})
```

```typescript
// src/lib/status-demanda.test.ts
import { describe, it, expect } from 'vitest'
import { statusDemandaPill, foiAtendidaPill } from './status-demanda'

describe('statusDemandaPill', () => {
  it('atendida -> CONCLUÍDO verde', () => {
    expect(statusDemandaPill('atendida')).toEqual({ label: 'CONCLUÍDO', corClasse: 'bg-green-100 text-green-800' })
  })
  it('aberta -> PENDENTE amarelo', () => {
    expect(statusDemandaPill('aberta')).toEqual({ label: 'PENDENTE', corClasse: 'bg-yellow-100 text-yellow-800' })
  })
  it('expirada -> PENDENTE amarelo', () => {
    expect(statusDemandaPill('expirada')).toEqual({ label: 'PENDENTE', corClasse: 'bg-yellow-100 text-yellow-800' })
  })
  it('nao_atendida -> NÃO ATENDIDA vermelho', () => {
    expect(statusDemandaPill('nao_atendida')).toEqual({ label: 'NÃO ATENDIDA', corClasse: 'bg-red-100 text-red-800' })
  })
})

describe('foiAtendidaPill', () => {
  it('atendida -> SIM verde', () => {
    expect(foiAtendidaPill('atendida')).toEqual({ label: 'SIM', corClasse: 'bg-green-100 text-green-800' })
  })
  it('nao_atendida -> NÃO vermelho', () => {
    expect(foiAtendidaPill('nao_atendida')).toEqual({ label: 'NÃO', corClasse: 'bg-red-100 text-red-800' })
  })
  it('aberta -> — cinza', () => {
    expect(foiAtendidaPill('aberta')).toEqual({ label: '—', corClasse: 'bg-gray-100 text-gray-500' })
  })
})
```

```typescript
// src/lib/paginacao.test.ts
import { describe, it, expect } from 'vitest'
import { paginar } from './paginacao'

describe('paginar', () => {
  it('calcula skip/take e total de páginas', () => {
    expect(paginar(90, 1, 20)).toEqual({ paginaAtual: 1, totalPaginas: 5, skip: 0, take: 20 })
    expect(paginar(90, 3, 20)).toEqual({ paginaAtual: 3, totalPaginas: 5, skip: 40, take: 20 })
  })
  it('arredonda totalPaginas para cima', () => {
    expect(paginar(91, 1, 20).totalPaginas).toBe(5)
  })
  it('nunca retorna totalPaginas menor que 1', () => {
    expect(paginar(0, 1, 20).totalPaginas).toBe(1)
  })
  it('clampa página abaixo de 1 para 1', () => {
    expect(paginar(90, 0, 20).paginaAtual).toBe(1)
    expect(paginar(90, -5, 20).skip).toBe(0)
  })
  it('clampa página acima do total para o total', () => {
    expect(paginar(90, 99, 20).paginaAtual).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/tipo-conta.test.ts src/lib/status-demanda.test.ts src/lib/paginacao.test.ts`
Expected: FAIL — módulos `./tipo-conta`, `./status-demanda`, `./paginacao` não existem.

- [ ] **Step 3: Implement**

```typescript
// src/lib/tipo-conta.ts
export function mapPapelParaTipoConta(papel: string | null | undefined): 'Administrador' | 'Mobilizador' | '—' {
  if (papel === 'admin') return 'Administrador'
  if (papel === 'mobilizador') return 'Mobilizador'
  return '—'
}
```

```typescript
// src/lib/status-demanda.ts
const CONCLUIDO = { label: 'CONCLUÍDO', corClasse: 'bg-green-100 text-green-800' }
const PENDENTE = { label: 'PENDENTE', corClasse: 'bg-yellow-100 text-yellow-800' }
const NAO_ATENDIDA = { label: 'NÃO ATENDIDA', corClasse: 'bg-red-100 text-red-800' }

export function statusDemandaPill(status: string): { label: string; corClasse: string } {
  if (status === 'atendida') return CONCLUIDO
  if (status === 'nao_atendida') return NAO_ATENDIDA
  return PENDENTE
}

export function foiAtendidaPill(status: string): { label: string; corClasse: string } {
  if (status === 'atendida') return { label: 'SIM', corClasse: 'bg-green-100 text-green-800' }
  if (status === 'nao_atendida') return { label: 'NÃO', corClasse: 'bg-red-100 text-red-800' }
  return { label: '—', corClasse: 'bg-gray-100 text-gray-500' }
}
```

```typescript
// src/lib/paginacao.ts
export function paginar(totalItens: number, paginaAtual: number, tamanhoPagina: number) {
  const totalPaginas = Math.max(1, Math.ceil(totalItens / tamanhoPagina))
  const paginaClampada = Math.min(Math.max(1, paginaAtual), totalPaginas)
  return {
    paginaAtual: paginaClampada,
    totalPaginas,
    skip: (paginaClampada - 1) * tamanhoPagina,
    take: tamanhoPagina,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/tipo-conta.test.ts src/lib/status-demanda.test.ts src/lib/paginacao.test.ts`
Expected: PASS (14 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tipo-conta.ts src/lib/status-demanda.ts src/lib/paginacao.ts src/lib/tipo-conta.test.ts src/lib/status-demanda.test.ts src/lib/paginacao.test.ts
git commit -m "feat: funções puras de tipo de conta, status de demanda e paginação"
```

---

## Task 2: Componentes visuais compartilhados (Avatar, SegmentPills, Modal, Pagination)

**Files:**
- Create: `src/components/admin/Avatar.tsx`
- Create: `src/components/admin/SegmentPills.tsx`
- Create: `src/components/admin/Modal.tsx`
- Create: `src/components/admin/Pagination.tsx`

**Interfaces:**
- Consumes: `paginar` from `src/lib/paginacao.ts` (Task 1)
- Produces: `<Avatar fotoUrl={string|null} nome={string} size={number} />`
- Produces: `<SegmentPills segmentos={{id:string; nome:string}[]} maxVisiveis={number} />`
- Produces: `<Modal open={boolean} onClose={()=>void} title={string}>{children}</Modal>`
- Produces: `<Pagination totalItens={number} paginaAtual={number} tamanhoPagina={number} baseUrl={string} searchParams={Record<string,string|undefined>} />`

- [ ] **Step 1: Implementar Avatar**

```tsx
// src/components/admin/Avatar.tsx
export default function Avatar({
  fotoUrl,
  nome,
  size = 40,
}: {
  fotoUrl: string | null
  nome: string
  size?: number
}) {
  const style = { width: size, height: size }
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt={nome} style={style} className="rounded-full object-cover shrink-0" />
  }
  return (
    <div
      style={style}
      className="rounded-full bg-gray-200 flex items-center justify-center text-gray-500 shrink-0"
      aria-label={nome}
    >
      <span style={{ fontSize: size * 0.5 }}>👤</span>
    </div>
  )
}
```

- [ ] **Step 2: Implementar SegmentPills (client, expande com "...")**

```tsx
// src/components/admin/SegmentPills.tsx
'use client'

import { useState } from 'react'

export default function SegmentPills({
  segmentos,
  maxVisiveis = 3,
}: {
  segmentos: { id: string; nome: string }[]
  maxVisiveis?: number
}) {
  const [expandido, setExpandido] = useState(false)

  if (segmentos.length === 0) {
    return <span className="text-gray-400 text-xs">—</span>
  }

  const visiveis = expandido ? segmentos : segmentos.slice(0, maxVisiveis)
  const restantes = segmentos.length - maxVisiveis

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visiveis.map((s) => (
        <span key={s.id} className="bg-black text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
          {s.nome}
        </span>
      ))}
      {!expandido && restantes > 0 && (
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="text-xs text-gray-500 hover:text-gray-800 px-1"
        >
          +{restantes}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Implementar Modal genérico**

```tsx
// src/components/admin/Modal.tsx
'use client'

import { useEffect } from 'react'

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implementar Pagination (server-safe, baseado em Links)**

```tsx
// src/components/admin/Pagination.tsx
import Link from 'next/link'
import { paginar } from '@/lib/paginacao'

export default function Pagination({
  totalItens,
  paginaAtual,
  tamanhoPagina,
  baseUrl,
  searchParams,
}: {
  totalItens: number
  paginaAtual: number
  tamanhoPagina: number
  baseUrl: string
  searchParams: Record<string, string | undefined>
}) {
  const { totalPaginas } = paginar(totalItens, paginaAtual, tamanhoPagina)

  function hrefParaPagina(pagina: number) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') params.set(k, v)
    }
    params.set('page', String(pagina))
    return `${baseUrl}?${params.toString()}`
  }

  const paginasVisiveis = Array.from({ length: totalPaginas }, (_, i) => i + 1).slice(0, 7)

  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <div className="flex items-center gap-1">
        {paginasVisiveis.map((p) => (
          <Link
            key={p}
            href={hrefParaPagina(p)}
            className={`px-2 py-1 rounded ${
              p === paginaAtual ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {p}
          </Link>
        ))}
        {totalPaginas > 7 && <span className="text-gray-400 px-1">de {totalPaginas}</span>}
      </div>
      <span className="text-gray-500">
        {totalItens.toLocaleString('pt-BR')} usuários cadastrados
      </span>
    </div>
  )
}
```

- [ ] **Step 5: Verificação manual**

Não há teste de componente automatizado (ver Global Constraints). Rodar `npm run dev`, abrir uma página que ainda não usa esses componentes é impossível isoladamente — a verificação visual real acontece na Task 6 (lista) e Task 8 (perfil), quando esses componentes forem montados nas páginas. Nesta task, validar apenas que o projeto compila:

Run: `npx tsc --noEmit`
Expected: sem erros nos 4 arquivos novos.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/Avatar.tsx src/components/admin/SegmentPills.tsx src/components/admin/Modal.tsx src/components/admin/Pagination.tsx
git commit -m "feat: componentes visuais compartilhados do admin (Avatar, SegmentPills, Modal, Pagination)"
```

---

## Task 3: Shell do admin — Sidebar, LiveClock, Topbar

**Files:**
- Create: `src/components/admin/Sidebar.tsx`
- Create: `src/components/admin/LiveClock.tsx`
- Create: `src/components/admin/Topbar.tsx`

**Interfaces:**
- Produces: `<Sidebar slug={string} gabineteNome={string} logoUrl={string|null} />` (o botão "Sair" sempre faz logout completo via `POST /api/auth/logout`, um Route Handler já existente em `src/app/api/auth/logout/route.ts` — não é uma Server Action e não deve ser confundido com `sairModoSuporte`, que é uma ação separada só para o banner de modo suporte sair de volta ao painel super-admin sem deslogar)
- Produces: `<LiveClock />` (client, sem props)
- Produces: `<Topbar usuarioNome={string} usuarioFotoUrl={string|null} />`

- [ ] **Step 1: Implementar Sidebar (client, usePathname para item ativo)**

```tsx
// src/components/admin/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type ItemMenu = { label: string; href?: string; emBreve?: boolean }

function buildItens(slug: string): ItemMenu[] {
  return [
    { label: 'Dados Gerais', href: `/${slug}/admin/dashboard` },
    { label: 'Usuários', href: `/${slug}/admin/pessoas` },
    { label: 'Demandas', href: `/${slug}/admin/demandas` },
    { label: 'Tarefas', emBreve: true },
    { label: 'Banco de Talentos', emBreve: true },
    { label: 'Link de Cadastro', emBreve: true },
    { label: 'Importar/Exportar', emBreve: true },
    { label: 'Configurações', href: `/${slug}/admin/configuracoes` },
  ]
}

export default function Sidebar({
  slug,
  gabineteNome,
  logoUrl,
}: {
  slug: string
  gabineteNome: string
  logoUrl: string | null
}) {
  const pathname = usePathname()
  const itens = buildItens(slug)

  return (
    <aside className="w-[200px] shrink-0 bg-[#1A1A1A] text-white flex flex-col min-h-screen">
      <div className="flex flex-col items-center py-6 px-3 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={gabineteNome} className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-xl">
            {gabineteNome.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="mt-2 text-sm font-medium">{gabineteNome}</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-3">
        {itens.map((item) => {
          const ativo = item.href ? pathname.startsWith(item.href) : false
          if (item.emBreve) {
            return (
              <span
                key={item.label}
                className="px-3 py-2 rounded-md text-sm text-white/30 cursor-not-allowed flex items-center justify-between"
                title="Em breve"
              >
                {item.label}
                <span className="text-[10px] uppercase">em breve</span>
              </span>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href!}
              className={`px-3 py-2 rounded-md text-sm transition-colors ${
                ativo ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <form action="/api/auth/logout" method="POST" className="px-3 pb-6 pt-4 mt-4 border-t border-white/10">
        <button type="submit" className="w-full text-left px-3 py-2 rounded-md text-sm text-white/70 hover:bg-white/10 hover:text-white">
          Sair
        </button>
      </form>
    </aside>
  )
}
```

- [ ] **Step 2: Implementar LiveClock**

```tsx
// src/components/admin/LiveClock.tsx
'use client'

import { useEffect, useState } from 'react'

export default function LiveClock() {
  const [agora, setAgora] = useState<Date | null>(null)

  useEffect(() => {
    setAgora(new Date())
    const id = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!agora) return <span className="text-sm text-white/70">&nbsp;</span>

  const data = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <span className="text-sm text-white/70 flex items-center gap-2">
      <span>📅</span>
      {data} | {hora}
    </span>
  )
}
```

- [ ] **Step 3: Implementar Topbar**

```tsx
// src/components/admin/Topbar.tsx
import Avatar from './Avatar'
import LiveClock from './LiveClock'

export default function Topbar({
  usuarioNome,
  usuarioFotoUrl,
}: {
  usuarioNome: string
  usuarioFotoUrl: string | null
}) {
  return (
    <header className="bg-[#1A1A1A] text-white px-6 py-3 flex items-center justify-between">
      <LiveClock />
      <div className="flex items-center gap-4">
        <span className="text-lg cursor-default" aria-hidden>🔍</span>
        <span className="text-lg cursor-default relative" aria-hidden>
          🔔
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
            0
          </span>
        </span>
        <div className="flex items-center gap-2">
          <Avatar fotoUrl={usuarioFotoUrl} nome={usuarioNome} size={28} />
          <span className="text-sm">{usuarioNome}</span>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Verificação manual**

Run: `npx tsc --noEmit`
Expected: sem erros. Verificação visual real acontece na Task 4, quando o layout monta esses três componentes.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/Sidebar.tsx src/components/admin/LiveClock.tsx src/components/admin/Topbar.tsx
git commit -m "feat: shell do admin — Sidebar, LiveClock e Topbar"
```

---

## Task 4: Montar o novo shell em `admin/layout.tsx`

**Files:**
- Modify: `src/app/[slug]/admin/layout.tsx`

**Interfaces:**
- Consumes: `Sidebar`, `Topbar` (Task 3)
- Consumes: `prisma.pessoa.findFirst` para achar a Pessoa do usuário logado (nome/foto do Topbar)

- [ ] **Step 1: Reescrever o layout preservando toda a lógica de autenticação/modo suporte existente**

Substituir o bloco `return (...)` atual (linhas 64-100 do arquivo, o `<nav>` de topo) por Sidebar + Topbar, e buscar a Pessoa vinculada ao `session.user.id` (se existir) para nome/avatar do usuário logado. Manter intacta toda a lógica acima (`getSession`, `getGabineteBySlug`, checagem de papel/modo suporte). O `Sidebar` não recebe mais `sairAction` — ele mesmo faz `POST /api/auth/logout` (ver Task 3). O `sairAction` (`sairModoSuporte`) continua existindo só para o botão do banner amarelo de modo suporte, sem relação com o "Sair" do menu lateral.

```tsx
// src/app/[slug]/admin/layout.tsx
import 'server-only'

export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { readSuporteSessao } from '@/lib/modo-suporte'
import { sairModoSuporte } from '@/actions/super-admin/modo-suporte'
import Sidebar from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'

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
  const suporteCookieValue = cookieStore.get('suporteSessao')?.value

  let modoSuporteAtivo = false
  let sairAction: (() => Promise<void>) | null = null

  if (role === 'super-admin') {
    let sessao: { gabineteId: string; sessaoId: string } | null = null
    try {
      sessao = readSuporteSessao(role, suporteCookieValue)
    } catch {
      redirect('/super-admin/')
    }
    if (!sessao || sessao.gabineteId !== gabinete.id) {
      redirect('/super-admin/')
    }
    modoSuporteAtivo = true
    sairAction = sairModoSuporte.bind(null, sessao.gabineteId, sessao.sessaoId)
  } else {
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

  const pessoaLogada = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, deletedAt: null },
    select: { nome: true, fotoUrl: true },
  })
  const usuarioNome = pessoaLogada?.nome ?? session.user.email?.split('@')[0] ?? 'Usuário'
  const usuarioFotoUrl = pessoaLogada?.fotoUrl ?? null

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex">
      <Sidebar
        slug={params.slug}
        gabineteNome={gabinete.nomeSistema ?? params.slug}
        logoUrl={gabinete.logoUrl}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {modoSuporteAtivo && sairAction && (
          <div className="bg-yellow-400 text-yellow-900 px-4 py-2 flex items-center justify-between text-sm font-medium">
            <span>
              Modo Suporte ativo — você está visualizando{' '}
              <strong>{gabinete.nomeSistema ?? params.slug}</strong>
            </span>
            <form action={sairAction}>
              <button type="submit" className="underline hover:no-underline">
                Sair do modo suporte
              </button>
            </form>
          </div>
        )}
        <Topbar usuarioNome={usuarioNome} usuarioFotoUrl={usuarioFotoUrl} />
        <main className="flex-1 p-6">
          <div className="bg-white rounded-xl shadow-sm p-6 max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificação manual (obrigatória para este task — muda o shell de todo o admin)**

Run: `npm run dev`

No navegador, logado como admin de `amigos-do-izalci`, acessar `http://localhost:3000/amigos-do-izalci/admin/dashboard` e confirmar:
- Sidebar preta à esquerda com os itens na ordem do briefing, "Tarefas"/"Banco de Talentos"/"Link de Cadastro"/"Importar/Exportar" desabilitados.
- Topbar preta no topo com relógio, ícones de busca/sino e nome do usuário logado.
- "Sair" desloga corretamente.
- Página de conteúdo continua funcionando (nenhuma rota quebrada).

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/admin/layout.tsx
git commit -m "feat: novo shell do admin com sidebar e topbar pretos"
```

---

## Task 5: `UsuariosTable` e `CadastrarUsuarioModal`

**Files:**
- Create: `src/app/[slug]/admin/pessoas/UsuariosTable.tsx`
- Create: `src/app/[slug]/admin/pessoas/CadastrarUsuarioModal.tsx`

**Interfaces:**
- Consumes: `Avatar`, `SegmentPills`, `Modal` (Task 2), `mapPapelParaTipoConta` (Task 1), `cadastrarPessoa` e `softDeletePessoa` server actions (já existentes)
- Produces: `<UsuariosTable slug={string} usuarios={UsuarioRow[]} />` onde `UsuarioRow = { id, nome, email, fotoUrl, tipoConta, segmentos: {id,nome}[] }`
- Produces: `<CadastrarUsuarioModal slug={string} regioes={{id,nome}[]} profissoes={{id,nome}[]} />`

- [ ] **Step 1: Implementar UsuariosTable**

```tsx
// src/app/[slug]/admin/pessoas/UsuariosTable.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/admin/Avatar'
import SegmentPills from '@/components/admin/SegmentPills'
import { softDeletePessoa } from '@/actions/admin/soft-delete-pessoa'

export type UsuarioRow = {
  id: string
  nome: string
  email: string | null
  fotoUrl: string | null
  tipoConta: 'Administrador' | 'Mobilizador' | '—'
  segmentos: { id: string; nome: string }[]
}

export default function UsuariosTable({ slug, usuarios }: { slug: string; usuarios: UsuarioRow[] }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  function toggleTodos(marcar: boolean) {
    setSelecionados(marcar ? new Set(usuarios.map((u) => u.id)) : new Set())
  }

  function toggleUm(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b border-gray-200">
        <tr>
          <th className="w-10 px-4 py-3">
            <input
              type="checkbox"
              checked={usuarios.length > 0 && selecionados.size === usuarios.length}
              onChange={(e) => toggleTodos(e.target.checked)}
              aria-label="Selecionar todos"
            />
          </th>
          <th className="w-12 px-2 py-3" />
          <th className="text-left px-2 py-3 font-medium text-gray-600">Nome</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo de Conta</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Segmentos</th>
          <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {usuarios.map((u) => (
          <tr key={u.id} className="hover:bg-gray-50" style={{ height: 56 }}>
            <td className="px-4 py-3">
              <input
                type="checkbox"
                checked={selecionados.has(u.id)}
                onChange={() => toggleUm(u.id)}
                aria-label={`Selecionar ${u.nome}`}
              />
            </td>
            <td className="px-2 py-3">
              <Avatar fotoUrl={u.fotoUrl} nome={u.nome} size={36} />
            </td>
            <td className="px-2 py-3">
              <Link href={`/${slug}/admin/pessoas/${u.id}`} className="font-medium text-gray-900 hover:underline">
                {u.nome}
              </Link>
            </td>
            <td className="px-4 py-3 text-gray-600">{u.email ?? '—'}</td>
            <td className="px-4 py-3 text-gray-600">{u.tipoConta}</td>
            <td className="px-4 py-3">
              <SegmentPills segmentos={u.segmentos} />
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-3">
                <Link href={`/${slug}/admin/pessoas/${u.id}`} aria-label={`Editar ${u.nome}`}>
                  ✏️
                </Link>
                <form
                  action={softDeletePessoa}
                  onSubmit={(e) => {
                    if (!confirm(`Excluir o cadastro de ${u.nome}? A ação pode ser revertida pelo super-admin.`)) {
                      e.preventDefault()
                    }
                  }}
                >
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="pessoaId" value={u.id} />
                  <button type="submit" aria-label={`Excluir ${u.nome}`}>
                    🗑️
                  </button>
                </form>
              </div>
            </td>
          </tr>
        ))}
        {usuarios.length === 0 && (
          <tr>
            <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
              Nenhum usuário encontrado
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Implementar CadastrarUsuarioModal reaproveitando o form já existente**

```tsx
// src/app/[slug]/admin/pessoas/CadastrarUsuarioModal.tsx
'use client'

import { useState } from 'react'
import Modal from '@/components/admin/Modal'
import { cadastrarPessoa } from '@/actions/admin/cadastrar-pessoa'

export default function CadastrarUsuarioModal({
  slug,
  regioes,
  profissoes,
}: {
  slug: string
  regioes: { id: string; nome: string }[]
  profissoes: { id: string; nome: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
      >
        <span aria-hidden>👤</span>
        CADASTRAR USUÁRIO
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Cadastrar usuário">
        <form action={cadastrarPessoa} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome *</label>
            <input name="nome" required className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
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
              <input name="email" type="email" className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Região</label>
              <select name="regiaoId" className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {regioes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Profissão</label>
              <select name="profissaoId" className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {profissoes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gênero</label>
            <select name="genero" className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option value="">Prefiro não informar</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <button type="submit" className="w-full bg-black text-white px-4 py-2 rounded-md text-sm font-medium">
            Cadastrar
          </button>
        </form>
      </Modal>
    </>
  )
}
```

- [ ] **Step 3: Verificação manual**

Run: `npx tsc --noEmit`
Expected: sem erros (a montagem visual real acontece na Task 6).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/pessoas/UsuariosTable.tsx" "src/app/[slug]/admin/pessoas/CadastrarUsuarioModal.tsx"
git commit -m "feat: tabela de usuários e modal de cadastro"
```

---

## Task 6: Reescrever `pessoas/page.tsx` (tela de Usuários)

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/page.tsx`

**Interfaces:**
- Consumes: `UsuariosTable`, `CadastrarUsuarioModal` (Task 5), `Pagination` (Task 2), `mapPapelParaTipoConta` (Task 1)

- [ ] **Step 1: Reescrever a página com paginação, segmentos e tipo de conta**

```tsx
// src/app/[slug]/admin/pessoas/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import SortableHeader from '@/components/SortableHeader'
import Pagination from '@/components/admin/Pagination'
import { paginar } from '@/lib/paginacao'
import { mapPapelParaTipoConta } from '@/lib/tipo-conta'
import UsuariosTable, { type UsuarioRow } from './UsuariosTable'
import CadastrarUsuarioModal from './CadastrarUsuarioModal'

const PAGE_SIZE = 20

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
}

export default async function PessoasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { q?: string; sort?: string; order?: string; rede?: string; path?: string; page?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const q = searchParams.q?.trim() ?? ''
  const { sort, order, rede, path } = searchParams
  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []
  const paginaSolicitada = Number(searchParams.page ?? '1') || 1

  const searchFilter = q
    ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { whatsapp: { contains: q } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  let idsFiltro: string[] | null = null
  if (rede) {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: rede, gabineteId: gabinete.id, deletedAt: null },
      select: { pessoaId: true },
    })
    idsFiltro = vinculos.map((v) => v.pessoaId)
  }

  const whereBase = {
    gabineteId: gabinete.id,
    deletedAt: null,
    ...searchFilter,
    ...(idsFiltro ? { id: { in: idsFiltro } } : {}),
  }

  const totalItens = idsFiltro && idsFiltro.length === 0 ? 0 : await prisma.pessoa.count({ where: whereBase })
  const { paginaAtual, skip, take } = paginar(totalItens, paginaSolicitada, PAGE_SIZE)

  const pessoasRaw =
    idsFiltro && idsFiltro.length === 0
      ? []
      : await prisma.pessoa.findMany({
          where: whereBase,
          orderBy,
          skip,
          take,
          select: {
            id: true,
            nome: true,
            email: true,
            fotoUrl: true,
            userId: true,
            segmentos: { select: { segmento: { select: { id: true, nome: true } } } },
          },
        })

  const userIds = pessoasRaw.map((p) => p.userId).filter((id): id is string => !!id)
  const papeis = userIds.length
    ? await prisma.usuarioGabinete.findMany({
        where: { userId: { in: userIds }, gabineteId: gabinete.id },
        select: { userId: true, papel: true },
      })
    : []
  const papelPorUserId = new Map(papeis.map((p) => [p.userId, p.papel]))

  const usuarios: UsuarioRow[] = pessoasRaw.map((p) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    fotoUrl: p.fotoUrl,
    tipoConta: mapPapelParaTipoConta(p.userId ? papelPorUserId.get(p.userId) : null),
    segmentos: p.segmentos.map((s) => s.segmento),
  }))

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

  const breadcrumbPessoas =
    pathIds.length > 0
      ? await prisma.pessoa.findMany({
          where: { id: { in: pathIds }, gabineteId: gabinete.id, deletedAt: null },
          select: { id: true, nome: true },
        })
      : []
  const breadcrumb = pathIds
    .map((id) => breadcrumbPessoas.find((p) => p.id === id))
    .filter(Boolean) as { id: string; nome: string }[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        <CadastrarUsuarioModal slug={params.slug} regioes={regioes} profissoes={profissoes} />
      </div>

      {breadcrumb.length > 0 && (
        <nav className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
          <Link href={`/${params.slug}/admin/pessoas`} className="hover:text-gray-900">
            Usuários
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
                  <Link href={`/${params.slug}/admin/pessoas?rede=${item.id}&path=${crumbPath}`} className="hover:text-gray-900">
                    Rede de {item.nome}
                  </Link>
                )}
              </span>
            )
          })}
        </nav>
      )}

      <form method="GET" className="flex gap-2">
        {rede && <input type="hidden" name="rede" value={rede} />}
        {path && <input type="hidden" name="path" value={path} />}
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

      <div className="bg-white rounded-lg overflow-x-auto">
        <div className="px-2">
          <SortableHeader label="Nome" field="nome" />
        </div>
        <UsuariosTable slug={params.slug} usuarios={usuarios} />
        <Pagination
          totalItens={totalItens}
          paginaAtual={paginaAtual}
          tamanhoPagina={PAGE_SIZE}
          baseUrl={`/${params.slug}/admin/pessoas`}
          searchParams={{ q, sort, order, rede, path }}
        />
      </div>
    </div>
  )
}
```

Nota: o `SortableHeader` solto acima da tabela é um ajuste temporário simples — como a Task 5 já renderiza o cabeçalho da tabela sem ordenação embutida, o ideal é mover a ordenação para dentro do `<th>` de Nome da própria `UsuariosTable`. Ajustar assim antes de finalizar:

- [ ] **Step 2: Mover a ordenação para dentro da tabela**

Em `UsuariosTable.tsx` (Task 5), trocar o `<th>` de Nome por:

```tsx
<th className="text-left px-2 py-3">
  <SortableHeader label="Nome" field="nome" />
</th>
```

adicionando o import `import SortableHeader from '@/components/SortableHeader'` no topo de `UsuariosTable.tsx`, e remover o bloco solto `<div className="px-2"><SortableHeader .../></div>` de `page.tsx`.

- [ ] **Step 3: Verificação manual**

Run: `npm run dev`

Acessar `http://localhost:3000/amigos-do-izalci/admin/pessoas` logado como admin e conferir:
- Título "Usuários" e botão "CADASTRAR USUÁRIO" abrindo o modal e cadastrando com sucesso.
- Colunas na ordem: checkbox, avatar, nome (com seta de ordenação), email, tipo de conta, segmentos, ações.
- Clicar em "+N" de segmentos expande a lista completa.
- Lixeira pede confirmação e move o registro para soft-delete (some da lista).
- Paginação aparece no rodapé com o total de usuários; navegar entre páginas preserva a busca (`q`).
- Testar a navegação em cascata acessando manualmente `.../pessoas?rede=<idDeUmMobilizador>` — breadcrumb deve continuar funcionando mesmo sem coluna dedicada.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/pessoas/page.tsx" "src/app/[slug]/admin/pessoas/UsuariosTable.tsx"
git commit -m "feat: redesenhar tela de Usuários com paginação, segmentos e tipo de conta"
```

---

## Task 7: `VerMaisList` e `CollapsibleSection` (componentes genéricos client-side)

**Files:**
- Create: `src/components/admin/VerMaisList.tsx`
- Create: `src/components/admin/CollapsibleSection.tsx`

**Interfaces:**
- Produces: `<VerMaisList<T> itens={T[]} porPagina={number} renderItem={(item: T) => React.ReactNode} />`
- Produces: `<CollapsibleSection title={string} actions={React.ReactNode}>{children}</CollapsibleSection>` — título com seta ▲/▼ que recolhe/expande a seção (usado nas seções "Demandas do Usuário" e "Observações Sobre o Usuário" do perfil, Task 8)

- [ ] **Step 1: Implementar**

```tsx
// src/components/admin/VerMaisList.tsx
'use client'

import { useState } from 'react'

export default function VerMaisList<T>({
  itens,
  porPagina = 5,
  renderItem,
}: {
  itens: T[]
  porPagina?: number
  renderItem: (item: T, index: number) => React.ReactNode
}) {
  const [quantidadeVisivel, setQuantidadeVisivel] = useState(porPagina)
  const visiveis = itens.slice(0, quantidadeVisivel)
  const temMais = quantidadeVisivel < itens.length

  return (
    <div className="space-y-3">
      {visiveis.map((item, i) => renderItem(item, i))}
      {itens.length > porPagina && (
        <div className="text-center pt-2">
          {temMais ? (
            <button
              type="button"
              onClick={() => setQuantidadeVisivel((n) => n + porPagina)}
              className="text-sm text-blue-600 hover:underline"
            >
              VER MAIS
            </button>
          ) : null}
          <p className="text-xs text-gray-400 mt-1">
            visualizando {visiveis.length} de {itens.length}
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implementar CollapsibleSection**

```tsx
// src/components/admin/CollapsibleSection.tsx
'use client'

import { useState } from 'react'

export default function CollapsibleSection({
  title,
  actions,
  children,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(true)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-2 text-lg font-semibold text-gray-900"
        >
          <span className="text-sm">{aberto ? '▲' : '▼'}</span>
          {title}
        </button>
        {actions}
      </div>
      {aberto && children}
    </section>
  )
}
```

- [ ] **Step 3: Verificação manual**

Run: `npx tsc --noEmit`
Expected: sem erros (uso real na Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/VerMaisList.tsx src/components/admin/CollapsibleSection.tsx
git commit -m "feat: componentes genéricos VerMaisList e CollapsibleSection"
```

---

## Task 8: Reescrever `pessoas/[pessoaId]/page.tsx` (tela de Perfil)

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`

**Interfaces:**
- Consumes: `Avatar` (Task 2), `SegmentPills` (Task 2), `VerMaisList`, `CollapsibleSection` (Task 7), `mapPapelParaTipoConta` (Task 1), `statusDemandaPill`/`foiAtendidaPill` (Task 1)
- Consumes componentes já existentes: `EditarPessoaForm`, `FotoPerfilAvatar`, `MobilizadorSection`, `PromoverMobilizadorDialog`, `ExcluirPessoaButton`

- [ ] **Step 1: Buscar dados adicionais (segmentos, papel/tipo de conta, último acesso)**

Adicionar ao `prisma.pessoa.findFirst` existente o include de segmentos, e buscar separadamente o papel (via `UsuarioGabinete`) e o último acesso (via Supabase Admin, só se `pessoa.userId` existir).

```tsx
// trecho a adicionar em src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx, dentro do findFirst existente:
    include: {
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      observacoes: { where: { deletedAt: null }, orderBy: { criadoEm: 'desc' } },
      segmentos: { select: { segmento: { select: { id: true, nome: true } } } },
      redesComoIndicado: {
        where: { deletedAt: null },
        take: 1,
        select: { indicadoPor: { select: { id: true, nome: true, fotoUrl: true } } },
      },
    },
```

`Pessoa.redesComoIndicado` (`@relation("Indicado")`, ver `prisma/schema.prisma:114`) é o vínculo onde esta pessoa é a indicada; `vinculo.indicadoPor` é quem a indicou — é essa a relação certa para "Cadastrado na Rede" (não confundir com `redesComoIndicador`, já usada em outro lugar da página para contar quantas pessoas esta pessoa indicou).

Depois de buscar `pessoa`, adicionar:

```tsx
  const papelUsuario = pessoa.userId
    ? (await prisma.usuarioGabinete.findUnique({
        where: { userId_gabineteId: { userId: pessoa.userId, gabineteId: gabinete.id } },
        select: { papel: true },
      }))?.papel ?? null
    : null
  const tipoConta = mapPapelParaTipoConta(papelUsuario)

  let ultimoAcesso: string | null = null
  if (pessoa.userId) {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin')
    const { data } = await getSupabaseAdmin().auth.admin.getUserById(pessoa.userId)
    if (data.user?.last_sign_in_at) {
      ultimoAcesso = new Date(data.user.last_sign_in_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    }
  }

  const redeInfo = pessoa.redesComoIndicado[0]?.indicadoPor ?? null
  const segmentosPessoa = pessoa.segmentos.map((s) => s.segmento)
```

Adicionar os imports no topo do arquivo:

```tsx
import Avatar from '@/components/admin/Avatar'
import SegmentPills from '@/components/admin/SegmentPills'
import VerMaisList from '@/components/admin/VerMaisList'
import { mapPapelParaTipoConta } from '@/lib/tipo-conta'
import { statusDemandaPill, foiAtendidaPill } from '@/lib/status-demanda'
import CollapsibleSection from '@/components/admin/CollapsibleSection'
```

- [ ] **Step 2: Reescrever o cabeçalho do perfil (avatar grande, nome/email, lápis/lixeira, último acesso)**

Substituir o bloco `<div className="flex items-center justify-between">...</div>` atual (linhas 82-120 do arquivo original) por:

```tsx
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <FotoPerfilAvatar
            fotoUrl={pessoa.fotoUrl}
            pessoaId={pessoa.id}
            slug={params.slug}
            canEdit={isAdmin || pessoa.userId === session.user.id}
          />
          <div>
            <p className="text-xs text-gray-500">Nome</p>
            <p className="text-2xl font-bold text-gray-900">{pessoa.nome}</p>
            <p className="text-xs text-gray-500 mt-2">Email</p>
            <p className="text-sm text-gray-700">{pessoa.email ?? '—'}</p>
          </div>
        </div>
        <div className="text-right space-y-2">
          <div className="flex items-center gap-3 justify-end">
            {isAdmin && (
              <a href="#dados" aria-label="Editar dados">✏️</a>
            )}
            {isAdmin && <ExcluirPessoaButton slug={params.slug} pessoaId={params.pessoaId} />}
          </div>
          <p className="text-xs text-gray-500">
            Último Acesso<br />
            <span className="text-gray-700">{ultimoAcesso ?? '—'}</span>
          </p>
        </div>
      </div>
```

`FotoPerfilAvatar` já renderiza a foto em ~96px (`viewBox="0 0 96 96"`, ver `FotoPerfilAvatar.tsx:92`) — próximo o bastante do "~120px" do briefing; não vale a pena mexer no tamanho de um componente que já tem lógica de upload/lightbox funcionando só por 24px de diferença visual, então o tamanho atual é mantido nesta rodada.

(`ExcluirPessoaButton` já mostra o texto "Excluir cadastro"; manter — o briefing pede ícone de lixeira, mas trocar esse componente para ícone-only alteraria seu uso em outros lugares. Se for usado apenas aqui, ajustar `ExcluirPessoaButton.tsx` para receber uma prop opcional `iconOnly?: boolean` que troca o texto do botão por `🗑️`.)

- [ ] **Step 3: Ajustar ExcluirPessoaButton para suportar modo ícone**

```tsx
// src/app/[slug]/admin/pessoas/[pessoaId]/ExcluirPessoaButton.tsx
'use client'

import { softDeletePessoa } from '@/actions/admin/soft-delete-pessoa'

export default function ExcluirPessoaButton({
  slug,
  pessoaId,
  iconOnly = false,
}: {
  slug: string
  pessoaId: string
  iconOnly?: boolean
}) {
  return (
    <form
      action={softDeletePessoa}
      onSubmit={(e) => {
        if (!confirm('Excluir este cadastro? A ação pode ser revertida pelo super-admin.')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <button type="submit" className="text-sm text-red-600 hover:underline" aria-label="Excluir cadastro">
        {iconOnly ? '🗑️' : 'Excluir cadastro'}
      </button>
    </form>
  )
}
```

E no header do perfil (Step 2), usar `<ExcluirPessoaButton slug={params.slug} pessoaId={params.pessoaId} iconOnly />`.

- [ ] **Step 4: Grid de informações pessoais (só campos que existem no schema)**

Inserir logo abaixo do header, substituindo a antiga seção "Dados" simples por um grid + o form de edição existente ancorado por `id="dados"`:

```tsx
      <section id="dados" className="space-y-4">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Data de Nascimento</p>
            <p>{pessoa.nascimento ? pessoa.nascimento.toLocaleDateString('pt-BR') : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">WhatsApp</p>
            <p>{pessoa.whatsapp}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-gray-500">Endereço</p>
            <p>{[pessoa.logradouro, pessoa.numero, pessoa.complemento].filter(Boolean).join(', ') || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">CEP</p>
            <p>{pessoa.cep ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cidade</p>
            <p>{pessoa.regiao?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Bairro</p>
            <p>{pessoa.bairro ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Sexo</p>
            <p className="capitalize">{pessoa.genero ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Tipo de Conta</p>
            <p>{tipoConta}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Profissão</p>
            <p>{pessoa.profissao?.nome ?? '—'}</p>
          </div>
        </div>

        <details className="border-t border-gray-100 pt-3">
          <summary className="text-sm text-blue-600 hover:underline cursor-pointer">Editar dados</summary>
          <div className="mt-3">
            <EditarPessoaForm
              slug={params.slug}
              pessoaId={pessoa.id}
              pessoa={{
                nome: pessoa.nome,
                whatsapp: pessoa.whatsapp,
                email: pessoa.email,
                regiaoId: pessoa.regiaoId,
                profissaoId: pessoa.profissaoId,
                genero: pessoa.genero,
              }}
              regioes={regioes}
              profissoes={profissoes}
            />
          </div>
        </details>
      </section>
```

- [ ] **Step 5: Bloco de informações de rede**

```tsx
      {(redeInfo || pessoa.isMobilizador) && (
        <section className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            {redeInfo && <Avatar fotoUrl={redeInfo.fotoUrl} nome={redeInfo.nome} size={28} />}
            <div>
              <p className="text-xs text-gray-500">Cadastrado na Rede</p>
              <p>{redeInfo?.nome ?? '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Criador da Rede</p>
            <p>{redeInfo?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cadastrados na Rede que Criou</p>
            {totalRede > 0 ? (
              <Link
                href={`/${params.slug}/admin/pessoas?rede=${pessoa.id}`}
                className="text-lg font-semibold text-blue-600 hover:underline"
              >
                {totalRede}
              </Link>
            ) : (
              <p className="text-lg font-semibold text-gray-400">0</p>
            )}
          </div>
        </section>
      )}
```

- [ ] **Step 6: Seção Segmentos**

```tsx
      <section className="space-y-2">
        <h2 className="text-lg font-semibold border-b border-gray-100 pb-2">Segmentos</h2>
        <SegmentPills segmentos={segmentosPessoa} maxVisiveis={10} />
      </section>
```

- [ ] **Step 7: Reescrever a seção Demandas com VerMaisList e pills do briefing**

Substituir toda a seção `{/* Histórico de demandas */}` existente (o bloco com `<details>` por demanda) por:

```tsx
      <CollapsibleSection
        title="Demandas do Usuário"
        actions={
          <Link
            href={`/${params.slug}/admin/demandas/nova?solicitanteId=${pessoa.id}`}
            className="bg-[#1E3A5F] text-white text-xs px-3 py-1.5 rounded-md hover:opacity-90 font-medium"
          >
            + CRIAR NOVA DEMANDA
          </Link>
        }
      >
        {demandas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma demanda registrada.</p>
        ) : (
          <VerMaisList
            itens={demandas}
            porPagina={5}
            renderItem={(d) => {
              const status = statusDemandaPill(d.status)
              const atendida = foiAtendidaPill(d.status)
              return (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                  <Link href={`/${params.slug}/admin/demandas/${d.id}`} className="text-gray-900 hover:underline truncate flex-1">
                    {d.titulo}
                  </Link>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ml-3 ${status.corClasse}`}>
                    {status.label}
                  </span>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ml-3 ${atendida.corClasse}`}>
                    {atendida.label}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400 ml-3">
                    {d.criadoEm.toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )
            }}
          />
        )}
      </CollapsibleSection>
```

- [ ] **Step 8: Reescrever a seção Observações com CollapsibleSection e VerMaisList**

Envolver toda a seção "Observações" existente (form de criar + lista) em `CollapsibleSection`, e trocar a renderização da lista para usar `VerMaisList`:

```tsx
      <CollapsibleSection title="Observações Sobre o Usuário">
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
          <div className="flex justify-end">
            <button type="submit" className="bg-[#1E3A5F] text-white px-4 py-2 rounded-md text-sm font-medium">
              + CRIAR NOVA OBSERVAÇÃO
            </button>
          </div>
        </form>

        <div className="mt-4">
          {pessoa.observacoes.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma observação ainda.</p>
          ) : (
            <VerMaisList
              itens={pessoa.observacoes}
              porPagina={5}
              renderItem={(obs) => {
                const podeEditar = isAdmin || obs.autorUserId === session.user.id
                return (
                  <div key={obs.id} className="border border-gray-200 rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {obs.autorNome} —{' '}
                        {new Date(obs.criadoEm).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                        {obs.editadoEm && ' (editado)'}
                      </span>
                      {podeEditar && (
                        <form action={excluirObservacao}>
                          <input type="hidden" name="slug" value={params.slug} />
                          <input type="hidden" name="pessoaId" value={pessoa.id} />
                          <input type="hidden" name="observacaoId" value={obs.id} />
                          <button type="submit" className="text-red-600 text-xs hover:underline">
                            Excluir
                          </button>
                        </form>
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
                        <button type="submit" className="text-xs text-blue-600 hover:underline">
                          Salvar edição
                        </button>
                      </form>
                    )}
                  </div>
                )
              }}
            />
          )}
        </div>
      </CollapsibleSection>
```

Isso substitui inteiramente a antiga seção `<section className="bg-white rounded-lg p-6 shadow-sm space-y-4"><h2>Observações</h2>...</section>` do arquivo original — o form de criar observação e a lista renderizada acima já cobrem o que a seção antiga fazia, agora dentro do `CollapsibleSection` com o novo título e estilo de botão.

- [ ] **Step 9: Verificação manual (obrigatória — reescrita completa da página)**

Run: `npm run dev`

Acessar o perfil de uma pessoa com demandas, observações, segmentos e rede (`http://localhost:3000/amigos-do-izalci/admin/pessoas/<id>`) e conferir:
- Avatar grande + nome/email + ✏️/🗑️ + "Último Acesso" no topo.
- Grid de dados só com os campos existentes (nenhum CPF/Orientação Sexual/Religião/Vínculo/Escolaridade/Telefone Fixo aparece).
- "Editar dados" expande o form já existente e salva corretamente (reaproveita `EditarPessoaForm`).
- Bloco de rede aparece só quando a pessoa tem indicador ou é mobilizadora; "Cadastrados na Rede que Criou" clicável leva para `/pessoas?rede=<id>` com a cascata funcionando.
- Segmentos exibidos como pills pretas.
- Demandas do Usuário: pills de status/atendida corretas, "VER MAIS" revela mais 5 sem recarregar a página.
- Observações Sobre o Usuário: mesmo comportamento de "ver mais"; criar/editar/excluir observação continuam funcionando.
- Excluir cadastro (🗑️ do topo) ainda pede confirmação e funciona.

- [ ] **Step 10: Commit**

```bash
git add "src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx" "src/app/[slug]/admin/pessoas/[pessoaId]/ExcluirPessoaButton.tsx"
git commit -m "feat: redesenhar tela de Perfil do Usuário"
```

---

## Task 9: Verificação final cruzada com o briefing

**Files:** nenhum arquivo novo — apenas checklist manual.

- [ ] **Step 1: Rodar toda a suíte**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: tudo verde.

- [ ] **Step 2: Checklist manual no navegador (dev server rodando)**

Percorrer o briefing original ponto a ponto nas duas telas (`/admin/pessoas` e `/admin/pessoas/[id]`) e marcar cada item como conferido:
- Fundo cinza claro, card branco com sombra — ok.
- Sidebar preta 200px, logo+nome do gabinete, item ativo destacado, "Sair" isolado — ok.
- Topbar preta, relógio, busca/sino decorativos, usuário logado com avatar — ok.
- Tabela: checkbox, avatar, nome ordenável, email, tipo de conta, segmentos com "+N", ações ✏️/🗑️ — ok.
- Paginação numérica + total de usuários no rodapé — ok.
- Perfil: avatar 120px, grid de 4 colunas só com campos existentes, bloco de rede, segmentos, demandas com pills e "ver mais", observações com "ver mais" — ok.
- Itens "em breve" no menu não navegam para lugar nenhum — ok.

- [ ] **Step 3: Commit final (se houver ajustes do checklist)**

```bash
git add -A
git commit -m "fix: ajustes finais de conformidade com o briefing de UI"
```
