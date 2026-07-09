# Redesign da área do mobilizador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A home do mobilizador (`/mobilizador`) vira a listagem da própria rede, no visual do admin (reaproveitando `UsuariosTable`); "Demandas" vira item de menu com listagem própria; "Meu Perfil" vira uma página acessada pela foto/nome na Topbar.

**Architecture:** `UsuariosTable` (hoje só usado pelo admin) ganha duas props opcionais e retrocompatíveis (`baseHref`, `somenteLeitura`) para ser reaproveitado pelo mobilizador sem herdar ações exclusivas de admin (editar/excluir pessoa, excluir em massa). A lógica de listagem+drill-down de rede migra de `/mobilizador/rede` para `/mobilizador`. Duas páginas novas (`/mobilizador/demandas`, `/mobilizador/perfil`) e uma prop nova na `Topbar` (`perfilHref`) completam a navegação.

**Tech Stack:** Next.js 14 (App Router, Server Components), Prisma, Tailwind CSS 3.4.

## Global Constraints

- `UsuariosTable` deve continuar funcionando exatamente como hoje para o admin — as duas props novas (`baseHref`, `somenteLeitura`) têm valores default que reproduzem o comportamento atual quando omitidas.
- O mobilizador nunca deve ter acesso a editar/excluir pessoas (isso é exclusivo de admin) — a variante `somenteLeitura` do `UsuariosTable` remove checkbox, "Excluir Todos" e a coluna de Ações.
- O drill-down na sub-rede (clicar num mobilizador da rede para ver a rede dele) deve continuar funcionando. Como o `UsuariosTable` não tem colunas de contagem de sub-rede (diferente da tabela antiga de `/mobilizador/rede`), o caminho passa a ser: clicar no nome → ficha de detalhe (`/mobilizador/pessoas/[pessoaId]`, já existe) → lá, se a pessoa for mobilizadora, um link "Cadastrados na Rede" volta pra `/mobilizador?rede=<id>&path=<id>` — mesmo padrão que o admin já usa em `/admin/pessoas/[pessoaId]` → `/admin/pessoas?rede=<id>`.
- Correção em relação ao spec: `/mobilizador/rede` nunca teve busca por texto (só ordenação por nome e drill-down) — o spec dizia "a busca continua funcionando como hoje", mas não havia busca antes. Este plano preserva ordenação e drill-down; não adiciona um campo de busca (não foi pedido e não existia).
- Sem testes automatizados de Server Components/Actions neste projeto — verificação é por `tsc`/`lint`/`build` + checagem manual no navegador.

---

## File Structure

**Modificar:**
- `src/components/admin/Topbar.tsx` — prop opcional `perfilHref`.
- `src/app/[slug]/mobilizador/layout.tsx` — passa `perfilHref` pro Topbar.
- `src/components/admin/Sidebar.tsx` — `buildItensMobilizador` troca "Minha Rede" por "Demandas"; remove o tipo/ícone `minha-rede` (fica sem uso).
- `src/app/[slug]/admin/pessoas/UsuariosTable.tsx` — props `baseHref` e `somenteLeitura`.
- `src/app/[slug]/mobilizador/page.tsx` — reescrita: mantém cards de link/QR code, adiciona a listagem da rede (via `UsuariosTable`), remove "Minha rede" resumida, "Minhas Demandas" e "Meu Perfil".
- `src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx` — corrige o link "← Voltar" (de `/mobilizador/rede` para `/mobilizador`) e adiciona o link "Cadastrados na Rede" pro drill-down.

**Criar:**
- `src/app/[slug]/mobilizador/demandas/page.tsx` — listagem de demandas do mobilizador logado.
- `src/app/[slug]/mobilizador/perfil/page.tsx` — página de perfil (dados pessoais + trocar senha).

**Remover:**
- `src/app/[slug]/mobilizador/rede/page.tsx` — conteúdo migrado para `/mobilizador/page.tsx`.

---

### Task 1: Topbar com link de perfil opcional

**Files:**
- Modify: `src/components/admin/Topbar.tsx`
- Modify: `src/app/[slug]/mobilizador/layout.tsx:62`

**Interfaces:**
- Produces: `Topbar({ usuarioNome, usuarioFotoUrl, perfilHref? }: { usuarioNome: string; usuarioFotoUrl: string | null; perfilHref?: string })` — quando `perfilHref` é passado, o bloco de avatar+nome vira um link; quando omitido (uso atual do admin), comportamento idêntico ao de hoje.

- [ ] **Step 1: Substituir o conteúdo de `Topbar.tsx`**

```tsx
import Link from 'next/link'
import Avatar from './Avatar'
import LiveClock from './LiveClock'

export default function Topbar({
  usuarioNome,
  usuarioFotoUrl,
  perfilHref,
}: {
  usuarioNome: string
  usuarioFotoUrl: string | null
  perfilHref?: string
}) {
  const perfilBloco = (
    <div className="flex items-center gap-2">
      <Avatar fotoUrl={usuarioFotoUrl} nome={usuarioNome} size={28} />
      <span className="text-sm hidden sm:inline text-[#494949]">{usuarioNome}</span>
    </div>
  )

  return (
    <header className="bg-white border-b border-[#D9D9D9] px-4 md:px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <label htmlFor="sidebar-toggle" aria-label="Abrir menu" className="md:hidden text-xl cursor-pointer shrink-0 text-[#686868]">
          ☰
        </label>
        <div className="hidden sm:block">
          <LiveClock />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
          <circle cx="8.5" cy="8.5" r="6" stroke="#979797" strokeWidth="1.8" />
          <path d="M13.3 13.3 18 18" stroke="#979797" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="relative shrink-0" aria-hidden>
          <svg width="20" height="21" viewBox="0 0 20 21" fill="none">
            <path
              d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5v3.2c0 .6-.24 1.18-.66 1.6L2.7 14a1 1 0 0 0 .7 1.7h13.2a1 1 0 0 0 .7-1.7l-1.14-1.2a2.27 2.27 0 0 1-.66-1.6V8A5.5 5.5 0 0 0 10 2.5Z"
              stroke="#979797"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M7.8 18a2.3 2.3 0 0 0 4.4 0" stroke="#979797" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
            0
          </span>
        </span>
        {perfilHref ? (
          <Link href={perfilHref} className="hover:opacity-80">
            {perfilBloco}
          </Link>
        ) : (
          perfilBloco
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Passar `perfilHref` no layout do mobilizador**

Em `src/app/[slug]/mobilizador/layout.tsx`, trocar a linha:

```tsx
          <Topbar usuarioNome={usuarioNome} usuarioFotoUrl={usuarioFotoUrl} />
```

por:

```tsx
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
            perfilHref={`/${params.slug}/mobilizador/perfil`}
          />
```

`src/app/[slug]/admin/layout.tsx` **não é alterado** — continua chamando `<Topbar usuarioNome={usuarioNome} usuarioFotoUrl={usuarioFotoUrl} />` sem `perfilHref`, então o bloco de avatar+nome do admin continua sem link, como hoje.

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. (A rota `/mobilizador/perfil` ainda não existe — isso não gera erro de tipo, só um link que 404 até a Task 4 criar a página; tudo bem, cada task é independentemente commitável.)

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/Topbar.tsx "src/app/[slug]/mobilizador/layout.tsx"
git commit -m "feat: Topbar aceita link opcional de perfil, usado no layout do mobilizador"
```

---

### Task 2: Menu do mobilizador — trocar "Minha Rede" por "Demandas"

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

**Interfaces:**
- Consumes: nenhuma nova.
- Produces: `buildItensMobilizador(slug)` retorna `[{ label: 'Início', href: '/{slug}/mobilizador', icone: 'inicio' }, { label: 'Demandas', href: '/{slug}/mobilizador/demandas', icone: 'demandas' }]`.

- [ ] **Step 1: Atualizar `buildItensMobilizador`**

Trocar:

```ts
function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Início', href: `/${slug}/mobilizador`, icone: 'inicio' },
    { label: 'Minha Rede', href: `/${slug}/mobilizador/rede`, icone: 'minha-rede' },
  ]
}
```

por:

```ts
function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Início', href: `/${slug}/mobilizador`, icone: 'inicio' },
    { label: 'Demandas', href: `/${slug}/mobilizador/demandas`, icone: 'demandas' },
  ]
}
```

- [ ] **Step 2: Remover o ícone `minha-rede`, que fica sem uso**

Remover `'minha-rede'` da união `IconeTipo` (linha com `| 'minha-rede'`) e remover o `case 'minha-rede':` inteiro (com seu SVG) dentro de `IconeMenu`. O ícone `'demandas'` já existe e já é usado pelo admin — não precisa de nada novo.

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. (A rota `/mobilizador/demandas` ainda não existe — Task 5 cria; até lá o link 404, o que é esperado nesta etapa intermediária.)

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "feat: menu do mobilizador troca Minha Rede por Demandas"
```

---

### Task 3: `UsuariosTable` ganha variante somente-leitura

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/UsuariosTable.tsx`

**Interfaces:**
- Produces: `UsuariosTable({ slug, usuarios, corPrimaria, baseHref?, somenteLeitura? })`. `baseHref` default `` `/${slug}/admin/pessoas` `` (mesmo link de hoje). `somenteLeitura` default `false` (mesmo comportamento de hoje: checkbox, "Excluir Todos" e coluna de Ações visíveis).
- Consumes: nada novo (mesmas actions/components já usados: `softDeletePessoa`, `excluirPessoasEmMassa`, `Avatar`, `SegmentPills`, `SortableHeader`, `IconeEditar`, `IconeExcluir`).

- [ ] **Step 1: Substituir o conteúdo de `UsuariosTable.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/admin/Avatar'
import SegmentPills from '@/components/admin/SegmentPills'
import SortableHeader from '@/components/SortableHeader'
import { IconeEditar, IconeExcluir } from '@/components/admin/TableIcons'
import { softDeletePessoa } from '@/actions/admin/soft-delete-pessoa'
import { excluirPessoasEmMassa } from '@/actions/admin/excluir-pessoas-em-massa'

export type UsuarioRow = {
  id: string
  nome: string
  email: string | null
  fotoUrl: string | null
  tipoConta: 'Administrador' | 'Mobilizador' | '—'
  segmentos: { id: string; nome: string }[]
}

export default function UsuariosTable({
  slug,
  usuarios,
  corPrimaria,
  baseHref = `/${slug}/admin/pessoas`,
  somenteLeitura = false,
}: {
  slug: string
  usuarios: UsuarioRow[]
  corPrimaria: string
  baseHref?: string
  somenteLeitura?: boolean
}) {
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

  const nomesSelecionados = usuarios.filter((u) => selecionados.has(u.id)).map((u) => u.nome)

  return (
    <div style={{ ['--cp' as string]: corPrimaria }}>
      {!somenteLeitura && selecionados.size > 0 && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100">
          <form
            action={excluirPessoasEmMassa}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Excluir ${selecionados.size} usuário(s) — ${nomesSelecionados.join(', ')}? A ação pode ser revertida pelo super-admin.`
                )
              ) {
                e.preventDefault()
              }
            }}
          >
            <input type="hidden" name="slug" value={slug} />
            {Array.from(selecionados).map((id) => (
              <input key={id} type="hidden" name="pessoaIds" value={id} />
            ))}
            <button type="submit" className="flex items-center gap-2 text-sm" style={{ color: corPrimaria }}>
              <IconeExcluir />
              Excluir Todos
            </button>
          </form>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200">
          <tr>
            {!somenteLeitura && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={usuarios.length > 0 && selecionados.size === usuarios.length}
                  onChange={(e) => toggleTodos(e.target.checked)}
                  aria-label="Selecionar todos"
                />
              </th>
            )}
            <th className="w-16 px-2 py-3" />
            <th className="text-left px-2 py-3">
              <SortableHeader label="Nome" field="nome" />
            </th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Email</th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Tipo de Conta</th>
            <th className="text-left px-4 py-3 font-medium text-[#686868]">Segmentos</th>
            {!somenteLeitura && <th className="text-right px-4 py-3 font-medium text-[#686868]">Ações</th>}
          </tr>
        </thead>
        <tbody>
        {usuarios.map((u) => (
          <tr
            key={u.id}
            className="border-2 border-transparent border-b-gray-100 hover:border-[var(--cp)] hover:shadow-[0_8px_19px_#E5E5E5] transition-colors"
            style={{ height: 72 }}
          >
            {!somenteLeitura && (
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selecionados.has(u.id)}
                  onChange={() => toggleUm(u.id)}
                  aria-label={`Selecionar ${u.nome}`}
                />
              </td>
            )}
            <td className="px-2 py-3">
              <Avatar fotoUrl={u.fotoUrl} nome={u.nome} size={57} />
            </td>
            <td className="px-2 py-3">
              <Link href={`${baseHref}/${u.id}`} className="font-medium text-gray-900 hover:underline">
                {u.nome}
              </Link>
            </td>
            <td className="px-4 py-3 text-[#757575]">{u.email ?? '—'}</td>
            <td className="px-4 py-3 text-[#757575]">{u.tipoConta}</td>
            <td className="px-4 py-3">
              <SegmentPills segmentos={u.segmentos} corPrimaria={corPrimaria} />
            </td>
            {!somenteLeitura && (
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  <Link href={`${baseHref}/${u.id}?editar=1`} aria-label={`Editar ${u.nome}`}>
                    <IconeEditar />
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
                      <IconeExcluir />
                    </button>
                  </form>
                </div>
              </td>
            )}
          </tr>
        ))}
        {usuarios.length === 0 && (
          <tr>
            <td colSpan={somenteLeitura ? 5 : 7} className="px-4 py-6 text-center text-gray-500">
              Nenhum usuário encontrado
            </td>
          </tr>
        )}
      </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Confirmar que o admin não foi afetado**

Abra `src/app/[slug]/admin/pessoas/page.tsx:200` e confirme que a chamada `<UsuariosTable slug={params.slug} usuarios={usuarios} corPrimaria={gabinete.corPrimaria} />` continua exatamente igual (não precisa mudar) — como `baseHref`/`somenteLeitura` têm default, o comportamento pro admin não muda.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/pessoas/UsuariosTable.tsx"
git commit -m "feat: UsuariosTable ganha variante somente-leitura reaproveitável fora do admin"
```

---

### Task 4: Página de perfil do mobilizador

**Files:**
- Create: `src/app/[slug]/mobilizador/perfil/page.tsx`

**Interfaces:**
- Consumes: `EditarPessoaForm` de `src/app/[slug]/admin/pessoas/[pessoaId]/EditarPessoaForm.tsx` (props: `slug`, `pessoaId`, `pessoa: { nome, whatsapp, email, regiaoId, profissaoId, genero, cpf, telefoneFixo, orientacaoSexual, religiao, escolaridade }`, `regioes`, `profissoes`, `corPrimaria`); `AlterarSenhaDialog` de `src/app/[slug]/mobilizador/AlterarSenhaDialog.tsx` (sem props).
- Produces: rota `/{slug}/mobilizador/perfil`, consumida pela Task 1 (link da Topbar).

- [ ] **Step 1: Criar a página**

```tsx
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import EditarPessoaForm from '../../admin/pessoas/[pessoaId]/EditarPessoaForm'
import AlterarSenhaDialog from '../AlterarSenhaDialog'

export default async function MobilizadorPerfilPage({
  params,
}: {
  params: { slug: string }
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
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      genero: true,
      regiaoId: true,
      profissaoId: true,
      cpf: true,
      telefoneFixo: true,
      orientacaoSexual: true,
      religiao: true,
      escolaridade: true,
    },
  })
  if (!pessoa) notFound()

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
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
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
            cpf: pessoa.cpf,
            telefoneFixo: pessoa.telefoneFixo,
            orientacaoSexual: pessoa.orientacaoSexual,
            religiao: pessoa.religiao,
            escolaridade: pessoa.escolaridade,
          }}
          regioes={regioes}
          profissoes={profissoes}
          corPrimaria={gabinete.corPrimaria}
        />
        <div className="pt-2">
          <AlterarSenhaDialog />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[slug]/mobilizador/perfil/page.tsx"
git commit -m "feat: página de perfil do mobilizador (dados pessoais + trocar senha)"
```

---

### Task 5: Listagem de demandas do mobilizador

**Files:**
- Create: `src/app/[slug]/mobilizador/demandas/page.tsx`

**Interfaces:**
- Consumes: `assertMobilizadorAccess(slug): Promise<{ session, gabinete, pessoa: { id, nome } }>` de `@/lib/assert-mobilizador-access`.
- Produces: rota `/{slug}/mobilizador/demandas`, consumida pela Task 2 (item de menu). Cada linha linka para `/{slug}/mobilizador/demandas/{id}` (página de detalhe já existente, não alterada por este plano).

- [ ] **Step 1: Criar a página**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'

const STATUS_CONFIG = {
  aberta: { label: 'Em aberto', cor: 'bg-yellow-100 text-yellow-800' },
  expirada: { label: 'Expirada', cor: 'bg-orange-100 text-orange-800' },
  atendida: { label: 'Atendida', cor: 'bg-green-100 text-green-800' },
  nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
} as const

export default async function MobilizadorDemandasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { status?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const { pessoa } = await assertMobilizadorAccess(params.slug)

  const demandas = await prisma.demanda.findMany({
    where: {
      gabineteId: gabinete.id,
      deletedAt: null,
      responsavelId: pessoa.id,
      ...(searchParams.status ? { status: searchParams.status } : {}),
    },
    orderBy: { prazoDesfecho: 'asc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      prazoAlterado: true,
      solicitante: { select: { nome: true } },
      area: { select: { nome: true } },
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Demandas</h1>

      <form method="GET" className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3">
        <select name="status" defaultValue={searchParams.status ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">Todos os status</option>
          <option value="aberta">Em aberto</option>
          <option value="expirada">Expirada</option>
          <option value="atendida">Atendida</option>
          <option value="nao_atendida">Não atendida</option>
        </select>
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-1.5 rounded-md text-sm"
        >
          Filtrar
        </button>
        {searchParams.status && (
          <a href={`/${params.slug}/mobilizador/demandas`} className="text-sm text-gray-500 hover:text-gray-700">
            Limpar filtro
          </a>
        )}
      </form>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Solicitante</th>
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
                    <Link href={`/${params.slug}/mobilizador/demandas/${d.id}`} className="text-blue-600 hover:underline font-medium">
                      {d.titulo}
                      {d.prazoAlterado && <span className="ml-1 text-xs text-orange-500">⚑</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.solicitante.nome}</td>
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
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nenhuma demanda encontrada</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[slug]/mobilizador/demandas/page.tsx"
git commit -m "feat: listagem de demandas do mobilizador logado"
```

---

### Task 6: Reescrever a home do mobilizador e remover `/mobilizador/rede`

**Files:**
- Modify: `src/app/[slug]/mobilizador/page.tsx` (reescrita completa)
- Modify: `src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx`
- Delete: `src/app/[slug]/mobilizador/rede/page.tsx`

**Interfaces:**
- Consumes: `UsuariosTable`/`UsuarioRow` da Task 3 (`baseHref`, `somenteLeitura`); `mapPapelParaTipoConta` de `@/lib/tipo-conta`.
- Produces: página renderizada em `/{slug}/mobilizador`, sem exports adicionais.

- [ ] **Step 1: Substituir todo o conteúdo de `src/app/[slug]/mobilizador/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { getAppUrl } from '@/lib/app-url'
import { mapPapelParaTipoConta } from '@/lib/tipo-conta'
import UsuariosTable, { type UsuarioRow } from '../admin/pessoas/UsuariosTable'

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
}

export default async function MobilizadorPage({
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

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true, tokenMobilizador: true },
  })
  if (!pessoa || !pessoa.tokenMobilizador) notFound()

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, slug: true },
  })

  const appUrl = getAppUrl()

  const linksSegmentos = await Promise.all(
    segmentos.map(async (seg) => {
      const link = `${appUrl}/${params.slug}/cadastro/${seg.slug}?m=${pessoa.tokenMobilizador}`
      const qrDataUrl = await QRCode.toDataURL(link, { width: 200, margin: 2 })
      return { ...seg, link, qrDataUrl }
    })
  )

  const { sort, order, rede, path } = searchParams

  // Verifica se ?rede pertence à sub-árvore do mobilizador logado
  if (rede && rede !== pessoa.id) {
    let currentId: string | null = rede
    let authorized = false
    const visited = new Set<string>()
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const vinculo: { indicadoPorId: string | null } | null = await prisma.vinculoRede.findFirst({
        where: { pessoaId: currentId, gabineteId: gabinete.id, deletedAt: null },
        select: { indicadoPorId: true },
      })
      const parentId: string | null = vinculo?.indicadoPorId ?? null
      if (parentId === pessoa.id) { authorized = true; break }
      currentId = parentId
    }
    if (!authorized) notFound()
  }

  const orderBy = buildOrderBy(sort, order)
  const pathIds = path ? path.split(',').filter(Boolean) : []
  const indicadorId = rede ?? pessoa.id

  const vinculos = await prisma.vinculoRede.findMany({
    where: { indicadoPorId: indicadorId, gabineteId: gabinete.id, deletedAt: null },
    select: { pessoaId: true },
  })
  const ids = vinculos.map((v) => v.pessoaId)

  const pessoasRaw = ids.length > 0
    ? await prisma.pessoa.findMany({
        where: { id: { in: ids }, gabineteId: gabinete.id, deletedAt: null },
        orderBy,
        take: 50,
        select: {
          id: true,
          nome: true,
          email: true,
          fotoUrl: true,
          userId: true,
          segmentos: { select: { segmento: { select: { id: true, nome: true } } } },
        },
      })
    : []

  const userIds = pessoasRaw.map((p) => p.userId).filter((id): id is string => !!id)
  const papeis = userIds.length
    ? await prisma.usuarioGabinete.findMany({
        where: { userId: { in: userIds }, gabineteId: gabinete.id },
        select: { userId: true, papel: true },
      })
    : []
  const papelPorUserId = new Map(papeis.map((p) => [p.userId, p.papel]))

  const usuariosRede: UsuarioRow[] = pessoasRaw.map((p) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    fotoUrl: p.fotoUrl,
    tipoConta: mapPapelParaTipoConta(p.userId ? papelPorUserId.get(p.userId) : null),
    segmentos: p.segmentos.map((s) => s.segmento),
  }))

  const breadcrumbPessoas = pathIds.length > 0
    ? await prisma.pessoa.findMany({
        where: { id: { in: pathIds }, gabineteId: gabinete.id, deletedAt: null },
        select: { id: true, nome: true },
      })
    : []
  const breadcrumb = pathIds
    .map((id) => breadcrumbPessoas.find((p) => p.id === id))
    .filter(Boolean) as { id: string; nome: string }[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {pessoa.nome}!</h1>
        <p className="text-sm text-gray-600 mt-1">
          Compartilhe seu link personalizado para convidar pessoas.
        </p>
      </div>

      {linksSegmentos.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum segmento ativo no momento.</p>
      ) : (
        <div className="space-y-6">
          {linksSegmentos.map((seg) => (
            <div key={seg.id} className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-gray-800">{seg.nome}</h2>
              <div>
                <p className="text-xs text-gray-500 mb-1">Seu link personalizado</p>
                <p className="text-sm text-blue-600 break-all">{seg.link}</p>
                <a
                  href={seg.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 text-xs text-blue-600 underline"
                >
                  Abrir link
                </a>
              </div>
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seg.qrDataUrl} alt={`QR Code — ${seg.nome}`} className="w-48 h-48" />
                <a
                  href={seg.qrDataUrl}
                  download={`qr-${params.slug}-${seg.slug}.png`}
                  className="text-xs text-blue-600 underline"
                >
                  Baixar QR Code
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Minha Rede</h2>

        {breadcrumb.length > 0 && (
          <nav className="text-sm text-gray-500 flex items-center gap-1 flex-wrap">
            <Link href={`/${params.slug}/mobilizador`} className="hover:text-gray-900">
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
                      href={`/${params.slug}/mobilizador?rede=${item.id}&path=${crumbPath}`}
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
          <UsuariosTable
            slug={params.slug}
            usuarios={usuariosRede}
            corPrimaria={gabinete.corPrimaria}
            baseHref={`/${params.slug}/mobilizador/pessoas`}
            somenteLeitura
          />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Corrigir o link "Voltar" e adicionar drill-down em `src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx`**

Trocar:

```tsx
        <Link href={`/${params.slug}/mobilizador/rede`} className="text-sm text-gray-500 hover:underline">
          ← Voltar
        </Link>
```

por:

```tsx
        <Link href={`/${params.slug}/mobilizador`} className="text-sm text-gray-500 hover:underline">
          ← Voltar
        </Link>
```

Logo após o bloco "Dados cadastrais" (depois do `</div>` que fecha a `section` de dados cadastrais, antes do comentário `{/* Observações */}`), adicionar uma nova seção que só aparece quando a pessoa listada também é mobilizadora, mostrando quantos cadastros ela tem na própria rede e linkando para o drill-down:

```tsx
      {pessoa.isMobilizador && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm">
          <p className="text-xs text-gray-500">Cadastrados na Rede</p>
          {totalRede > 0 ? (
            <Link
              href={`/${params.slug}/mobilizador?rede=${pessoa.id}&path=${pessoa.id}`}
              className="text-lg font-semibold hover:underline text-gray-900"
            >
              {totalRede}
            </Link>
          ) : (
            <p className="text-lg font-semibold text-gray-400">0</p>
          )}
        </div>
      )}
```

Para isso funcionar, é preciso calcular `totalRede` antes do `return`. Adicionar, logo depois do bloco que já busca `demandas` (após o `const demandas = await prisma.demanda.findMany({...})`):

```ts
  const totalRede = pessoa.isMobilizador
    ? await prisma.vinculoRede.count({ where: { indicadoPorId: pessoa.id, deletedAt: null } })
    : 0
```

- [ ] **Step 3: Remover a página antiga de rede**

```bash
git rm -r "src/app/[slug]/mobilizador/rede"
```

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/mobilizador/page.tsx" "src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx"
git commit -m "feat: home do mobilizador vira a listagem da rede; remove /mobilizador/rede"
```

---

### Task 7: Verificação end-to-end no navegador

**Files:** nenhum (só verificação).

- [ ] **Step 1: Build de produção**

Run: `npm run build`
Expected: build conclui sem erros de tipo/lint bloqueante.

- [ ] **Step 2: Confirmar servidor de dev no ar**

Se não houver servidor rodando em `http://localhost:3000`, rodar `npm run dev` em background e aguardar "Ready in".

- [ ] **Step 3: Login e navegação como mobilizador**

Usando Playwright (reaproveitando sessão/perfil de navegador já usado nesta sessão), logar como um mobilizador de teste (ou usar Modo Suporte + trocar para uma sessão de mobilizador, se for o caminho disponível) e navegar até `http://localhost:3000/{slug}/mobilizador`.
Expected: a página mostra "Olá, {nome}!", os cards de link/QR code por segmento, e logo abaixo a seção "Minha Rede" com a tabela no mesmo estilo visual da listagem de Usuários do admin (avatar, nome, email, tipo de conta, segmentos) — sem checkbox, sem coluna de Ações.

- [ ] **Step 4: Conferir o menu lateral**

Expected: o menu mostra só "Início" e "Demandas" (não mais "Minha Rede").

- [ ] **Step 5: Conferir drill-down na sub-rede**

Se houver algum mobilizador na rede listada, clicar no nome dele → deve abrir `/mobilizador/pessoas/{id}` → se essa pessoa também for mobilizadora, deve aparecer "Cadastrados na Rede" com um número clicável → clicar deve voltar para `/mobilizador?rede={id}&path={id}` mostrando a sub-rede, com breadcrumb "Minha Rede › Rede de {nome}".

- [ ] **Step 6: Conferir "Demandas" no menu**

Clicar em "Demandas" no menu → deve abrir `/mobilizador/demandas` com a listagem filtrada por status, mostrando só demandas em que esse mobilizador é responsável. Clicar numa demanda deve abrir a ficha de detalhe já existente (`/mobilizador/demandas/{id}`).

- [ ] **Step 7: Conferir o link de perfil na Topbar**

Clicar na foto/nome no canto superior direito → deve abrir `/mobilizador/perfil` com o formulário de dados pessoais preenchido e o botão de trocar senha. Confirmar que a Topbar do **admin** (login como admin) continua sem link nessa área (comportamento inalterado).

- [ ] **Step 8: Reportar resultado**

Se todos os passos passaram, reportar ao usuário citando os passos testados. Se algum passo não puder ser testado por falta de dados de teste (ex: nenhum mobilizador com sub-rede), reportar isso explicitamente em vez de pular silenciosamente.

---

## Self-Review Notes

- **Cobertura do spec:** menu com Início/Demandas (Task 2), home vira listagem da rede reaproveitando UsuariosTable somente-leitura (Tasks 3+6), busca/drill-down preservados — busca corrigida no plano (não existia antes, não foi adicionada; ordenação e drill-down preservados) (Task 6), Demandas como item de menu com listagem própria (Tasks 2+5), Meu Perfil vira página própria acessada pela Topbar (Tasks 1+4), Topbar do admin inalterada (Task 1).
- **Consistência de tipos:** `UsuarioRow` (Task 3) é usado com os mesmos campos em `UsuariosTable` e na Task 6 (`id, nome, email, fotoUrl, tipoConta, segmentos`). `assertMobilizadorAccess` (Task 5) retorna `{ session, gabinete, pessoa: { id, nome } }`, consistente com o uso em `src/actions/mobilizador/promover-mobilizador.ts` já existente no código.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo em cada step.
