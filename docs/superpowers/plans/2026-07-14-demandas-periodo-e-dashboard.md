# Central de Filtros — aba Demandas: filtro de período + Visualizar Dados Gerais — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar filtro de período (data de criação) à aba Demandas da Central de Filtros e um botão "Visualizar Dados Gerais" que leva ao Dashboard mostrando os dados agregados dos **solicitantes** das demandas filtradas (área/status/período/região).

**Architecture:** Reaproveita `buildWhereDemandas` (já existe) tanto pro filtro da própria aba Demandas quanto — de forma aninhada, via `pessoa.demandasSolicitadas.some({...})` — pra restringir a população do Dashboard a "quem tem pelo menos uma demanda batendo esse filtro". Sem nova tabela, sem consulta separada de ids: um único filtro relacional do Prisma.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5 (strict) + Prisma 7.8 + Vitest.

## Global Constraints

- O filtro de período na aba Demandas filtra pela **data de criação** da demanda (`criadoEm`), não pela data em que foi marcada como atendida — decisão do usuário, não há campo de data de atendimento consultável no schema hoje.
- O botão "Visualizar Dados Gerais" na aba Demandas aparece **sempre**, mesmo sem nenhum filtro ativo — diferente do botão equivalente da aba Pessoas, que só aparece com filtro ativo.
- `regiaoId` na aba Demandas continua com o mesmo significado e mecanismo que já existe hoje (filtro direto em `wherePessoas.regiaoId`) — nenhuma mudança nesse campo específico.
- As três origens de população do Dashboard (filtros de Pessoas, rede de um mobilizador via `redeDeId`, solicitantes de Demandas via `filtroDemandas`) são mutuamente exclusivas na prática — nenhuma delas precisa de código para resolver conflito com as outras.
- Este projeto não escreve teste automatizado para código que depende de Prisma/DB ou para componentes visuais (convenção já estabelecida) — só funções puras (sem `prisma`, sem `fetch`) ganham teste TDD.

---

### Task 1: `src/lib/filtros-demandas.ts` — filtro de período (`dataInicio`/`dataFim`)

**Files:**
- Modify: `src/lib/filtros-demandas.ts`
- Test: `src/lib/__tests__/filtros-demandas.test.ts`

**Interfaces:**
- Produces: `FiltrosDemandasParams.dataInicio?: string`, `FiltrosDemandasParams.dataFim?: string` (strings `YYYY-MM-DD`), `WhereDemandas.criadoEm?: { gte?: Date; lte?: Date }` — usados por `DemandasFiltro.tsx` (Task 4), as páginas de filtros (Task 5), a rota de exportação (Task 6) e os dashboards (Tasks 8/9).

- [ ] **Step 1: Escrever os testes**

No arquivo `src/lib/__tests__/filtros-demandas.test.ts`, localize o teste `'combina todos os filtros ao mesmo tempo'` perto do final do arquivo (é o último `it(...)` antes do `})` que fecha o `describe`). Adicione os quatro testes abaixo **imediatamente antes** dele (mesma indentação, mesmo nível):

```ts
  it('filtra por data de início (criadoEm gte)', () => {
    const where = buildWhereDemandas('gab-1', { dataInicio: '2025-01-01' })
    expect(where.criadoEm).toEqual({ gte: new Date('2025-01-01T00:00:00') })
  })

  it('filtra por data de fim (criadoEm lte)', () => {
    const where = buildWhereDemandas('gab-1', { dataFim: '2025-01-31' })
    expect(where.criadoEm).toEqual({ lte: new Date('2025-01-31T23:59:59.999') })
  })

  it('combina data de início e fim', () => {
    const where = buildWhereDemandas('gab-1', { dataInicio: '2025-01-01', dataFim: '2025-01-31' })
    expect(where.criadoEm).toEqual({
      gte: new Date('2025-01-01T00:00:00'),
      lte: new Date('2025-01-31T23:59:59.999'),
    })
  })

  it('sem data de início nem fim, não aplica criadoEm', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.criadoEm).toBeUndefined()
  })

```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/filtros-demandas.test.ts`
Expected: FAIL nos 3 primeiros novos testes (`where.criadoEm` é `undefined`, não bate com o `toEqual` esperado). O quarto (`sem data...`) já passa hoje (nenhuma mudança ainda necessária pra ele, mas não custa rodar junto).

- [ ] **Step 3: Implementar em `filtros-demandas.ts`**

Arquivo completo atual:

```ts
export type FiltrosDemandasParams = {
  areaId?: string
  status?: 'atendida' | 'nao_atendida' | 'pendente'
  regiaoId?: string
}

export type WhereDemandas = {
  gabineteId: string
  deletedAt: null
  responsavelId?: string
  areaId?: string
  status?: string | { in: string[] }
  solicitante?: { regiaoId: string }
}

export function buildWhereDemandas(
  gabineteId: string,
  params: FiltrosDemandasParams,
  responsavelId?: string
): WhereDemandas {
  const where: WhereDemandas = {
    gabineteId,
    deletedAt: null,
  }
  if (responsavelId) where.responsavelId = responsavelId
  if (params.areaId) where.areaId = params.areaId
  if (params.status === 'atendida' || params.status === 'nao_atendida') {
    where.status = params.status
  } else if (params.status === 'pendente') {
    where.status = { in: ['aberta', 'expirada'] }
  }
  if (params.regiaoId) where.solicitante = { regiaoId: params.regiaoId }
  return where
}
```

Substitua por:

```ts
export type FiltrosDemandasParams = {
  areaId?: string
  status?: 'atendida' | 'nao_atendida' | 'pendente'
  regiaoId?: string
  dataInicio?: string
  dataFim?: string
}

export type WhereDemandas = {
  gabineteId: string
  deletedAt: null
  responsavelId?: string
  areaId?: string
  status?: string | { in: string[] }
  solicitante?: { regiaoId: string }
  criadoEm?: { gte?: Date; lte?: Date }
}

export function buildWhereDemandas(
  gabineteId: string,
  params: FiltrosDemandasParams,
  responsavelId?: string
): WhereDemandas {
  const where: WhereDemandas = {
    gabineteId,
    deletedAt: null,
  }
  if (responsavelId) where.responsavelId = responsavelId
  if (params.areaId) where.areaId = params.areaId
  if (params.status === 'atendida' || params.status === 'nao_atendida') {
    where.status = params.status
  } else if (params.status === 'pendente') {
    where.status = { in: ['aberta', 'expirada'] }
  }
  if (params.regiaoId) where.solicitante = { regiaoId: params.regiaoId }
  if (params.dataInicio || params.dataFim) {
    where.criadoEm = {}
    if (params.dataInicio) where.criadoEm.gte = new Date(`${params.dataInicio}T00:00:00`)
    if (params.dataFim) where.criadoEm.lte = new Date(`${params.dataFim}T23:59:59.999`)
  }
  return where
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/filtros-demandas.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 4 novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/filtros-demandas.ts src/lib/__tests__/filtros-demandas.test.ts
git commit -m "feat: adiciona filtro de periodo (dataInicio/dataFim) a buildWhereDemandas"
```

---

### Task 2: `src/lib/filtros-pessoas.ts` — parâmetro `filtroDemandas`

**Files:**
- Modify: `src/lib/filtros-pessoas.ts`
- Test: `src/lib/__tests__/filtros-pessoas.test.ts`

**Interfaces:**
- Consumes: `WhereDemandas` (Task 1, `./filtros-demandas`).
- Produces: `buildWherePessoas(gabineteId, params, idsRede?, filtroDemandas?): WherePessoas` (4º parâmetro novo) — usado pelos dashboards (Tasks 8/9).

- [ ] **Step 1: Escrever os testes**

No arquivo `src/lib/__tests__/filtros-pessoas.test.ts`, adicione o import no topo (linha 1-2 atuais):

```ts
import { describe, it, expect } from 'vitest'
import { buildWherePessoas, aplicarFiltrosPosConsulta } from '../filtros-pessoas'
```

Vira:

```ts
import { describe, it, expect } from 'vitest'
import { buildWherePessoas, aplicarFiltrosPosConsulta } from '../filtros-pessoas'
import type { WhereDemandas } from '../filtros-demandas'
```

Logo depois do teste `'não filtra por id quando idsRede não é passado (escopo admin)'` (por volta da linha 16-19 atuais), adicione:

```ts

  it('adiciona filtro relacional de demandasSolicitadas quando filtroDemandas é passado', () => {
    const filtroDemandas: WhereDemandas = { gabineteId: 'gab-1', deletedAt: null, status: 'atendida' }
    const where = buildWherePessoas('gab-1', {}, undefined, filtroDemandas)
    expect(where.demandasSolicitadas).toEqual({ some: filtroDemandas })
  })

  it('não filtra por demandasSolicitadas quando filtroDemandas não é passado', () => {
    const where = buildWherePessoas('gab-1', {})
    expect(where.demandasSolicitadas).toBeUndefined()
  })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/filtros-pessoas.test.ts`
Expected: FAIL — `where.demandasSolicitadas` é `undefined` no primeiro teste novo (o `toEqual` não bate); o segundo já passa (nada a fazer ainda o deixaria falhar, mas roda junto).

- [ ] **Step 3: Implementar em `filtros-pessoas.ts`**

No topo do arquivo (linha 1 atual):

```ts
import { estaNoIntervaloAniversario, calcularIdade } from './aniversario'
```

Vira:

```ts
import { estaNoIntervaloAniversario, calcularIdade } from './aniversario'
import type { WhereDemandas } from './filtros-demandas'
```

O tipo `WherePessoas` (bloco atual):

```ts
export type WherePessoas = {
  gabineteId: string
  deletedAt: null
  id?: { in: string[] }
  genero?: string
  regiaoId?: string
  profissaoId?: string
  segmentos?: { some: { segmentoId: string } }
  nascimento?: { not: null }
  escolaridade?: string
  religiao?: string
}
```

Vira:

```ts
export type WherePessoas = {
  gabineteId: string
  deletedAt: null
  id?: { in: string[] }
  genero?: string
  regiaoId?: string
  profissaoId?: string
  segmentos?: { some: { segmentoId: string } }
  nascimento?: { not: null }
  escolaridade?: string
  religiao?: string
  demandasSolicitadas?: { some: WhereDemandas }
}
```

A função `buildWherePessoas` (assinatura + corpo atuais):

```ts
export function buildWherePessoas(
  gabineteId: string,
  params: FiltrosPessoasParams,
  idsRede?: string[]
): WherePessoas {
  const where: WherePessoas = {
    gabineteId,
    deletedAt: null,
  }
  if (idsRede) where.id = { in: idsRede }
  if (params.genero) where.genero = params.genero
  if (params.regiaoId) where.regiaoId = params.regiaoId
  if (params.profissaoId) where.profissaoId = params.profissaoId
  if (params.segmentoId) where.segmentos = { some: { segmentoId: params.segmentoId } }
  if (params.aniversario || params.idadeMin || params.idadeMax) {
    where.nascimento = { not: null }
  }
  if (params.escolaridade) where.escolaridade = params.escolaridade
  if (params.religiao) where.religiao = params.religiao
  return where
}
```

Vira:

```ts
export function buildWherePessoas(
  gabineteId: string,
  params: FiltrosPessoasParams,
  idsRede?: string[],
  filtroDemandas?: WhereDemandas
): WherePessoas {
  const where: WherePessoas = {
    gabineteId,
    deletedAt: null,
  }
  if (idsRede) where.id = { in: idsRede }
  if (params.genero) where.genero = params.genero
  if (params.regiaoId) where.regiaoId = params.regiaoId
  if (params.profissaoId) where.profissaoId = params.profissaoId
  if (params.segmentoId) where.segmentos = { some: { segmentoId: params.segmentoId } }
  if (params.aniversario || params.idadeMin || params.idadeMax) {
    where.nascimento = { not: null }
  }
  if (params.escolaridade) where.escolaridade = params.escolaridade
  if (params.religiao) where.religiao = params.religiao
  if (filtroDemandas) where.demandasSolicitadas = { some: filtroDemandas }
  return where
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/filtros-pessoas.test.ts`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/filtros-pessoas.ts src/lib/__tests__/filtros-pessoas.test.ts
git commit -m "feat: buildWherePessoas aceita filtroDemandas (demandasSolicitadas relacional)"
```

---

### Task 3: `filtros-ativos.ts` (`CAMPOS_FILTRO_DEMANDAS`) + `VisualizarDadosGeraisDemandasButton`

**Files:**
- Modify: `src/lib/filtros-ativos.ts`
- Test: `src/lib/__tests__/filtros-ativos.test.ts`
- Create: `src/components/admin/VisualizarDadosGeraisDemandasButton.tsx`

**Interfaces:**
- Produces: `CAMPOS_FILTRO_DEMANDAS: readonly string[]` (5 campos) — usado pelo botão deste task e pelo Dashboard (Task 7, "Limpar tudo").
- Produces: componente `VisualizarDadosGeraisDemandasButton` (default export) — usado por `DemandasFiltro.tsx` (Task 4).

- [ ] **Step 1: Escrever o teste**

No arquivo `src/lib/__tests__/filtros-ativos.test.ts`, atualize o import (linha 2 atual):

```ts
import { temFiltroAtivo, CAMPOS_FILTRO_PESSOAS } from '../filtros-ativos'
```

Vira:

```ts
import { temFiltroAtivo, CAMPOS_FILTRO_PESSOAS, CAMPOS_FILTRO_DEMANDAS } from '../filtros-ativos'
```

No final do arquivo, depois do bloco `describe('CAMPOS_FILTRO_PESSOAS', ...)`, adicione:

```ts

describe('CAMPOS_FILTRO_DEMANDAS', () => {
  it('inclui exatamente os 5 campos esperados', () => {
    expect([...CAMPOS_FILTRO_DEMANDAS].sort()).toEqual(
      ['areaId', 'dataFim', 'dataInicio', 'regiaoId', 'status'].sort()
    )
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/__tests__/filtros-ativos.test.ts`
Expected: FAIL — `Cannot find export 'CAMPOS_FILTRO_DEMANDAS'` (ou `undefined` no spread).

- [ ] **Step 3: Adicionar a constante em `filtros-ativos.ts`**

Ao final do arquivo `src/lib/filtros-ativos.ts` (depois de `temFiltroAtivo`), adicione:

```ts

export const CAMPOS_FILTRO_DEMANDAS = ['areaId', 'status', 'regiaoId', 'dataInicio', 'dataFim'] as const
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/__tests__/filtros-ativos.test.ts`
Expected: PASS (9 testes — 8 já existentes + o novo).

- [ ] **Step 5: Criar o componente do botão**

Crie `src/components/admin/VisualizarDadosGeraisDemandasButton.tsx`:

```tsx
import { CAMPOS_FILTRO_DEMANDAS } from '@/lib/filtros-ativos'

export default function VisualizarDadosGeraisDemandasButton({
  dashboardHref,
  searchParams,
  corPrimaria,
}: {
  dashboardHref: string
  searchParams: Record<string, string | undefined>
  corPrimaria: string
}) {
  const qs = new URLSearchParams()
  qs.set('filtroDemandas', '1')
  for (const campo of CAMPOS_FILTRO_DEMANDAS) {
    const valor = searchParams[campo]
    if (valor) qs.set(campo, valor)
  }

  return (
    <a
      href={`${dashboardHref}?${qs.toString()}`}
      style={{ backgroundColor: corPrimaria }}
      className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
    >
      Visualizar Dados Gerais
    </a>
  )
}
```

Diferença chave em relação ao `VisualizarDadosGeraisButton.tsx` (aba Pessoas): **sem** o gate de
`temFiltroAtivo` — este botão sempre renderiza, e sempre define `filtroDemandas=1` na URL de
destino, mesmo quando nenhum dos 5 campos de `CAMPOS_FILTRO_DEMANDAS` está presente na origem.

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/lib/filtros-ativos.ts src/lib/__tests__/filtros-ativos.test.ts src/components/admin/VisualizarDadosGeraisDemandasButton.tsx
git commit -m "feat: adiciona CAMPOS_FILTRO_DEMANDAS e VisualizarDadosGeraisDemandasButton"
```

---

### Task 4: `DemandasFiltro.tsx` — botão + campos de período

**Files:**
- Modify: `src/app/[slug]/admin/filtros/DemandasFiltro.tsx`

**Interfaces:**
- Consumes: `VisualizarDadosGeraisDemandasButton` (Task 3).

- [ ] **Step 1: Import**

Topo do arquivo (linhas 1-3 atuais):

```tsx
// src/app/[slug]/admin/filtros/DemandasFiltro.tsx
import Pagination from '@/components/admin/Pagination'
import { statusDemandaPill } from '@/lib/status-demanda'
```

Vira:

```tsx
// src/app/[slug]/admin/filtros/DemandasFiltro.tsx
import Pagination from '@/components/admin/Pagination'
import VisualizarDadosGeraisDemandasButton from '@/components/admin/VisualizarDadosGeraisDemandasButton'
import { statusDemandaPill } from '@/lib/status-demanda'
```

- [ ] **Step 2: Novo prop `dashboardHref`**

Assinatura da função (bloco atual):

```tsx
export default function DemandasFiltro({
  baseHref,
  exportarHref,
  searchParams,
  demandas,
  totalFiltrado,
  paginaAtual,
  tamanhoPagina,
  areas,
  regioes,
  corPrimaria,
}: {
  baseHref: string
  exportarHref: string
  searchParams: Record<string, string | undefined>
  demandas: DemandaLinha[]
  totalFiltrado: number
  paginaAtual: number
  tamanhoPagina: number
  areas: { id: string; nome: string }[]
  regioes: { id: string; nome: string }[]
  corPrimaria: string
}) {
```

Vira:

```tsx
export default function DemandasFiltro({
  baseHref,
  dashboardHref,
  exportarHref,
  searchParams,
  demandas,
  totalFiltrado,
  paginaAtual,
  tamanhoPagina,
  areas,
  regioes,
  corPrimaria,
}: {
  baseHref: string
  dashboardHref: string
  exportarHref: string
  searchParams: Record<string, string | undefined>
  demandas: DemandaLinha[]
  totalFiltrado: number
  paginaAtual: number
  tamanhoPagina: number
  areas: { id: string; nome: string }[]
  regioes: { id: string; nome: string }[]
  corPrimaria: string
}) {
```

- [ ] **Step 3: Campos de data no formulário**

O bloco do select de Região (atual):

```tsx
        <div>
          <label className="block text-xs font-medium text-gray-600">Região</label>
          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
```

Vira (adiciona os dois campos de data logo depois):

```tsx
        <div>
          <label className="block text-xs font-medium text-gray-600">Região</label>
          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Data início</label>
          <input type="date" name="dataInicio" defaultValue={searchParams.dataInicio ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Data fim</label>
          <input type="date" name="dataFim" defaultValue={searchParams.dataFim ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
```

- [ ] **Step 4: Botão "Visualizar Dados Gerais"**

O bloco dos botões de exportar (atual):

```tsx
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} demanda(s) encontrada(s)</p>
        <div className="flex gap-2">
          <a
            href={`${exportarHref}?${queryAtual}${separador}formato=pdf`}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Exportar PDF
          </a>
          <a
            href={`${exportarHref}?${queryAtual}${separador}formato=excel`}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Exportar Excel
          </a>
        </div>
      </div>
```

Vira:

```tsx
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} demanda(s) encontrada(s)</p>
        <div className="flex gap-2">
          <VisualizarDadosGeraisDemandasButton dashboardHref={dashboardHref} searchParams={searchParams} corPrimaria={corPrimaria} />
          <a
            href={`${exportarHref}?${queryAtual}${separador}formato=pdf`}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Exportar PDF
          </a>
          <a
            href={`${exportarHref}?${queryAtual}${separador}formato=excel`}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Exportar Excel
          </a>
        </div>
      </div>
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/filtros/DemandasFiltro.tsx"
git commit -m "feat: DemandasFiltro ganha campos de periodo e botao Visualizar Dados Gerais"
```

---

### Task 5: Páginas de filtros de Demandas (admin + mobilizador) — período + `dashboardHref`

**Files:**
- Modify: `src/app/[slug]/admin/filtros/demandas/page.tsx`
- Modify: `src/app/[slug]/mobilizador/filtros/demandas/page.tsx`

**Interfaces:**
- Consumes: `FiltrosDemandasParams.dataInicio`/`dataFim` (Task 1), `DemandasFiltro` com `dashboardHref` (Task 4).

- [ ] **Step 1: `admin/filtros/demandas/page.tsx` — período**

Bloco atual:

```ts
  const filtros: FiltrosDemandasParams = {
    areaId: searchParams.areaId,
    status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
    regiaoId: searchParams.regiaoId,
  }
```

Vira:

```ts
  const filtros: FiltrosDemandasParams = {
    areaId: searchParams.areaId,
    status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
    regiaoId: searchParams.regiaoId,
    dataInicio: searchParams.dataInicio,
    dataFim: searchParams.dataFim,
  }
```

- [ ] **Step 2: `admin/filtros/demandas/page.tsx` — `dashboardHref`**

Bloco atual:

```tsx
      <DemandasFiltro
        baseHref={`/${params.slug}/admin/filtros/demandas`}
        exportarHref={`/api/${params.slug}/filtros/demandas/exportar`}
        searchParams={searchParams}
        demandas={demandasPagina}
        totalFiltrado={totalFiltrado}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        areas={areas}
        regioes={regioes}
        corPrimaria={gabinete.corPrimaria}
      />
```

Vira:

```tsx
      <DemandasFiltro
        baseHref={`/${params.slug}/admin/filtros/demandas`}
        dashboardHref={`/${params.slug}/admin/dashboard`}
        exportarHref={`/api/${params.slug}/filtros/demandas/exportar`}
        searchParams={searchParams}
        demandas={demandasPagina}
        totalFiltrado={totalFiltrado}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        areas={areas}
        regioes={regioes}
        corPrimaria={gabinete.corPrimaria}
      />
```

- [ ] **Step 3: `mobilizador/filtros/demandas/page.tsx` — período**

Bloco atual:

```ts
  const filtros: FiltrosDemandasParams = {
    areaId: searchParams.areaId,
    status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
    regiaoId: searchParams.regiaoId,
  }
```

Vira:

```ts
  const filtros: FiltrosDemandasParams = {
    areaId: searchParams.areaId,
    status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
    regiaoId: searchParams.regiaoId,
    dataInicio: searchParams.dataInicio,
    dataFim: searchParams.dataFim,
  }
```

- [ ] **Step 4: `mobilizador/filtros/demandas/page.tsx` — `dashboardHref`**

Bloco atual:

```tsx
      <DemandasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros/demandas`}
        exportarHref={`/api/${params.slug}/filtros/demandas/exportar`}
        searchParams={searchParams}
        demandas={demandasPagina}
        totalFiltrado={totalFiltrado}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        areas={areas}
        regioes={regioes}
        corPrimaria={gabinete.corPrimaria}
      />
```

Vira:

```tsx
      <DemandasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros/demandas`}
        dashboardHref={`/${params.slug}/mobilizador/dashboard`}
        exportarHref={`/api/${params.slug}/filtros/demandas/exportar`}
        searchParams={searchParams}
        demandas={demandasPagina}
        totalFiltrado={totalFiltrado}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        areas={areas}
        regioes={regioes}
        corPrimaria={gabinete.corPrimaria}
      />
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/filtros/demandas/page.tsx" "src/app/[slug]/mobilizador/filtros/demandas/page.tsx"
git commit -m "feat: paginas de filtros de Demandas aplicam periodo e passam dashboardHref"
```

---

### Task 6: Rota de exportação de Demandas — período

**Files:**
- Modify: `src/app/api/[slug]/filtros/demandas/exportar/route.ts`

**Interfaces:**
- Consumes: `FiltrosDemandasParams.dataInicio`/`dataFim` (Task 1).

- [ ] **Step 1: Aplicar o filtro de período na exportação**

Bloco atual:

```ts
  const filtros: FiltrosDemandasParams = {
    areaId: sp.get('areaId') ?? undefined,
    status: (sp.get('status') as 'atendida' | 'nao_atendida' | 'pendente' | null) ?? undefined,
    regiaoId: sp.get('regiaoId') ?? undefined,
  }
```

Vira:

```ts
  const filtros: FiltrosDemandasParams = {
    areaId: sp.get('areaId') ?? undefined,
    status: (sp.get('status') as 'atendida' | 'nao_atendida' | 'pendente' | null) ?? undefined,
    regiaoId: sp.get('regiaoId') ?? undefined,
    dataInicio: sp.get('dataInicio') ?? undefined,
    dataFim: sp.get('dataFim') ?? undefined,
  }
```

Sem isso, exportar PDF/Excel com período ativo na tela ignoraria o filtro silenciosamente — o
arquivo baixado teria demandas fora do intervalo mostrado na tela.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/[slug]/filtros/demandas/exportar/route.ts"
git commit -m "feat: rota de exportacao de Demandas aplica filtro de periodo"
```

---

### Task 7: `DashboardConteudo.tsx` — badge de área/status/período + `camposLimpar`

**Files:**
- Modify: `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`

**Interfaces:**
- Consumes: `CAMPOS_FILTRO_DEMANDAS` (Task 3, `@/lib/filtros-ativos`).
- Produces: novo prop opcional `areaAtiva?: { nome: string } | null` — preenchido pelas Tasks 8 e 9.

- [ ] **Step 1: Import**

Linha 9 atual:

```ts
import { CAMPOS_FILTRO_PESSOAS } from '@/lib/filtros-ativos'
```

Vira:

```ts
import { CAMPOS_FILTRO_PESSOAS, CAMPOS_FILTRO_DEMANDAS } from '@/lib/filtros-ativos'
```

- [ ] **Step 2: Novo prop `areaAtiva`**

Na desestruturação de props (bloco atual, por volta da linha 70-76):

```ts
  escolaridade,
  religiao,
  segmentoAtivo,
  profissaoAtiva,
  redeAtiva,
}: {
```

Vira:

```ts
  escolaridade,
  religiao,
  segmentoAtivo,
  profissaoAtiva,
  redeAtiva,
  areaAtiva,
}: {
```

No bloco de tipos logo abaixo (por volta da linha 100-105):

```ts
  escolaridade: ContagemChave[]
  religiao: ContagemChave[]
  segmentoAtivo?: { nome: string } | null
  profissaoAtiva?: { nome: string } | null
  redeAtiva?: { nome: string } | null
}) {
```

Vira:

```ts
  escolaridade: ContagemChave[]
  religiao: ContagemChave[]
  segmentoAtivo?: { nome: string } | null
  profissaoAtiva?: { nome: string } | null
  redeAtiva?: { nome: string } | null
  areaAtiva?: { nome: string } | null
}) {
```

- [ ] **Step 3: Badges de Demandas + tipo `camposLimpar`**

O bloco de "Filtros ativos" (atual, por volta da linha 190-216):

```ts
  // Filtros ativos (badges removíveis + "Limpar tudo")
  const GENERO_LABEL: Record<string, string> = { masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro' }
  type FiltroExibivel = { chave: string; label: string }
  const filtrosAtivosExibiveis: FiltroExibivel[] = []
  if (searchParams.regiaoId) {
    const regiaoFiltrada = regioes.find((r) => r.id === searchParams.regiaoId)
    filtrosAtivosExibiveis.push({ chave: 'regiaoId', label: `Região: ${regiaoFiltrada?.nome ?? searchParams.regiaoId}` })
  }
  if (searchParams.genero) {
    filtrosAtivosExibiveis.push({ chave: 'genero', label: `Sexo: ${GENERO_LABEL[searchParams.genero] ?? searchParams.genero}` })
  }
  if (searchParams.segmentoId) {
    filtrosAtivosExibiveis.push({ chave: 'segmentoId', label: `Segmento: ${segmentoAtivo?.nome ?? searchParams.segmentoId}` })
  }
  if (searchParams.profissaoId) {
    filtrosAtivosExibiveis.push({ chave: 'profissaoId', label: `Profissão: ${profissaoAtiva?.nome ?? searchParams.profissaoId}` })
  }
  if (searchParams.escolaridade) {
    filtrosAtivosExibiveis.push({ chave: 'escolaridade', label: `Escolaridade: ${searchParams.escolaridade}` })
  }
  if (searchParams.religiao) {
    filtrosAtivosExibiveis.push({ chave: 'religiao', label: `Religião: ${searchParams.religiao}` })
  }
  if (searchParams.redeDeId) {
    filtrosAtivosExibiveis.push({ chave: 'redeDeId', label: `Rede: ${redeAtiva?.nome ?? searchParams.redeDeId}` })
  }
```

Vira (tipo `FiltroExibivel` ganha `camposLimpar` opcional, e 3 blocos novos entram depois do de
`redeDeId`):

```ts
  // Filtros ativos (badges removíveis + "Limpar tudo")
  const GENERO_LABEL: Record<string, string> = { masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro' }
  const STATUS_DEMANDA_LABEL: Record<string, string> = { pendente: 'Pendente', atendida: 'Atendida', nao_atendida: 'Não atendida' }
  const formatarDataISOParaBR = (iso: string) => iso.split('-').reverse().join('/')
  type FiltroExibivel = { chave: string; label: string; camposLimpar?: string[] }
  const filtrosAtivosExibiveis: FiltroExibivel[] = []
  if (searchParams.regiaoId) {
    const regiaoFiltrada = regioes.find((r) => r.id === searchParams.regiaoId)
    filtrosAtivosExibiveis.push({ chave: 'regiaoId', label: `Região: ${regiaoFiltrada?.nome ?? searchParams.regiaoId}` })
  }
  if (searchParams.genero) {
    filtrosAtivosExibiveis.push({ chave: 'genero', label: `Sexo: ${GENERO_LABEL[searchParams.genero] ?? searchParams.genero}` })
  }
  if (searchParams.segmentoId) {
    filtrosAtivosExibiveis.push({ chave: 'segmentoId', label: `Segmento: ${segmentoAtivo?.nome ?? searchParams.segmentoId}` })
  }
  if (searchParams.profissaoId) {
    filtrosAtivosExibiveis.push({ chave: 'profissaoId', label: `Profissão: ${profissaoAtiva?.nome ?? searchParams.profissaoId}` })
  }
  if (searchParams.escolaridade) {
    filtrosAtivosExibiveis.push({ chave: 'escolaridade', label: `Escolaridade: ${searchParams.escolaridade}` })
  }
  if (searchParams.religiao) {
    filtrosAtivosExibiveis.push({ chave: 'religiao', label: `Religião: ${searchParams.religiao}` })
  }
  if (searchParams.redeDeId) {
    filtrosAtivosExibiveis.push({ chave: 'redeDeId', label: `Rede: ${redeAtiva?.nome ?? searchParams.redeDeId}` })
  }
  if (searchParams.filtroDemandas === '1') {
    const temSubFiltro = Boolean(searchParams.areaId || searchParams.status || searchParams.dataInicio || searchParams.dataFim)
    filtrosAtivosExibiveis.push({
      chave: 'filtroDemandas',
      label: temSubFiltro ? 'Demandas: Solicitantes filtrados' : 'Demandas: Todos os solicitantes',
      camposLimpar: ['filtroDemandas', 'areaId', 'status', 'dataInicio', 'dataFim'],
    })
  }
  if (searchParams.areaId) {
    filtrosAtivosExibiveis.push({ chave: 'areaId', label: `Área: ${areaAtiva?.nome ?? searchParams.areaId}` })
  }
  if (searchParams.status) {
    filtrosAtivosExibiveis.push({ chave: 'status', label: `Status: ${STATUS_DEMANDA_LABEL[searchParams.status] ?? searchParams.status}` })
  }
  if (searchParams.dataInicio || searchParams.dataFim) {
    const label = searchParams.dataInicio && searchParams.dataFim
      ? `Período: ${formatarDataISOParaBR(searchParams.dataInicio)} a ${formatarDataISOParaBR(searchParams.dataFim)}`
      : searchParams.dataInicio
        ? `Período: a partir de ${formatarDataISOParaBR(searchParams.dataInicio)}`
        : `Período: até ${formatarDataISOParaBR(searchParams.dataFim!)}`
    filtrosAtivosExibiveis.push({ chave: 'periodoDemanda', label, camposLimpar: ['dataInicio', 'dataFim'] })
  }
```

Note que `camposLimpar` da badge-base (`filtroDemandas`) **não inclui `regiaoId`**: região já tem
sua própria badge/`×` independente (bloco já existente, intocado), então remover a badge-base de
Demandas não deve mexer numa badge de outra origem.

- [ ] **Step 4: `×` de cada badge usa `camposLimpar` quando presente**

No JSX (bloco atual, por volta da linha 248-254):

```tsx
              <a
                href={construirHref(dashboardHref, searchParams, {}, [f.chave])}
                className="text-gray-400 hover:text-gray-700 leading-none"
                aria-label={`Remover filtro ${f.label}`}
              >
                ×
              </a>
```

Vira:

```tsx
              <a
                href={construirHref(dashboardHref, searchParams, {}, f.camposLimpar ?? [f.chave])}
                className="text-gray-400 hover:text-gray-700 leading-none"
                aria-label={`Remover filtro ${f.label}`}
              >
                ×
              </a>
```

- [ ] **Step 5: "Limpar tudo" também remove os campos de Demandas**

No JSX (bloco atual, por volta da linha 257-262):

```tsx
          <a
            href={construirHref(dashboardHref, searchParams, {}, [...CAMPOS_FILTRO_PESSOAS])}
            className="text-xs text-blue-600 hover:underline"
          >
            Limpar tudo
          </a>
```

Vira:

```tsx
          <a
            href={construirHref(dashboardHref, searchParams, {}, [...CAMPOS_FILTRO_PESSOAS, 'filtroDemandas', ...CAMPOS_FILTRO_DEMANDAS])}
            className="text-xs text-blue-600 hover:underline"
          >
            Limpar tudo
          </a>
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[slug]/admin/dashboard/DashboardConteudo.tsx"
git commit -m "feat: badges de Area/Status/Periodo de Demandas no Dashboard + Limpar tudo estendido"
```

---

### Task 8: `admin/dashboard/page.tsx` — `filtroDemandas` + resolução de nome da área

**Files:**
- Modify: `src/app/[slug]/admin/dashboard/page.tsx`

**Interfaces:**
- Consumes: `buildWhereDemandas` (Task 1, `@/lib/filtros-demandas`), `buildWherePessoas` com 4º parâmetro (Task 2), props novos de `DashboardConteudo` (Task 7).

- [ ] **Step 1: Import**

Linhas 1-7 atuais:

```ts
// src/app/[slug]/admin/dashboard/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { resolverIdsRedeDe } from '@/lib/rede'
import { DashboardConteudo } from './DashboardConteudo'
```

Vira:

```ts
// src/app/[slug]/admin/dashboard/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { buildWhereDemandas } from '@/lib/filtros-demandas'
import { resolverIdsRedeDe } from '@/lib/rede'
import { DashboardConteudo } from './DashboardConteudo'
```

- [ ] **Step 2: `filtroDemandas` resolvido antes de `wherePessoas`**

Bloco atual (linhas 61-62):

```ts
  const idsRede = await resolverIdsRedeDe(searchParams.redeDeId, gabinete.id)
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas, idsRede)
```

Vira:

```ts
  const idsRede = await resolverIdsRedeDe(searchParams.redeDeId, gabinete.id)
  const filtroDemandas = searchParams.filtroDemandas === '1'
    ? buildWhereDemandas(gabinete.id, {
        areaId: searchParams.areaId,
        status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
        dataInicio: searchParams.dataInicio,
        dataFim: searchParams.dataFim,
      })
    : undefined
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas, idsRede, filtroDemandas)
```

Sem `responsavelId` (3º argumento de `buildWhereDemandas`) — no admin, qualquer demanda do
gabinete conta, não só as de um responsável específico.

- [ ] **Step 3: Resolver nome da área ativa**

Bloco atual (linhas 64-74):

```ts
  const [segmentoAtivo, profissaoAtiva, redeAtiva] = await Promise.all([
    searchParams.segmentoId
      ? prisma.segmento.findFirst({ where: { id: searchParams.segmentoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.profissaoId
      ? prisma.profissao.findFirst({ where: { id: searchParams.profissaoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.redeDeId && searchParams.redeDeId !== 'raiz'
      ? prisma.pessoa.findFirst({ where: { id: searchParams.redeDeId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
  ])
```

Vira:

```ts
  const [segmentoAtivo, profissaoAtiva, redeAtiva, areaAtiva] = await Promise.all([
    searchParams.segmentoId
      ? prisma.segmento.findFirst({ where: { id: searchParams.segmentoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.profissaoId
      ? prisma.profissao.findFirst({ where: { id: searchParams.profissaoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.redeDeId && searchParams.redeDeId !== 'raiz'
      ? prisma.pessoa.findFirst({ where: { id: searchParams.redeDeId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.areaId
      ? prisma.areaDemanda.findFirst({ where: { id: searchParams.areaId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
  ])
```

- [ ] **Step 4: Passar `areaAtiva` pro `DashboardConteudo`**

Bloco atual (linhas 225-228):

```tsx
      segmentoAtivo={segmentoAtivo}
      profissaoAtiva={profissaoAtiva}
      redeAtiva={searchParams.redeDeId === 'raiz' ? { nome: 'Rede Raiz' } : redeAtiva}
    />
```

Vira:

```tsx
      segmentoAtivo={segmentoAtivo}
      profissaoAtiva={profissaoAtiva}
      redeAtiva={searchParams.redeDeId === 'raiz' ? { nome: 'Rede Raiz' } : redeAtiva}
      areaAtiva={areaAtiva}
    />
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/dashboard/page.tsx"
git commit -m "feat: Dashboard admin entende filtroDemandas e resolve nome da area"
```

---

### Task 9: `mobilizador/dashboard/page.tsx` — `filtroDemandas` (com `responsavelId`) + área

**Files:**
- Modify: `src/app/[slug]/mobilizador/dashboard/page.tsx`

**Interfaces:**
- Consumes: `buildWhereDemandas` (Task 1), `buildWherePessoas` com 4º parâmetro (Task 2), props novos de `DashboardConteudo` (Task 7).

- [ ] **Step 1: Import**

Linhas 1-7 atuais:

```ts
// src/app/[slug]/mobilizador/dashboard/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { DashboardConteudo } from '../../admin/dashboard/DashboardConteudo'
```

Vira:

```ts
// src/app/[slug]/mobilizador/dashboard/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { buildWhereDemandas } from '@/lib/filtros-demandas'
import { DashboardConteudo } from '../../admin/dashboard/DashboardConteudo'
```

- [ ] **Step 2: `filtroDemandas` escopado por `responsavelId`**

Bloco atual (linha 64):

```ts
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas, idsRede)
```

Vira:

```ts
  const filtroDemandas = searchParams.filtroDemandas === '1'
    ? buildWhereDemandas(
        gabinete.id,
        {
          areaId: searchParams.areaId,
          status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
          dataInicio: searchParams.dataInicio,
          dataFim: searchParams.dataFim,
        },
        pessoa.id
      )
    : undefined
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas, idsRede, filtroDemandas)
```

`pessoa.id` como 3º argumento de `buildWhereDemandas` — mesmo escopo de segurança já aplicado na
aba Demandas do mobilizador: só demandas em que ele é `responsavelId`.

- [ ] **Step 3: Resolver nome da área ativa**

Bloco atual (linhas 66-73):

```ts
  const [segmentoAtivo, profissaoAtiva] = await Promise.all([
    searchParams.segmentoId
      ? prisma.segmento.findFirst({ where: { id: searchParams.segmentoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.profissaoId
      ? prisma.profissao.findFirst({ where: { id: searchParams.profissaoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
  ])
```

Vira:

```ts
  const [segmentoAtivo, profissaoAtiva, areaAtiva] = await Promise.all([
    searchParams.segmentoId
      ? prisma.segmento.findFirst({ where: { id: searchParams.segmentoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.profissaoId
      ? prisma.profissao.findFirst({ where: { id: searchParams.profissaoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.areaId
      ? prisma.areaDemanda.findFirst({ where: { id: searchParams.areaId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
  ])
```

- [ ] **Step 4: Passar `areaAtiva` pro `DashboardConteudo`**

Bloco atual (linhas 226-228):

```tsx
      segmentoAtivo={segmentoAtivo}
      profissaoAtiva={profissaoAtiva}
    />
```

Vira:

```tsx
      segmentoAtivo={segmentoAtivo}
      profissaoAtiva={profissaoAtiva}
      areaAtiva={areaAtiva}
    />
```

(Sem `redeAtiva` — já não existe nesta página, fora de escopo pro mobilizador desde a feature
anterior.)

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/mobilizador/dashboard/page.tsx"
git commit -m "feat: Dashboard mobilizador entende filtroDemandas (escopado por responsavelId)"
```

---

### Task 10: Verificação final

**Files:** nenhum arquivo novo — verificação automatizada + manual.

- [ ] **Step 1: Suíte de testes completa**

Run: `npx vitest run`
Expected: só as 2 falhas pré-existentes de `email.test.ts` (falta de `RESEND_API_KEY` local) —
nenhuma outra falha.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 4: Verificação manual (gabinete real, requer navegador — controller assume diretamente)**

- [ ] Aba Demandas (admin), sem nenhum filtro: botão "Visualizar Dados Gerais" já aparece (não
  precisa de filtro ativo). Clicar leva ao Dashboard com badge "Demandas: Todos os solicitantes" —
  população é todo mundo que já fez alguma demanda.
- [ ] Filtrar por status "Atendida" → clicar no botão → badge muda pra "Demandas: Solicitantes
  filtrados" + badge "Status: Atendida" — números do Dashboard batendo com quem tem demanda
  atendida.
- [ ] Combinar Área + Status + período (um mês inteiro) → badges de Área/Status/Período aparecem,
  cada uma removível independentemente (clicar no `×` de uma não afeta as outras).
- [ ] Remover a badge-base "Demandas: ..." → volta pro Dashboard sem nenhum filtro de Demandas
  (mas mantém `periodo` se estava em 7 dias, mesmo padrão já existente).
- [ ] "Limpar tudo" com filtros de Demandas ativos → volta à visão geral, nenhuma badge de
  Pessoas nem de Demandas.
- [ ] Exportar PDF e Excel na aba Demandas com período ativo → abrir o arquivo e confirmar que só
  tem demandas dentro do intervalo de datas escolhido.
- [ ] Repetir o fluxo completo no mobilizador (`/mobilizador/filtros/demandas` → botão →
  `/mobilizador/dashboard`) → confirmar que só entram demandas em que ele é responsável (comparar
  contra o que a própria aba Demandas do mobilizador já mostra pro mesmo filtro).
- [ ] Conferir que a pizza "Demandas do mês" do Dashboard não quebra visualmente quando
  `filtroDemandas=1` está ativo (pode mostrar números menores que o normal — efeito esperado,
  documentado na spec, não é bug).

Sem commit nesta task — é só verificação. Se algum passo falhar, volte pra task correspondente,
corrija, e repita a verificação a partir daí.
