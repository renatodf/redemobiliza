# Edição/exclusão da ficha de demanda (admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela `/admin/demandas/[demandaId]`, o pencil (✏️) abre um modo de edição que permite alterar título, descrição, área, observação, status (livremente entre os 4 estados) e prazo; a lixeira (🗑️) exclui a demanda (soft delete). Por padrão a tela abre em modo visualização, sem nenhum campo editável.

**Architecture:** Um único checkbox oculto (`#modo-edicao`) no topo da página controla, via CSS `peer-checked` (mesmo padrão já usado na edição de observações da ficha de pessoa), a visibilidade de blocos de edição que ficam como irmãos diretos do checkbox no container principal. Cada bloco de edição é uma mini-form independente com seu próprio Server Action, seguindo o padrão já estabelecido no arquivo (`atualizarObservacaoDemanda`, `alterarPrazoDemanda`, etc). Duas actions novas (`editarDemanda`, `excluirDemanda`) e uma renomeada/generalizada (`marcarDesfechoDemanda` → `alterarStatusDemanda`, que passa a aceitar os 4 status sem restrição de status atual).

**Tech Stack:** Next.js 14 (App Router, Server Actions), Prisma, Tailwind CSS 3.4.

## Global Constraints

- Escopo é só a tela de admin (`src/app/[slug]/admin/demandas/[demandaId]/page.tsx`). A tela do mobilizador (`src/app/[slug]/mobilizador/demandas/[demandaId]/page.tsx`) e suas actions (`src/actions/mobilizador/*`) não são tocadas.
- Exclusão de demanda é sempre soft delete (`deletedAt = new Date()`), nunca hard delete. Sem restrição por histórico — qualquer demanda pode ser excluída.
- Troca de status passa a valer de qualquer status para qualquer status (remove a checagem `status !== 'aberta' && status !== 'expirada'` que existia em `marcarDesfechoDemanda` e `alterarPrazoDemanda`).
- Toda action nova segue o padrão de autorização já usado no arquivo: `assertAdminAccess(slug)` de `@/lib/assert-admin-access`, que já retorna `{ session, gabinete }` — não recriar um client Supabase separado via `cookies()` como os arquivos antigos faziam.
- Toda alteração de dados (dados, status) grava uma linha em `MovimentacaoDemanda` (mesmo padrão de auditoria já usado no histórico da demanda).
- Sem testes automatizados de Server Actions neste projeto (não há mock de Prisma/Supabase estabelecido — as actions existentes de demanda não têm teste unitário). Verificação é por `tsc`/`lint`/`build` + checagem manual no navegador, seguindo o padrão real do repo.

---

## File Structure

**Criar:**
- `src/actions/admin/excluir-demanda.ts` — soft delete da demanda.
- `src/app/[slug]/admin/demandas/[demandaId]/ExcluirDemandaButton.tsx` — client component com confirmação, aciona `excluirDemanda`.
- `src/actions/admin/editar-demanda.ts` — edita título/descrição/área.

**Renomear + modificar:**
- `src/actions/admin/marcar-desfecho-demanda.ts` → `src/actions/admin/alterar-status-demanda.ts` — passa a aceitar os 4 status.

**Modificar:**
- `src/actions/admin/alterar-prazo-demanda.ts` — remove a restrição de status atual.
- `src/app/[slug]/admin/demandas/[demandaId]/page.tsx` — reescrita: checkbox de modo edição, blocos de edição condicionais, novos imports, remoção do bloco "Desfecho".

---

### Task 1: Action de exclusão de demanda

**Files:**
- Create: `src/actions/admin/excluir-demanda.ts`

**Interfaces:**
- Consumes: `assertAdminAccess(slug: string): Promise<{ session, gabinete: { id: string, ... } }>` de `@/lib/assert-admin-access`; `prisma` de `@/lib/prisma`.
- Produces: `excluirDemanda(formData: FormData): Promise<void>` — lida via `<form action={excluirDemanda}>`, redireciona ao final (não retorna erro em objeto, como `softDeletePessoa`).

- [ ] **Step 1: Criar a action**

```ts
'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function excluirDemanda(formData: FormData) {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { deletedAt: new Date() },
  })

  redirect(`/${slug}/admin/demandas`)
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `src/actions/admin/excluir-demanda.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/excluir-demanda.ts
git commit -m "feat: action de exclusão (soft delete) de demanda"
```

---

### Task 2: Botão de exclusão com confirmação

**Files:**
- Create: `src/app/[slug]/admin/demandas/[demandaId]/ExcluirDemandaButton.tsx`

**Interfaces:**
- Consumes: `excluirDemanda(formData: FormData): Promise<void>` da Task 1 (`@/actions/admin/excluir-demanda`).
- Produces: `<ExcluirDemandaButton slug={string} demandaId={string} />` — componente client, usado na Task 6 dentro do cabeçalho da página de detalhe.

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { excluirDemanda } from '@/actions/admin/excluir-demanda'

export default function ExcluirDemandaButton({
  slug,
  demandaId,
}: {
  slug: string
  demandaId: string
}) {
  return (
    <form
      action={excluirDemanda}
      onSubmit={(e) => {
        if (!confirm('Excluir esta demanda? A ação pode ser revertida pelo super-admin.')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="demandaId" value={demandaId} />
      <button type="submit" aria-label="Excluir demanda" title="Excluir demanda" className="text-lg leading-none hover:opacity-70">
        🗑️
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `ExcluirDemandaButton.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[slug]/admin/demandas/[demandaId]/ExcluirDemandaButton.tsx"
git commit -m "feat: botão de excluir demanda com confirmação"
```

---

### Task 3: Action de edição de dados (título/descrição/área)

**Files:**
- Create: `src/actions/admin/editar-demanda.ts`

**Interfaces:**
- Consumes: `assertAdminAccess`, `prisma`; `prisma.movimentacaoDemanda.create({ data: { demandaId, tipo, descricao, autorId } })` (mesmo shape usado em `marcar-desfecho-demanda.ts`).
- Produces: `editarDemanda(formData: FormData): Promise<{ erro?: string }>` — formData espera `slug`, `demandaId`, `titulo`, `descricao`, `areaId`. Usado via wrapper `'use server'` void na Task 6 (mesmo padrão de `atualizarObservacaoDemandaAction`).

- [ ] **Step 1: Criar a action**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function editarDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const titulo = (formData.get('titulo') as string).trim()
  const descricao = (formData.get('descricao') as string).trim()
  const areaId = formData.get('areaId') as string

  if (!titulo || !descricao || !areaId) return { erro: 'Preencha todos os campos obrigatórios' }

  const { session, gabinete } = await assertAdminAccess(slug)

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true, nome: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
    select: { titulo: true, descricao: true, areaId: true },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }

  const areaCheck = await prisma.areaDemanda.findFirst({
    where: { id: areaId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!areaCheck) return { erro: 'Área não encontrada' }

  const camposAlterados: string[] = []
  if (demanda.titulo !== titulo) camposAlterados.push('título')
  if (demanda.descricao !== descricao) camposAlterados.push('descrição')
  if (demanda.areaId !== areaId) camposAlterados.push('área')

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { titulo, descricao, areaId },
  })

  if (camposAlterados.length > 0) {
    await prisma.movimentacaoDemanda.create({
      data: {
        demandaId,
        tipo: 'dados_editados',
        descricao: `Dados editados por ${pessoa.nome}: ${camposAlterados.join(', ')} alterado(s)`,
        autorId: pessoa.id,
      },
    })
  }

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  revalidatePath(`/${slug}/admin/demandas`)
  return {}
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `src/actions/admin/editar-demanda.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/editar-demanda.ts
git commit -m "feat: action de edição de título/descrição/área da demanda"
```

---

### Task 4: Generalizar troca de status (rename de marcar-desfecho-demanda)

**Files:**
- Modify (rename): `src/actions/admin/marcar-desfecho-demanda.ts` → `src/actions/admin/alterar-status-demanda.ts`

**Interfaces:**
- Consumes: `assertAdminAccess`, `prisma`.
- Produces: `alterarStatusDemanda(formData: FormData): Promise<{ erro?: string }>` — formData espera `slug`, `demandaId`, `novoStatus` (um de `aberta | expirada | atendida | nao_atendida`). Usado na Task 6.

- [ ] **Step 1: Renomear o arquivo**

```bash
git mv src/actions/admin/marcar-desfecho-demanda.ts src/actions/admin/alterar-status-demanda.ts
```

- [ ] **Step 2: Substituir o conteúdo do arquivo renomeado**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Em aberto',
  expirada: 'Expirada',
  atendida: 'Atendida',
  nao_atendida: 'Não atendida',
}

export async function alterarStatusDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const novoStatus = formData.get('novoStatus') as string

  if (!Object.keys(STATUS_LABELS).includes(novoStatus)) return { erro: 'Status inválido' }

  const { session, gabinete } = await assertAdminAccess(slug)

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true, nome: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
    select: { status: true },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }
  if (demanda.status === novoStatus) return {}

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { status: novoStatus },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'status_alterado',
      descricao: `Status alterado de ${STATUS_LABELS[demanda.status] ?? demanda.status} para ${STATUS_LABELS[novoStatus]} por ${pessoa.nome}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  revalidatePath(`/${slug}/admin/demandas`)
  return {}
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: erros apontando para `src/app/[slug]/admin/demandas/[demandaId]/page.tsx` (import antigo `marcar-desfecho-demanda` quebrado) — esperado, será corrigido na Task 6. Confirme que não há outros erros fora desse arquivo.

- [ ] **Step 4: Commit**

```bash
git add -A src/actions/admin/marcar-desfecho-demanda.ts src/actions/admin/alterar-status-demanda.ts
git commit -m "refactor: renomear marcar-desfecho-demanda para alterar-status-demanda e liberar troca livre de status"
```

---

### Task 5: Remover restrição de status na troca de prazo

**Files:**
- Modify: `src/actions/admin/alterar-prazo-demanda.ts:39-42`

**Interfaces:**
- Consumes/Produces: inalterado — `alterarPrazoDemanda(formData: FormData): Promise<{ erro?: string }>` continua com a mesma assinatura, só perde a checagem de status.

- [ ] **Step 1: Remover o bloco de restrição**

Em `src/actions/admin/alterar-prazo-demanda.ts`, remover estas linhas (parte do bloco atual entre buscar `demanda` e calcular `prazoAnterior`):

```ts
  if (demanda.status !== 'aberta' && demanda.status !== 'expirada') {
    return { erro: 'Apenas demandas abertas ou expiradas podem ter o prazo alterado' }
  }
```

O `select` da consulta de `demanda` (`select: { prazoDesfecho: true, status: true }`) pode manter o campo `status` mesmo sem uso — não é necessário limpar, mas se preferir, troque para `select: { prazoDesfecho: true }` já que `status` deixa de ser lido.

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros em `alterar-prazo-demanda.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/alterar-prazo-demanda.ts
git commit -m "fix: permitir alterar prazo da demanda independente do status atual"
```

---

### Task 6: Reescrever a página de detalhe da demanda (toggle visualização/edição)

**Files:**
- Modify: `src/app/[slug]/admin/demandas/[demandaId]/page.tsx` (reescrita completa)

**Interfaces:**
- Consumes: `editarDemanda` (Task 3), `alterarStatusDemanda` (Task 4), `alterarPrazoDemanda` (Task 5), `atualizarObservacaoDemanda` (inalterado), `reatribuirResponsavel` (inalterado), `ExcluirDemandaButton` (Task 2), `prisma.areaDemanda.findMany`.
- Produces: página renderizada, sem exports adicionais.

- [ ] **Step 1: Substituir todo o conteúdo do arquivo**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { atualizarObservacaoDemanda as atualizarObservacaoDemandaAction } from '@/actions/admin/atualizar-observacao-demanda'
import { alterarPrazoDemanda as alterarPrazoDemandaAction } from '@/actions/admin/alterar-prazo-demanda'
import { alterarStatusDemanda as alterarStatusDemandaAction } from '@/actions/admin/alterar-status-demanda'
import { editarDemanda as editarDemandaAction } from '@/actions/admin/editar-demanda'
import { reatribuirResponsavel as reatribuirResponsavelAction } from '@/actions/admin/reatribuir-responsavel'
import ExcluirDemandaButton from './ExcluirDemandaButton'

// Wrappers para actions que retornam valores, convertendo para void para compatibilidade com form action
async function atualizarObservacaoDemanda(formData: FormData) {
  'use server'
  await atualizarObservacaoDemandaAction(formData)
}

async function alterarPrazoDemanda(formData: FormData) {
  'use server'
  await alterarPrazoDemandaAction(formData)
}

async function alterarStatusDemanda(formData: FormData) {
  'use server'
  await alterarStatusDemandaAction(formData)
}

async function editarDemanda(formData: FormData) {
  'use server'
  await editarDemandaAction(formData)
}

async function reatribuirResponsavel(formData: FormData) {
  'use server'
  await reatribuirResponsavelAction(formData)
}

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

  const [demanda, colaboradores, areas] = await Promise.all([
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
    prisma.areaDemanda.findMany({
      where: { gabineteId: gabinete.id },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  if (!demanda) notFound()

  const cfg = STATUS_CONFIG[demanda.status as keyof typeof STATUS_CONFIG] ?? { label: demanda.status, cor: 'bg-gray-100 text-gray-800' }
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

      <input type="checkbox" id="modo-edicao" className="peer hidden" />

      {/* Cabeçalho */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900">{demanda.titulo}</h1>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${cfg.cor}`}>
              {cfg.label}
            </span>
            <label htmlFor="modo-edicao" className="cursor-pointer text-lg leading-none" aria-label="Editar demanda" title="Editar demanda">
              ✏️
            </label>
            <ExcluirDemandaButton slug={params.slug} demandaId={demanda.id} />
          </div>
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

      {/* Editar dados (só em modo edição) */}
      <div className="hidden peer-checked:block bg-white rounded-lg shadow-sm p-6 space-y-3">
        <h2 className="text-base font-semibold">Editar dados</h2>
        <form action={editarDemanda} className="space-y-3">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="demandaId" value={demanda.id} />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
            <input
              name="titulo"
              type="text"
              defaultValue={demanda.titulo}
              required
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
            <textarea
              name="descricao"
              rows={3}
              defaultValue={demanda.descricao}
              required
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Área</label>
            <select
              name="areaId"
              defaultValue={demanda.areaId}
              required
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Salvar dados
          </button>
        </form>
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
        {demanda.observacao ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3">{demanda.observacao}</p>
        ) : (
          <p className="text-sm text-gray-500">Nenhuma observação registrada.</p>
        )}
      </div>

      {/* Editar observação (só em modo edição) */}
      <div className="hidden peer-checked:block bg-white rounded-lg shadow-sm p-6 space-y-3">
        <h2 className="text-base font-semibold">Atualizar observação</h2>
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

      {/* Status (só em modo edição) */}
      <div className="hidden peer-checked:block bg-white rounded-lg shadow-sm p-6 space-y-3">
        <h2 className="text-base font-semibold">Status</h2>
        <form action={alterarStatusDemanda} className="flex gap-3">
          <input type="hidden" name="slug" value={params.slug} />
          <input type="hidden" name="demandaId" value={demanda.id} />
          <select
            name="novoStatus"
            defaultValue={demanda.status}
            required
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="aberta">Em aberto</option>
            <option value="expirada">Expirada</option>
            <option value="atendida">Atendida</option>
            <option value="nao_atendida">Não atendida</option>
          </select>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Salvar status
          </button>
        </form>
      </div>

      {/* Prazo (só em modo edição) */}
      <div className="hidden peer-checked:block bg-white rounded-lg shadow-sm p-6 space-y-3">
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

      {/* Linha do tempo */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Histórico</h2>
        <ol className="relative border-l border-gray-200 space-y-4 ml-3">
          {demanda.historico.map((mov) => (
            <li key={mov.id} className="ml-4">
              <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-gray-400" />
              <p className="text-xs text-gray-400">
                {mov.criadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{mov.autor?.nome ?? 'Sistema'}
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

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem erros novos (avisos pré-existentes no restante do projeto não bloqueiam).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/demandas/[demandaId]/page.tsx"
git commit -m "feat: toggle de visualização/edição na ficha de demanda com edição de dados, status livre e prazo"
```

---

### Task 7: Verificação end-to-end no navegador

**Files:** nenhum (só verificação).

- [ ] **Step 1: Build de produção**

Run: `npm run build`
Expected: build conclui sem erros de tipo/lint bloqueante.

- [ ] **Step 2: Subir o servidor de dev**

Run: `npm run dev` (em background, ou usar a skill `run` do projeto se disponível)
Expected: servidor sobe em `http://localhost:3000` (ou porta configurada) sem erros no console.

- [ ] **Step 3: Verificar modo visualização por padrão**

Usando o Playwright MCP (reaproveitando sessão logada existente, se houver — há um perfil de navegador já usado nesta sessão em `.playwright-mcp/`), navegar até uma página de detalhe de demanda existente (`/{slug}/admin/demandas/{demandaId}`).
Expected: nenhum campo de formulário visível (nem título/descrição/área editáveis, nem observação, nem status, nem prazo) — só texto e os ícones ✏️/🗑️ no cabeçalho.

- [ ] **Step 4: Verificar modo edição**

Clicar no ✏️.
Expected: aparecem, nessa ordem, os blocos "Editar dados", "Atualizar observação", "Status" e "Alterar prazo", cada um com seus campos preenchidos com os valores atuais da demanda.

- [ ] **Step 5: Editar título/descrição/área**

Alterar o campo Título, clicar "Salvar dados".
Expected: página recarrega, cabeçalho mostra o novo título, e o card "Histórico" ganha uma entrada nova tipo "Dados editados por ... título alterado(s)".

- [ ] **Step 6: Trocar status livremente**

Clicar ✏️ novamente, selecionar um status diferente do atual no card "Status" (inclusive testar ir de um status "fechado" como Atendida de volta para Em aberto), clicar "Salvar status".
Expected: badge do cabeçalho reflete o novo status, e "Histórico" ganha uma entrada "Status alterado de X para Y por ...".

- [ ] **Step 7: Alterar prazo**

Clicar ✏️, no card "Alterar prazo" mudar a data e preencher a justificativa, submeter.
Expected: prazo no cabeçalho atualiza e mostra "⚑ alterado"; tentar submeter sem justificativa é bloqueado pelo navegador (campo `required`).

- [ ] **Step 8: Excluir demanda**

Na página de detalhe, clicar 🗑️, confirmar o diálogo do navegador.
Expected: redireciona para `/{slug}/admin/demandas` e a demanda excluída não aparece mais na listagem.

- [ ] **Step 9: Reportar resultado**

Se todos os passos acima passaram, reportar ao usuário que a verificação manual foi concluída com sucesso, citando os passos testados. Se algum passo exigir login manual (sessão expirada), pausar e pedir ao usuário para logar antes de continuar — não pular a verificação.

---

## Self-Review Notes

- **Cobertura do spec:** toggle visualização/edição (Task 6), dados editáveis título/descrição/área (Task 3+6), observação atrás do toggle (Task 6), status livre entre os 4 estados (Task 4+6), prazo sem restrição de status (Task 5+6), exclusão soft delete com confirmação (Task 1+2+6). Mobilizador explicitamente fora de escopo (não há task tocando `src/actions/mobilizador/*` ou a página do mobilizador).
- **Consistência de tipos:** `alterarStatusDemanda`, `editarDemanda`, `alterarPrazoDemanda`, `atualizarObservacaoDemanda` todas retornam `Promise<{ erro?: string }>` e são chamadas via wrappers `'use server'` que descartam o retorno (mesmo padrão do arquivo original) — nomes e assinaturas conferem entre a Task que cria a action e a Task 6 que a consome.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo em cada step.
