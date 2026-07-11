# Central de Filtros — Aba Banco de Talentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a aba "Banco de Talentos" à Central de Filtros (`/admin/filtros` — só admin, mobilizador não tem acesso), com filtro por área/prioridade/PcD/região, seleção de candidatos via checkbox, e exportação em ZIP dos currículos com opção de abrir Demandas de acompanhamento de encaminhamento.

**Architecture:** Um módulo `filtros-banco-talentos.ts` monta o `where` do Prisma (sem `gabineteId` direto no model — filtra via relação `pessoa`). Um componente Client `BancoTalentosFiltro.tsx` gerencia três pedaços de estado local: o filtro de área (multi-select, submetido via GET), a seleção de candidatos (checkboxes, escopo só da página atual), e o dialog de confirmação de exportação. A exportação é um único `POST` nativo (form HTML puro, funciona sem JS) pra uma rota que — se solicitado — cria uma `Demanda` por candidato (reaproveitando o padrão de `criarDemanda`, incluindo o e-mail de notificação ao responsável) e sempre monta e retorna um ZIP dos currículos via `jszip`.

**Tech Stack:** Next.js 14 Route Handler, `jszip` (dependência nova), Prisma, Resend (via `enviarEmail` já existente).

## Global Constraints

- Sem migration/schema novo — `BancoTalentos`, `AreaColocacao`, `BancoTalentosArea` já existem da Fase 1. `BancoTalentos` não tem `gabineteId` direto: todo filtro de tenant/região passa por `pessoa: { gabineteId, regiaoId }`.
- Filtros: área (`BancoTalentosArea`, multi-select), prioridade (1/2/3), PcD (sim/não), região (via `pessoa.regiaoId`).
- **Sempre aplicados no `where`, sem filtro visível na UI**: `colocado: false` e `curriculoUrl: { not: null }` — quem já foi colocado no mercado ou não tem currículo anexado nunca aparece na listagem (não é só ignorado no ZIP).
- Só admin tem acesso — mobilizador não vê essa aba (sem alteração nas telas do mobilizador).
- Seleção de candidatos via checkbox, escopo só da página atual (20 itens) — trocar de página reseta a seleção.
- Exportação sempre cria as Demandas (se solicitado) **antes** de montar o ZIP, nunca em paralelo — se a criação de Demandas falhar (ex: responsável inválido), nenhum ZIP é gerado.
- E-mail de notificação "nova demanda atribuída" é enviado uma vez por Demanda criada (mesmo padrão de `criarDemanda`), mesmo em lote — decisão explícita do usuário.
- Sem model `Encaminhamento`, sem "gestor padrão" configurável, sem dashboard — tudo isso ficou fora, ver `docs/superpowers/specs/2026-07-11-central-de-filtros-aba-banco-de-talentos-design.md`.
- **Lição de sessões anteriores**: `tsc --noEmit` e `vitest` NÃO pegam erros de ESLint (`next build` os pega, e o build Docker falha se houver erro de lint). Todo task desta plano precisa rodar `npm run build` completo antes do commit, não só `tsc --noEmit`.
- Nenhuma mudança de comportamento nas abas Pessoas e Demandas já em produção.

---

### Task 1: Módulo `filtros-banco-talentos.ts`

**Files:**
- Create: `src/lib/filtros-banco-talentos.ts`
- Test: `src/lib/__tests__/filtros-banco-talentos.test.ts`

**Interfaces:**
- Produces: `FiltrosBancoTalentosParams` (type), `buildWhereBancoTalentos(gabineteId: string, params: FiltrosBancoTalentosParams): WhereBancoTalentos` — reaproveitado por Task 3 (tela) e Task 4 (rota de exportação, pra validar o total antes de montar o ZIP se necessário)

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `src/lib/__tests__/filtros-banco-talentos.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildWhereBancoTalentos } from '../filtros-banco-talentos'

describe('buildWhereBancoTalentos', () => {
  it('sempre exclui colocado=true', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.colocado).toBe(false)
  })

  it('sempre exige curriculoUrl não nulo', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.curriculoUrl).toEqual({ not: null })
  })

  it('sempre filtra por gabineteId via relação pessoa', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.pessoa.gabineteId).toBe('gab-1')
  })

  it('filtra por região via relação pessoa', () => {
    const where = buildWhereBancoTalentos('gab-1', { regiaoId: 'regiao-1' })
    expect(where.pessoa.regiaoId).toBe('regiao-1')
  })

  it('sem filtro de região, não aplica regiaoId', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.pessoa.regiaoId).toBeUndefined()
  })

  it('filtra por prioridade, convertendo string pra número', () => {
    const where = buildWhereBancoTalentos('gab-1', { prioridade: '2' })
    expect(where.prioridade).toBe(2)
  })

  it('sem filtro de prioridade, não aplica', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.prioridade).toBeUndefined()
  })

  it('filtra isPcd=true quando "sim"', () => {
    const where = buildWhereBancoTalentos('gab-1', { isPcd: 'sim' })
    expect(where.isPcd).toBe(true)
  })

  it('filtra isPcd=false quando "nao"', () => {
    const where = buildWhereBancoTalentos('gab-1', { isPcd: 'nao' })
    expect(where.isPcd).toBe(false)
  })

  it('sem filtro de PcD, não aplica', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.isPcd).toBeUndefined()
  })

  it('filtra por áreas via relação, quando há ao menos uma', () => {
    const where = buildWhereBancoTalentos('gab-1', { areaIds: ['area-1', 'area-2'] })
    expect(where.areas).toEqual({ some: { areaColocacaoId: { in: ['area-1', 'area-2'] } } })
  })

  it('lista de áreas vazia não aplica filtro de área', () => {
    const where = buildWhereBancoTalentos('gab-1', { areaIds: [] })
    expect(where.areas).toBeUndefined()
  })

  it('sem areaIds, não aplica filtro de área', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.areas).toBeUndefined()
  })

  it('combina todos os filtros ao mesmo tempo', () => {
    const where = buildWhereBancoTalentos('gab-1', {
      areaIds: ['area-1'],
      prioridade: '1',
      isPcd: 'sim',
      regiaoId: 'regiao-1',
    })
    expect(where).toEqual({
      colocado: false,
      curriculoUrl: { not: null },
      pessoa: { gabineteId: 'gab-1', regiaoId: 'regiao-1' },
      prioridade: 1,
      isPcd: true,
      areas: { some: { areaColocacaoId: { in: ['area-1'] } } },
    })
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/filtros-banco-talentos.test.ts`
Expected: FAIL — `Cannot find module '../filtros-banco-talentos'`

- [ ] **Step 3: Criar `src/lib/filtros-banco-talentos.ts`**

```typescript
export type FiltrosBancoTalentosParams = {
  areaIds?: string[]
  prioridade?: string
  isPcd?: 'sim' | 'nao'
  regiaoId?: string
}

export type WhereBancoTalentos = {
  colocado: false
  curriculoUrl: { not: null }
  pessoa: { gabineteId: string; regiaoId?: string }
  prioridade?: number
  isPcd?: boolean
  areas?: { some: { areaColocacaoId: { in: string[] } } }
}

export function buildWhereBancoTalentos(
  gabineteId: string,
  params: FiltrosBancoTalentosParams
): WhereBancoTalentos {
  const where: WhereBancoTalentos = {
    colocado: false,
    curriculoUrl: { not: null },
    pessoa: { gabineteId },
  }
  if (params.regiaoId) where.pessoa.regiaoId = params.regiaoId
  if (params.prioridade) where.prioridade = Number(params.prioridade)
  if (params.isPcd === 'sim') where.isPcd = true
  else if (params.isPcd === 'nao') where.isPcd = false
  if (params.areaIds && params.areaIds.length > 0) {
    where.areas = { some: { areaColocacaoId: { in: params.areaIds } } }
  }
  return where
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/filtros-banco-talentos.test.ts`
Expected: PASS — 14/14 testes

- [ ] **Step 5: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos (o projeto já tem alguns erros pré-existentes e não relacionados em arquivos de teste de exportação — ignore-os)

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 6: Commit**

```bash
git add src/lib/filtros-banco-talentos.ts src/lib/__tests__/filtros-banco-talentos.test.ts
git commit -m "feat: buildWhereBancoTalentos — módulo de filtro da aba Banco de Talentos"
```

---

### Task 2: Dependência `jszip` + helper `garantir-area-emprego.ts`

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `src/lib/garantir-area-emprego.ts`

**Interfaces:**
- Produces: `garantirAreaEmprego(gabineteId: string): Promise<string>` (retorna o `id` da `AreaDemanda` "Emprego", criando-a se não existir) — reaproveitado por Task 4 (rota de exportação)

Sem teste automatizado — depende de Prisma/banco real (I/O externo), mesmo padrão já aceito no projeto pra helpers equivalentes (`criarAreaColocacao` também não tem teste).

- [ ] **Step 1: Instalar a dependência**

Run: `npm install jszip`
Expected: `jszip` aparece em `package.json` (`dependencies`) e `package-lock.json` é atualizado

- [ ] **Step 2: Criar `src/lib/garantir-area-emprego.ts`**

```typescript
import { prisma } from './prisma'

// Idempotente — mesmo padrão de criarAreaColocacao (findFirst + create,
// sem transação/lock). Uma corrida rara poderia criar duas áreas
// "Emprego"; risco aceito, mesmo já assumido em criarAreaColocacao.
export async function garantirAreaEmprego(gabineteId: string): Promise<string> {
  const existente = await prisma.areaDemanda.findFirst({
    where: { gabineteId, nome: 'Emprego' },
    select: { id: true },
  })
  if (existente) return existente.id

  const criada = await prisma.areaDemanda.create({
    data: { gabineteId, nome: 'Emprego' },
    select: { id: true },
  })
  return criada.id
}
```

- [ ] **Step 3: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/garantir-area-emprego.ts
git commit -m "feat: dependência jszip + garantirAreaEmprego (idempotente)"
```

---

### Task 3: Componente `BancoTalentosFiltro.tsx` + página `/admin/filtros/banco-talentos`

**Files:**
- Create: `src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx`
- Create: `src/app/[slug]/admin/filtros/banco-talentos/page.tsx`
- Modify: `src/app/[slug]/admin/filtros/page.tsx`
- Modify: `src/app/[slug]/admin/filtros/demandas/page.tsx`

**Interfaces:**
- Consumes: `buildWhereBancoTalentos`, `FiltrosBancoTalentosParams` (Task 1); `Pagination` de `@/components/admin/Pagination` (já existe); `corTextoContraste` de `@/lib/cor-contraste` (já existe); `FiltrosTabs` de `./FiltrosTabs` (já existe)

Sem teste automatizado — é uma tela (Client Component apresentacional + orquestração de estado local), mesmo padrão de `PessoasFiltro.tsx`/`DemandasFiltro.tsx`, que também não têm teste.

**Nota importante:** diferente de `PessoasFiltro.tsx`/`DemandasFiltro.tsx` (Server Components — filtram via GET nativo e exportam via link `<a>`), este componente precisa ser `'use client'`, porque tem três pedaços de estado local: o filtro de área (multi-select, pílulas clicáveis — mesmo padrão de `GerarLinkForm.tsx`), a seleção de candidatos via checkbox, e o dialog de confirmação de exportação (com o campo de responsável aparecendo condicionalmente).

O filtro de área é submetido via GET como **uma única string separada por vírgula** (`?areaIds=id1,id2`), mesmo padrão já usado em `gerar-link-cadastro.ts` pro parâmetro `segmentos` — não múltiplos parâmetros repetidos, pra manter o tipo de `searchParams` consistente com o resto do projeto (`Record<string, string | undefined>`).

- [ ] **Step 1: Criar `src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Pagination from '@/components/admin/Pagination'
import { corTextoContraste } from '@/lib/cor-contraste'

type TalentoLinha = {
  pessoaId: string
  prioridade: number
  isPcd: boolean
  curriculoUrl: string | null
  pessoa: { nome: string; regiao: { nome: string } | null }
  areas: { area: { nome: string } }[]
}

type Mobilizador = { id: string; nome: string }

export default function BancoTalentosFiltro({
  baseHref,
  exportarHref,
  searchParams,
  talentos,
  totalFiltrado,
  paginaAtual,
  tamanhoPagina,
  areas,
  regioes,
  mobilizadores,
  corPrimaria,
}: {
  baseHref: string
  exportarHref: string
  searchParams: Record<string, string | undefined>
  talentos: TalentoLinha[]
  totalFiltrado: number
  paginaAtual: number
  tamanhoPagina: number
  areas: { id: string; nome: string }[]
  regioes: { id: string; nome: string }[]
  mobilizadores: Mobilizador[]
  corPrimaria: string
}) {
  const corTexto = corTextoContraste(corPrimaria)
  const [areasFiltro, setAreasFiltro] = useState<Set<string>>(
    new Set((searchParams.areaIds ?? '').split(',').filter(Boolean))
  )
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [dialogAberto, setDialogAberto] = useState(false)
  const [abrirDemanda, setAbrirDemanda] = useState(false)
  const [responsavelId, setResponsavelId] = useState('')

  function toggleAreaFiltro(id: string) {
    setAreasFiltro((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelecionado(pessoaId: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(pessoaId)) next.delete(pessoaId)
      else next.add(pessoaId)
      return next
    })
  }

  function toggleTodos() {
    if (selecionados.size === talentos.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(talentos.map((t) => t.pessoaId)))
    }
  }

  return (
    <div className="space-y-4">
      <form method="get" action={baseHref} className="flex flex-wrap items-end gap-3 bg-gray-50 p-4 rounded-lg">
        <input type="hidden" name="areaIds" value={Array.from(areasFiltro).join(',')} />
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Área de interesse</p>
          <div className="flex flex-wrap gap-1.5 max-w-md">
            {areas.map((a) => {
              const sel = areasFiltro.has(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAreaFiltro(a.id)}
                  style={sel ? { backgroundColor: corPrimaria, color: corTexto } : undefined}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${sel ? '' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  {a.nome}
                </button>
              )
            })}
            {areas.length === 0 && <p className="text-xs text-gray-500">Nenhuma área cadastrada.</p>}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Prioridade</label>
          <select name="prioridade" defaultValue={searchParams.prioridade ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">PcD</label>
          <select name="isPcd" defaultValue={searchParams.isPcd ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Região</label>
          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria }}
          className="text-white text-sm px-4 py-1.5 rounded-md font-medium hover:opacity-90"
        >
          Filtrar
        </button>
        <a href={baseHref} className="text-sm text-gray-500 underline px-2 py-1.5 hover:text-gray-700">
          Limpar filtro
        </a>
      </form>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} candidato(s) encontrado(s)</p>
        <button
          type="button"
          disabled={selecionados.size === 0}
          onClick={() => setDialogAberto(true)}
          style={{ backgroundColor: corPrimaria }}
          className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Exportar selecionados ({selecionados.size})
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">
                <input
                  type="checkbox"
                  checked={talentos.length > 0 && selecionados.size === talentos.length}
                  onChange={toggleTodos}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">Região</th>
              <th className="py-2 pr-3">Áreas</th>
              <th className="py-2 pr-3">Prioridade</th>
              <th className="py-2 pr-3">PcD</th>
              <th className="py-2 pr-3">Currículo</th>
            </tr>
          </thead>
          <tbody>
            {talentos.map((t) => (
              <tr key={t.pessoaId} className="border-b border-gray-100">
                <td className="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={selecionados.has(t.pessoaId)}
                    onChange={() => toggleSelecionado(t.pessoaId)}
                    aria-label={`Selecionar ${t.pessoa.nome}`}
                  />
                </td>
                <td className="py-2 pr-3">{t.pessoa.nome}</td>
                <td className="py-2 pr-3">{t.pessoa.regiao?.nome ?? '—'}</td>
                <td className="py-2 pr-3">{t.areas.map((a) => a.area.nome).join(', ') || '—'}</td>
                <td className="py-2 pr-3">{t.prioridade}</td>
                <td className="py-2 pr-3">{t.isPcd ? 'Sim' : 'Não'}</td>
                <td className="py-2 pr-3">
                  <a
                    href={t.curriculoUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: corPrimaria }}
                  >
                    Ver
                  </a>
                </td>
              </tr>
            ))}
            {talentos.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-400">Nenhum candidato encontrado com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItens={totalFiltrado}
        paginaAtual={paginaAtual}
        tamanhoPagina={tamanhoPagina}
        baseUrl={baseHref}
        searchParams={searchParams}
        corPrimaria={corPrimaria}
      />

      {dialogAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Exportar currículos</h2>
            <p className="text-sm text-gray-600">{selecionados.size} selecionado(s).</p>
            <div>
              <p className="text-sm text-gray-700 mb-2">Abrir demanda de acompanhamento de encaminhamento pra cada um?</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="abrirDemandaRadio" checked={!abrirDemanda} onChange={() => setAbrirDemanda(false)} />
                  Não
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="abrirDemandaRadio" checked={abrirDemanda} onChange={() => setAbrirDemanda(true)} />
                  Sim
                </label>
              </div>
            </div>
            {abrirDemanda && (
              <div>
                <label className="block text-xs font-medium text-gray-600">Responsável</label>
                <select
                  value={responsavelId}
                  onChange={(e) => setResponsavelId(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {mobilizadores.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            )}
            <form method="post" action={exportarHref}>
              {Array.from(selecionados).map((id) => (
                <input key={id} type="hidden" name="pessoaId" value={id} />
              ))}
              {abrirDemanda && <input type="hidden" name="abrirDemanda" value="sim" />}
              {abrirDemanda && <input type="hidden" name="responsavelId" value={responsavelId} />}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDialogAberto(false)} className="text-sm text-gray-500 hover:underline">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={abrirDemanda && !responsavelId}
                  style={{ backgroundColor: corPrimaria, color: corTexto }}
                  className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  Confirmar e baixar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/app/[slug]/admin/filtros/banco-talentos/page.tsx`**

```tsx
// src/app/[slug]/admin/filtros/banco-talentos/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWhereBancoTalentos, type FiltrosBancoTalentosParams } from '@/lib/filtros-banco-talentos'
import FiltrosTabs from '../FiltrosTabs'
import BancoTalentosFiltro from '../BancoTalentosFiltro'

const TAMANHO_PAGINA = 20

export default async function AdminFiltrosBancoTalentosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const filtros: FiltrosBancoTalentosParams = {
    areaIds: searchParams.areaIds ? searchParams.areaIds.split(',').filter(Boolean) : undefined,
    prioridade: searchParams.prioridade,
    isPcd: searchParams.isPcd === 'sim' || searchParams.isPcd === 'nao' ? searchParams.isPcd : undefined,
    regiaoId: searchParams.regiaoId,
  }

  const where = buildWhereBancoTalentos(gabinete.id, filtros)
  const paginaBruta = Number(searchParams.page ?? 1)
  const pagina = Number.isFinite(paginaBruta) ? Math.max(1, Math.floor(paginaBruta)) : 1
  const skip = (pagina - 1) * TAMANHO_PAGINA
  const take = TAMANHO_PAGINA

  const [talentosPagina, totalFiltrado, areas, regioes, mobilizadores] = await Promise.all([
    prisma.bancoTalentos.findMany({
      where,
      orderBy: { pessoa: { nome: 'asc' } },
      skip,
      take,
      select: {
        pessoaId: true,
        prioridade: true,
        isPcd: true,
        curriculoUrl: true,
        pessoa: { select: { nome: true, regiao: { select: { nome: true } } } },
        areas: { select: { area: { select: { nome: true } } } },
      },
    }),
    prisma.bancoTalentos.count({ where }),
    prisma.areaColocacao.findMany({ where: { gabineteId: gabinete.id, status: 'ativa' }, orderBy: { nome: 'asc' } }),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true, deletedAt: null },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Filtros</h1>
        <p className="text-sm text-gray-600 mt-1">Filtre e exporte os dados do sistema.</p>
      </div>
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/admin/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/admin/filtros/demandas` },
          { chave: 'banco-talentos', label: 'Banco de Talentos', href: `/${params.slug}/admin/filtros/banco-talentos` },
        ]}
        abaAtiva="banco-talentos"
        corPrimaria={gabinete.corPrimaria}
      />
      <BancoTalentosFiltro
        baseHref={`/${params.slug}/admin/filtros/banco-talentos`}
        exportarHref={`/api/${params.slug}/filtros/banco-talentos/exportar`}
        searchParams={searchParams}
        talentos={talentosPagina}
        totalFiltrado={totalFiltrado}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        areas={areas}
        regioes={regioes}
        mobilizadores={mobilizadores}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
```

- [ ] **Step 3: Adicionar `href` na aba "Banco de Talentos" em `src/app/[slug]/admin/filtros/page.tsx`**

Troque:

```tsx
          { chave: 'banco-talentos', label: 'Banco de Talentos' },
```

por:

```tsx
          { chave: 'banco-talentos', label: 'Banco de Talentos', href: `/${params.slug}/admin/filtros/banco-talentos` },
```

- [ ] **Step 4: Adicionar o mesmo `href` em `src/app/[slug]/admin/filtros/demandas/page.tsx`**

Troque (é a mesma linha, no shell de abas dessa página):

```tsx
          { chave: 'banco-talentos', label: 'Banco de Talentos' },
```

por:

```tsx
          { chave: 'banco-talentos', label: 'Banco de Talentos', href: `/${params.slug}/admin/filtros/banco-talentos` },
```

- [ ] **Step 5: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 6: Verificação manual**

Suba o servidor de dev (`npm run dev`), acesse `/[slug]/admin/filtros`, confirme que a aba "Banco de Talentos" agora é clicável (deixou de ser "Em breve") e leva pra `/[slug]/admin/filtros/banco-talentos` — confirme o mesmo a partir da aba Demandas também (já que as duas páginas têm o shell de abas). Confirme que a lista carrega só candidatos com currículo e não colocados. Teste os 4 filtros isoladamente e combinados, incluindo o multi-select de área (pílulas clicáveis). Marque alguns checkboxes, confirme que "Exportar selecionados (N)" atualiza a contagem e fica desabilitado com 0 selecionados. Clique em exportar, confirme que o dialog abre mostrando a contagem, que escolher "Sim" revela o seletor de responsável, e que o botão "Confirmar e baixar" fica desabilitado até escolher um responsável quando "Sim" está marcado. Não precisa testar o clique final de "Confirmar e baixar" nesta task — a rota só é criada na Task 4, então vai dar 404, o que é esperado; documente isso no relatório.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx" \
  "src/app/[slug]/admin/filtros/banco-talentos/page.tsx" \
  "src/app/[slug]/admin/filtros/page.tsx" \
  "src/app/[slug]/admin/filtros/demandas/page.tsx"
git commit -m "feat: aba Banco de Talentos na Central de Filtros do admin"
```

---

### Task 4: Rota de exportação — `POST /api/[slug]/filtros/banco-talentos/exportar`

**Files:**
- Create: `src/app/api/[slug]/filtros/banco-talentos/exportar/route.ts`

**Interfaces:**
- Consumes: `garantirAreaEmprego` (Task 2); `assertAdminAccess` (já existe); `enviarEmail`, `templateDemandaAtribuida` de `@/lib/email` (já existem); `getAppUrl` de `@/lib/app-url` (já existe)

Sem teste automatizado — mesmo padrão das outras rotas de exportação (depende de Storage/request/auth reais, difícil de unit-testar; a lógica testável, `buildWhereBancoTalentos`, já está coberta na Task 1).

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/api/[slug]/filtros/banco-talentos/exportar/route.ts
import JSZip from 'jszip'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { enviarEmail, templateDemandaAtribuida } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
import { garantirAreaEmprego } from '@/lib/garantir-area-emprego'

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  let gabineteId: string
  let userId: string

  try {
    const { session, gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
    userId = session.user.id
  } catch {
    return new NextResponse('Não autorizado', { status: 403 })
  }

  const formData = await request.formData()
  const pessoaIds = formData.getAll('pessoaId').map(String)
  const abrirDemanda = formData.get('abrirDemanda') === 'sim'
  const responsavelId = formData.get('responsavelId') as string | null

  if (pessoaIds.length === 0) {
    return new NextResponse('Nenhum candidato selecionado', { status: 400 })
  }

  // Revalida contra o gabinete — IDs de outro tenant (form adulterado) somem
  // silenciosamente da lista, nunca causam erro nem vazam dado.
  const pessoas = await prisma.pessoa.findMany({
    where: { id: { in: pessoaIds }, gabineteId },
    select: {
      id: true,
      nome: true,
      bancoTalentos: { select: { curriculoUrl: true } },
    },
  })

  if (abrirDemanda) {
    if (!responsavelId) return new NextResponse('Responsável obrigatório', { status: 400 })

    const responsavel = await prisma.pessoa.findFirst({
      where: { id: responsavelId, gabineteId, isMobilizador: true, isColaborador: true },
      select: { id: true, nome: true, email: true },
    })
    if (!responsavel) return new NextResponse('Responsável inválido', { status: 400 })

    const autorPessoa = await prisma.pessoa.findFirst({
      where: { userId, gabineteId },
      select: { id: true },
    })
    if (!autorPessoa) return new NextResponse('Não foi possível identificar o autor', { status: 400 })

    const areaEmpregoId = await garantirAreaEmprego(gabineteId)
    const config = await prisma.configuracaoSistema.findUnique({ where: { gabineteId } })
    const horasPrazo = config?.prazoDemandasHoras ?? 72
    const prazoDesfecho = new Date(Date.now() + horasPrazo * 60 * 60 * 1000)
    const appUrl = getAppUrl()

    for (const p of pessoas) {
      const titulo = `Acompanhamento de encaminhamento — ${p.nome}`
      const demanda = await prisma.demanda.create({
        data: {
          gabineteId,
          titulo,
          descricao: 'Encaminhamento gerado a partir do Banco de Talentos.',
          solicitanteId: p.id,
          responsavelId,
          areaId: areaEmpregoId,
          prazoDesfecho,
          criadoPorId: autorPessoa.id,
          historico: {
            create: { tipo: 'criacao', descricao: 'Demanda criada', autorId: autorPessoa.id },
          },
        },
      })

      if (responsavel.email) {
        try {
          await enviarEmail({
            para: responsavel.email,
            assunto: `Nova demanda atribuída: ${titulo}`,
            html: templateDemandaAtribuida({
              nomeResponsavel: responsavel.nome,
              tituloDemanda: titulo,
              nomeSolicitante: p.nome,
              prazo: prazoDesfecho,
              urlDemanda: `${appUrl}/${params.slug}/mobilizador/demandas/${demanda.id}`,
            }),
          })
        } catch {
          // falha no email não bloqueia a criação da demanda
        }
      }
    }
  }

  const zip = new JSZip()
  for (const p of pessoas) {
    const url = p.bancoTalentos?.curriculoUrl
    if (!url) continue
    const resposta = await fetch(url)
    if (!resposta.ok) continue
    const buffer = Buffer.from(await resposta.arrayBuffer())
    const extensao = url.split('.').pop()?.split('?')[0] ?? 'pdf'
    const nomeArquivo = `${p.nome.replace(/\s+/g, '_')}.${extensao}`
    zip.file(nomeArquivo, buffer)
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  const hoje = new Date()
  const dataFormatada = `${String(hoje.getDate()).padStart(2, '0')}_${String(hoje.getMonth() + 1).padStart(2, '0')}_${hoje.getFullYear()}`

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="curriculos_${dataFormatada}.zip"`,
    },
  })
}
```

- [ ] **Step 2: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros — **este é o passo mais importante desta task**, mesma lição das sessões anteriores (ESLint só é pego pelo build completo).

- [ ] **Step 3: Rodar a suíte de testes inteira**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: mesmas 2 falhas pré-existentes em `email.test.ts` (RESEND_API_KEY ausente), nenhuma nova falha. Confirme que os 14 testes da Task 1 (`filtros-banco-talentos.test.ts`) aparecem passando.

- [ ] **Step 4: Verificação manual**

Com um gabinete de teste que tenha ao menos 2-3 pessoas no Banco de Talentos com currículo anexado:
1. Selecione alguns candidatos, clique em "Exportar selecionados", escolha "Não" (sem demanda), confirme — o ZIP deve baixar com os currículos dentro (abra e confira).
2. Repita escolhendo "Sim", selecione um responsável válido (mobilizador colaborador), confirme — confira que uma `Demanda` foi criada por pessoa selecionada (acesse `/[slug]/admin/demandas` e filtre por área "Emprego" pra ver), que a área "Emprego" foi criada automaticamente se não existia, e que o ZIP baixou normalmente depois.
3. Rode de novo o fluxo "Sim" e confirme que a área "Emprego" **não** é duplicada (o `garantirAreaEmprego` deve reaproveitar a mesma).
4. Tente submeter o form com um `pessoaId` de outro gabinete (adulterando manualmente, se praticável) e confirme que ele não aparece no resultado nem gera erro.

Se não for possível testar via clique real de browser (sessão real necessária), documente a verificação feita via consulta direta ao banco (mesmo nível de rigor já usado nas rotas de exportação anteriores) e via checagem estática do código — não bloqueie a task por isso, mas seja explícito no relatório sobre o que foi ou não exercitado de fato.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/[slug]/filtros/banco-talentos/exportar/route.ts"
git commit -m "feat: rota de exportação de Banco de Talentos em ZIP, com encaminhamento opcional"
```
