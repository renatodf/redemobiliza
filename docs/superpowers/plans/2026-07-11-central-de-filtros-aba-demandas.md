# Central de Filtros — Aba Demandas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a aba "Demandas" à Central de Filtros (`/admin/filtros` e `/mobilizador/filtros`), com filtro por área/status-agrupado/região e exportação síncrona em PDF ou Excel.

**Architecture:** Um módulo dedicado `filtros-demandas.ts` (espelha `filtros-pessoas.ts`) monta o `where` do Prisma reaproveitado por três consumidores: a tela do admin, a tela do mobilizador e a rota de exportação. Um módulo `exportar-demandas.ts` (espelha `exportar-pessoas.ts`) gera os arquivos PDF/Excel. A exportação é sempre síncrona — sem o limite de 500 nem o fluxo assíncrono por e-mail que a aba Pessoas tem.

**Tech Stack:** Next.js 14 App Router, Prisma, `exceljs`, `pdf-lib` (mesmas libs já usadas na exportação de Pessoas).

## Global Constraints

- Filtros: área (`Demanda.areaId`, igualdade), status (`atendida` / `nao_atendida` / `pendente` — "pendente" vira `status: { in: ['aberta', 'expirada'] }`), região do solicitante (`Demanda.solicitante.regiaoId`). Valor de `status` fora desses três é ignorado silenciosamente (filtro não aplicado).
- `deletedAt: null` sempre aplicado (soft-delete), igual ao resto do sistema.
- Escopo: admin vê todas as Demandas do gabinete; mobilizador vê só as que tem `responsavelId` igual ao seu `pessoa.id` (mesmo critério de `/mobilizador/demandas`).
- Exportação **sempre síncrona** — sem `LIMITE_EXPORT_SINCRONO`, sem storage, sem e-mail. Estrutura idêntica à exportação de Pessoas, só sem o branch assíncrono.
- Colunas do arquivo exportado: Título, Área, Status (label amigável via `statusDemandaPill`, nunca o valor cru como `nao_atendida`), Solicitante, Responsável, Prazo (`toLocaleDateString('pt-BR')`).
- **Lição de sessões anteriores**: `tsc --noEmit` e `vitest` NÃO pegam erros de ESLint (`next build` os pega, e o build Docker falha se houver erro de lint). Todo task desta plano precisa rodar `npm run build` completo antes do commit, não só `tsc --noEmit`.
- Nenhuma mudança de comportamento na listagem `/admin/demandas` existente, nem na aba Pessoas já em produção.

---

### Task 1: Módulo `filtros-demandas.ts`

**Files:**
- Create: `src/lib/filtros-demandas.ts`
- Test: `src/lib/__tests__/filtros-demandas.test.ts`

**Interfaces:**
- Produces: `FiltrosDemandasParams` (type), `buildWhereDemandas(gabineteId: string, params: FiltrosDemandasParams, responsavelId?: string): WhereDemandas` — reaproveitado por Task 3 (tela admin), Task 4 (tela mobilizador) e Task 5 (rota de exportação)

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `src/lib/__tests__/filtros-demandas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildWhereDemandas } from '../filtros-demandas'

describe('buildWhereDemandas', () => {
  it('sempre filtra por gabineteId e deletedAt null', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.gabineteId).toBe('gab-1')
    expect(where.deletedAt).toBeNull()
  })

  it('adiciona responsavelId quando passado (escopo mobilizador)', () => {
    const where = buildWhereDemandas('gab-1', {}, 'pessoa-1')
    expect(where.responsavelId).toBe('pessoa-1')
  })

  it('não filtra por responsavelId quando não passado (escopo admin)', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.responsavelId).toBeUndefined()
  })

  it('filtra por área', () => {
    const where = buildWhereDemandas('gab-1', { areaId: 'area-1' })
    expect(where.areaId).toBe('area-1')
  })

  it('filtra por status "atendida" diretamente', () => {
    const where = buildWhereDemandas('gab-1', { status: 'atendida' })
    expect(where.status).toBe('atendida')
  })

  it('filtra por status "nao_atendida" diretamente', () => {
    const where = buildWhereDemandas('gab-1', { status: 'nao_atendida' })
    expect(where.status).toBe('nao_atendida')
  })

  it('agrupa "pendente" em aberta + expirada', () => {
    const where = buildWhereDemandas('gab-1', { status: 'pendente' })
    expect(where.status).toEqual({ in: ['aberta', 'expirada'] })
  })

  it('ignora status fora do enum esperado', () => {
    // @ts-expect-error valor inválido de propósito, pra testar o runtime
    const where = buildWhereDemandas('gab-1', { status: 'lixo' })
    expect(where.status).toBeUndefined()
  })

  it('sem filtro de status, não aplica nenhum', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.status).toBeUndefined()
  })

  it('filtra por região do solicitante via relação', () => {
    const where = buildWhereDemandas('gab-1', { regiaoId: 'regiao-1' })
    expect(where.solicitante).toEqual({ regiaoId: 'regiao-1' })
  })

  it('sem filtro de região, não aplica relação de solicitante', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.solicitante).toBeUndefined()
  })

  it('combina todos os filtros ao mesmo tempo', () => {
    const where = buildWhereDemandas(
      'gab-1',
      { areaId: 'area-1', status: 'pendente', regiaoId: 'regiao-1' },
      'pessoa-1'
    )
    expect(where).toEqual({
      gabineteId: 'gab-1',
      deletedAt: null,
      responsavelId: 'pessoa-1',
      areaId: 'area-1',
      status: { in: ['aberta', 'expirada'] },
      solicitante: { regiaoId: 'regiao-1' },
    })
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/filtros-demandas.test.ts`
Expected: FAIL — `Cannot find module '../filtros-demandas'` (o arquivo ainda não existe)

- [ ] **Step 3: Criar `src/lib/filtros-demandas.ts`**

```typescript
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

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/filtros-demandas.test.ts`
Expected: PASS — 12/12 testes

- [ ] **Step 5: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos (o projeto já tem 2 erros pré-existentes e não relacionados em `exportar-pessoas.test.ts` — ignore-os)

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 6: Commit**

```bash
git add src/lib/filtros-demandas.ts src/lib/__tests__/filtros-demandas.test.ts
git commit -m "feat: buildWhereDemandas — módulo de filtro da aba Demandas"
```

---

### Task 2: Módulo `exportar-demandas.ts`

**Files:**
- Create: `src/lib/exportar-demandas.ts`
- Test: `src/lib/__tests__/exportar-demandas.test.ts`

**Interfaces:**
- Consumes: `statusDemandaPill` de `@/lib/status-demanda` (já existe, não modificar)
- Produces: `DemandaExportavel` (type), `gerarExcelDemandas(demandas: DemandaExportavel[]): Promise<Buffer>`, `gerarPdfDemandas(demandas: DemandaExportavel[]): Promise<Buffer>` — reaproveitados por Task 5 (rota de exportação)

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `src/lib/__tests__/exportar-demandas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarExcelDemandas, gerarPdfDemandas, type DemandaExportavel } from '../exportar-demandas'

const demandaExemplo: DemandaExportavel = {
  titulo: 'Buraco na rua principal',
  area: { nome: 'Infraestrutura' },
  status: 'atendida',
  solicitante: { nome: 'João Souza' },
  responsavel: { nome: 'Maria Silva' },
  prazoDesfecho: new Date(2026, 6, 20),
}

describe('gerarExcelDemandas', () => {
  it('gera um .xlsx válido com uma linha por demanda', async () => {
    const buffer = await gerarExcelDemandas([demandaExemplo])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(buffer))
    const sheet = workbook.getWorksheet('Demandas')
    expect(sheet?.rowCount).toBe(2)
    expect(sheet?.getRow(2).getCell(1).value).toBe('Buraco na rua principal')
  })

  it('usa o label amigável do status, não o valor cru', async () => {
    const buffer = await gerarExcelDemandas([demandaExemplo])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(buffer))
    const sheet = workbook.getWorksheet('Demandas')
    expect(sheet?.getRow(2).getCell(3).value).toBe('CONCLUÍDO')
  })

  it('gera planilha vazia (só cabeçalho) quando não há demandas', async () => {
    const buffer = await gerarExcelDemandas([])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(buffer))
    const sheet = workbook.getWorksheet('Demandas')
    expect(sheet?.rowCount).toBe(1)
  })
})

describe('gerarPdfDemandas', () => {
  it('gera um PDF válido (bytes começam com %PDF-)', async () => {
    const buffer = await gerarPdfDemandas([demandaExemplo])
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('não quebra com lista vazia', async () => {
    const buffer = await gerarPdfDemandas([])
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/exportar-demandas.test.ts`
Expected: FAIL — `Cannot find module '../exportar-demandas'`

- [ ] **Step 3: Criar `src/lib/exportar-demandas.ts`**

```typescript
import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { statusDemandaPill } from './status-demanda'

export type DemandaExportavel = {
  titulo: string
  area: { nome: string }
  status: string
  solicitante: { nome: string }
  responsavel: { nome: string }
  prazoDesfecho: Date
}

function formatarLinha(d: DemandaExportavel) {
  return {
    titulo: d.titulo,
    area: d.area.nome,
    status: statusDemandaPill(d.status).label,
    solicitante: d.solicitante.nome,
    responsavel: d.responsavel.nome,
    prazo: d.prazoDesfecho.toLocaleDateString('pt-BR'),
  }
}

export async function gerarExcelDemandas(demandas: DemandaExportavel[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Demandas')
  sheet.columns = [
    { header: 'Título', key: 'titulo', width: 30 },
    { header: 'Área', key: 'area', width: 20 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Solicitante', key: 'solicitante', width: 24 },
    { header: 'Responsável', key: 'responsavel', width: 24 },
    { header: 'Prazo', key: 'prazo', width: 14 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const d of demandas) sheet.addRow(formatarLinha(d))
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

const COLUNAS = [
  { chave: 'titulo' as const, titulo: 'Título', largura: 120 },
  { chave: 'area' as const, titulo: 'Área', largura: 70 },
  { chave: 'status' as const, titulo: 'Status', largura: 70 },
  { chave: 'solicitante' as const, titulo: 'Solicitante', largura: 90 },
  { chave: 'responsavel' as const, titulo: 'Responsável', largura: 90 },
  { chave: 'prazo' as const, titulo: 'Prazo', largura: 70 },
]

export async function gerarPdfDemandas(demandas: DemandaExportavel[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const fonte = await doc.embedFont(StandardFonts.Helvetica)
  const fonteBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const largura = 595
  const altura = 842
  const margem = 40
  const alturaLinha = 18

  let pagina = doc.addPage([largura, altura])
  let y = altura - margem

  function novaPagina() {
    pagina = doc.addPage([largura, altura])
    y = altura - margem
  }

  function desenharCabecalho() {
    let x = margem
    for (const col of COLUNAS) {
      pagina.drawText(col.titulo, { x, y, size: 9, font: fonteBold, color: rgb(0, 0, 0) })
      x += col.largura
    }
    y -= alturaLinha
  }

  pagina.drawText('Demandas filtradas', { x: margem, y, size: 14, font: fonteBold })
  y -= alturaLinha * 1.5
  desenharCabecalho()

  for (const d of demandas) {
    if (y < margem + alturaLinha) {
      novaPagina()
      desenharCabecalho()
    }
    const linha = formatarLinha(d)
    let x = margem
    for (const col of COLUNAS) {
      pagina.drawText(linha[col.chave].slice(0, 40), { x, y, size: 8, font: fonte, color: rgb(0.2, 0.2, 0.2) })
      x += col.largura
    }
    y -= alturaLinha
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/exportar-demandas.test.ts`
Expected: PASS — 5/5 testes

- [ ] **Step 5: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 6: Commit**

```bash
git add src/lib/exportar-demandas.ts src/lib/__tests__/exportar-demandas.test.ts
git commit -m "feat: geração de PDF e Excel de Demandas exportadas"
```

---

### Task 3: Tela do admin — `DemandasFiltro.tsx` + `/admin/filtros/demandas`

**Files:**
- Create: `src/app/[slug]/admin/filtros/DemandasFiltro.tsx`
- Create: `src/app/[slug]/admin/filtros/demandas/page.tsx`
- Modify: `src/app/[slug]/admin/filtros/page.tsx`

**Interfaces:**
- Consumes: `buildWhereDemandas`, `FiltrosDemandasParams` (Task 1); `statusDemandaPill` de `@/lib/status-demanda` (já existe); `Pagination` de `@/components/admin/Pagination` (já existe); `FiltrosTabs` de `./FiltrosTabs` (já existe)
- Produces: `DemandasFiltro` component — reaproveitado por Task 4 (tela do mobilizador)

Sem teste automatizado — é uma tela (Server Component + Client puramente apresentacional), mesmo padrão de `PessoasFiltro.tsx`, que também não tem teste.

- [ ] **Step 1: Criar `src/app/[slug]/admin/filtros/DemandasFiltro.tsx`**

```tsx
// src/app/[slug]/admin/filtros/DemandasFiltro.tsx
import Pagination from '@/components/admin/Pagination'
import { statusDemandaPill } from '@/lib/status-demanda'

type DemandaLinha = {
  id: string
  titulo: string
  status: string
  prazoDesfecho: Date
  area: { nome: string }
  solicitante: { nome: string }
  responsavel: { nome: string }
}

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
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== 'page') qs.set(k, v)
  }
  const queryAtual = qs.toString()
  const separador = queryAtual ? '&' : ''

  return (
    <div className="space-y-4">
      <form method="get" action={baseHref} className="flex flex-wrap items-end gap-3 bg-gray-50 p-4 rounded-lg">
        <div>
          <label className="block text-xs font-medium text-gray-600">Área</label>
          <select name="areaId" defaultValue={searchParams.areaId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Status</label>
          <select name="status" defaultValue={searchParams.status ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="atendida">Atendida</option>
            <option value="nao_atendida">Não atendida</option>
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
        <a
          href={baseHref}
          className="text-sm text-gray-500 underline px-2 py-1.5 hover:text-gray-700"
        >
          Limpar filtro
        </a>
      </form>

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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Título</th>
              <th className="py-2 pr-3">Área</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Solicitante</th>
              <th className="py-2 pr-3">Responsável</th>
              <th className="py-2 pr-3">Prazo</th>
            </tr>
          </thead>
          <tbody>
            {demandas.map((d) => {
              const pill = statusDemandaPill(d.status)
              return (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{d.titulo}</td>
                  <td className="py-2 pr-3">{d.area.nome}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${pill.corClasse}`}>{pill.label}</span>
                  </td>
                  <td className="py-2 pr-3">{d.solicitante.nome}</td>
                  <td className="py-2 pr-3">{d.responsavel.nome}</td>
                  <td className="py-2 pr-3">{d.prazoDesfecho.toLocaleDateString('pt-BR')}</td>
                </tr>
              )
            })}
            {demandas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">Nenhuma demanda encontrada com esses filtros.</td>
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
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/app/[slug]/admin/filtros/demandas/page.tsx`**

```tsx
// src/app/[slug]/admin/filtros/demandas/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import FiltrosTabs from '../FiltrosTabs'
import DemandasFiltro from '../DemandasFiltro'

const TAMANHO_PAGINA = 20

export default async function AdminFiltrosDemandasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const filtros: FiltrosDemandasParams = {
    areaId: searchParams.areaId,
    status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
    regiaoId: searchParams.regiaoId,
  }

  const where = buildWhereDemandas(gabinete.id, filtros)
  const pagina = Math.max(1, Number(searchParams.page ?? 1))
  const skip = (pagina - 1) * TAMANHO_PAGINA
  const take = TAMANHO_PAGINA

  const [demandasPagina, totalFiltrado, areas, regioes] = await Promise.all([
    prisma.demanda.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take,
      select: {
        id: true,
        titulo: true,
        status: true,
        prazoDesfecho: true,
        area: { select: { nome: true } },
        solicitante: { select: { nome: true } },
        responsavel: { select: { nome: true } },
      },
    }),
    prisma.demanda.count({ where }),
    prisma.areaDemanda.findMany({ where: { gabineteId: gabinete.id }, orderBy: { nome: 'asc' } }),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
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
          { chave: 'banco-talentos', label: 'Banco de Talentos' },
        ]}
        abaAtiva="demandas"
        corPrimaria={gabinete.corPrimaria}
      />
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
    </div>
  )
}
```

**Nota:** `skip`/`take` são calculados na mão (`(pagina - 1) * TAMANHO_PAGINA`), não via `paginar()` — `paginar()` recebe o total pra clampar a página contra o número real de páginas, mas aqui o total (`totalFiltrado`, vindo de `prisma.demanda.count`) só fica disponível depois, no mesmo `Promise.all` que já faz o `findMany`. Chamar `paginar(0, ...)` pareceria funcionar mas quebra: com `totalItens=0`, `paginar` sempre clampa a página pra 1, então `skip` nunca avançaria além da primeira página. O `totalPaginas` real (pra clamping de links e exibição) é responsabilidade só do componente `Pagination`, que recebe `totalFiltrado` de verdade e chama `paginar()` internamente por conta própria — diferente de Pessoas, que pagina em memória após o filtro pós-consulta e por isso já tem o total disponível antes de calcular `skip`/`take`.

- [ ] **Step 3: Adicionar `href` na aba "Demandas" em `src/app/[slug]/admin/filtros/page.tsx`**

Troque:

```tsx
          { chave: 'demandas', label: 'Demandas' },
```

por:

```tsx
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/admin/filtros/demandas` },
```

- [ ] **Step 4: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 5: Verificação manual**

Suba o servidor de dev (`npm run dev`), acesse `/[slug]/admin/filtros`, confirme que a aba "Demandas" agora é clicável (deixou de ser "Em breve") e leva pra `/[slug]/admin/filtros/demandas`. Confirme que a lista carrega, que os três filtros (Área/Status/Região) funcionam isoladamente e combinados, que "Limpar filtro" volta pro estado sem filtro, e que os botões "Exportar PDF"/"Exportar Excel" iniciam um download (não precisa abrir o arquivo, só confirmar que a resposta chega — a rota de exportação em si só é criada na Task 5, então nesta task o clique vai dar 404, o que é esperado; documente isso no relatório).

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/filtros/DemandasFiltro.tsx" \
  "src/app/[slug]/admin/filtros/demandas/page.tsx" \
  "src/app/[slug]/admin/filtros/page.tsx"
git commit -m "feat: aba Demandas na Central de Filtros do admin"
```

---

### Task 4: Tela do mobilizador — `/mobilizador/filtros/demandas`

**Files:**
- Create: `src/app/[slug]/mobilizador/filtros/demandas/page.tsx`
- Modify: `src/app/[slug]/mobilizador/filtros/page.tsx`

**Interfaces:**
- Consumes: `buildWhereDemandas`, `FiltrosDemandasParams` (Task 1); `DemandasFiltro` (Task 3, componente compartilhado — não recriar); `assertMobilizadorAccess` de `@/lib/assert-mobilizador-access` (já existe)

Sem teste automatizado — mesma justificativa da Task 3 (tela Server Component, sem lógica própria além de orquestrar dados já testados em `filtros-demandas.ts`).

- [ ] **Step 1: Criar `src/app/[slug]/mobilizador/filtros/demandas/page.tsx`**

```tsx
// src/app/[slug]/mobilizador/filtros/demandas/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import FiltrosTabs from '../../admin/filtros/FiltrosTabs'
import DemandasFiltro from '../../admin/filtros/DemandasFiltro'

const TAMANHO_PAGINA = 20

export default async function MobilizadorFiltrosDemandasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const resultado = await assertMobilizadorAccess(params.slug).catch(() => null)
  if (!resultado) notFound()
  const { gabinete, pessoa } = resultado

  const filtros: FiltrosDemandasParams = {
    areaId: searchParams.areaId,
    status: searchParams.status as 'atendida' | 'nao_atendida' | 'pendente' | undefined,
    regiaoId: searchParams.regiaoId,
  }

  const where = buildWhereDemandas(gabinete.id, filtros, pessoa.id)
  const pagina = Math.max(1, Number(searchParams.page ?? 1))
  const skip = (pagina - 1) * TAMANHO_PAGINA
  const take = TAMANHO_PAGINA

  const [demandasPagina, totalFiltrado, areas, regioes] = await Promise.all([
    prisma.demanda.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take,
      select: {
        id: true,
        titulo: true,
        status: true,
        prazoDesfecho: true,
        area: { select: { nome: true } },
        solicitante: { select: { nome: true } },
        responsavel: { select: { nome: true } },
      },
    }),
    prisma.demanda.count({ where }),
    prisma.areaDemanda.findMany({ where: { gabineteId: gabinete.id }, orderBy: { nome: 'asc' } }),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Filtros</h1>
        <p className="text-sm text-gray-600 mt-1">Filtre e exporte os dados da sua rede.</p>
      </div>
      <FiltrosTabs
        abas={[
          { chave: 'pessoas', label: 'Pessoas', href: `/${params.slug}/mobilizador/filtros` },
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/mobilizador/filtros/demandas` },
        ]}
        abaAtiva="demandas"
        corPrimaria={gabinete.corPrimaria}
      />
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
    </div>
  )
}
```

- [ ] **Step 2: Adicionar `href` na aba "Demandas" em `src/app/[slug]/mobilizador/filtros/page.tsx`**

Troque:

```tsx
          { chave: 'demandas', label: 'Demandas' },
```

por:

```tsx
          { chave: 'demandas', label: 'Demandas', href: `/${params.slug}/mobilizador/filtros/demandas` },
```

- [ ] **Step 3: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 4: Verificação manual**

Com um usuário mobilizador de teste que tenha ao menos uma Demanda atribuída (`responsavelId`), acesse `/[slug]/mobilizador/filtros/demandas` e confirme que só aparecem as demandas dele — não as de outros mobilizadores nem as sem responsável atribuído a ele. Confirme que os filtros funcionam do mesmo jeito que na tela do admin.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[slug]/mobilizador/filtros/demandas/page.tsx" \
  "src/app/[slug]/mobilizador/filtros/page.tsx"
git commit -m "feat: aba Demandas na Central de Filtros do mobilizador"
```

---

### Task 5: Rota de exportação — `GET /api/[slug]/filtros/demandas/exportar`

**Files:**
- Create: `src/app/api/[slug]/filtros/demandas/exportar/route.ts`

**Interfaces:**
- Consumes: `buildWhereDemandas`, `FiltrosDemandasParams` (Task 1); `gerarPdfDemandas`, `gerarExcelDemandas`, `DemandaExportavel` (Task 2); `assertAdminAccess`, `assertMobilizadorAccess` (já existem)

Sem teste automatizado — mesmo padrão da rota de exportação de Pessoas (depende de request/auth reais, difícil de unit-testar; a lógica de filtro e geração de arquivo, que é o que importa, já está testada nos módulos das Tasks 1 e 2).

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/api/[slug]/filtros/demandas/exportar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import { gerarPdfDemandas, gerarExcelDemandas, type DemandaExportavel } from '@/lib/exportar-demandas'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  let gabineteId: string
  let responsavelId: string | undefined

  try {
    const { gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
  } catch {
    try {
      const { gabinete, pessoa } = await assertMobilizadorAccess(params.slug)
      gabineteId = gabinete.id
      responsavelId = pessoa.id
    } catch {
      return new NextResponse('Não autorizado', { status: 403 })
    }
  }

  const sp = request.nextUrl.searchParams
  const filtros: FiltrosDemandasParams = {
    areaId: sp.get('areaId') ?? undefined,
    status: (sp.get('status') as 'atendida' | 'nao_atendida' | 'pendente' | null) ?? undefined,
    regiaoId: sp.get('regiaoId') ?? undefined,
  }
  const formato: 'pdf' | 'excel' = sp.get('formato') === 'excel' ? 'excel' : 'pdf'

  const where = buildWhereDemandas(gabineteId, filtros, responsavelId)
  const demandas: DemandaExportavel[] = await prisma.demanda.findMany({
    where,
    orderBy: { criadoEm: 'desc' },
    select: {
      titulo: true,
      status: true,
      prazoDesfecho: true,
      area: { select: { nome: true } },
      solicitante: { select: { nome: true } },
      responsavel: { select: { nome: true } },
    },
  })

  if (formato === 'excel') {
    const buffer = await gerarExcelDemandas(demandas)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="demandas_filtradas.xlsx"',
      },
    })
  }

  const buffer = await gerarPdfDemandas(demandas)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="demandas_filtradas.pdf"',
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
Expected: mesmas 2 falhas pré-existentes em `email.test.ts` (RESEND_API_KEY ausente), nenhuma nova falha. Confirme que os 17 testes novos das Tasks 1 e 2 (`filtros-demandas.test.ts` + `exportar-demandas.test.ts`) aparecem passando.

- [ ] **Step 4: Verificação manual**

Com o servidor de dev rodando e um gabinete de teste com Demandas reais: acesse `/[slug]/admin/filtros/demandas`, aplique cada filtro isoladamente (área, cada valor de status, região) e confirme que a contagem muda como esperado. Clique em "Exportar PDF" e "Exportar Excel" e confirme que os arquivos baixam com o conteúdo esperado (abra pelo menos um deles e confira as colunas/linhas). Repita o teste de exportação como mobilizador (usuário com ao menos uma Demanda atribuída) e confirme que só as dele aparecem no arquivo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/[slug]/filtros/demandas/exportar/route.ts"
git commit -m "feat: rota de exportação de Demandas em PDF ou Excel"
```
