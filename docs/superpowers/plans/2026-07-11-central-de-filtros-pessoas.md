# Central de Filtros — Plano 1: Casca + Aba Pessoas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o ícone de lupa (hoje decorativo) no Topbar a uma nova tela de filtros, com a aba Pessoas totalmente funcional (filtros combináveis + exportação em PDF/Excel), escopada à própria rede para o mobilizador.

**Architecture:** Server Components lendo `searchParams` da URL (formulário `GET`, sem JavaScript de cliente), construção de `where` do Prisma via helper compartilhado, paginação em memória reaproveitando `paginar()`/`<Pagination>` já existentes. Exportação via uma API Route (`/api/[slug]/filtros/pessoas/exportar`) compartilhada entre admin e mobilizador, que detecta o papel via os helpers de autorização já existentes. Geração de PDF com `pdf-lib` (só usa as 14 fontes padrão embutidas na própria lib — evita o problema conhecido de bibliotecas como `pdfkit`, que carregam arquivos `.afm` externos em runtime e quebram no build `standalone` do Next.js/Docker deste projeto). Geração de Excel com `exceljs`.

**Tech Stack:** Next.js 14 App Router, Prisma 7, TypeScript, Tailwind, Vitest. Novas dependências: `pdf-lib@1.17.1`, `exceljs@4.4.0`.

## Global Constraints

- Todo dado de tenant é sempre filtrado por `gabineteId`, resolvido da sessão — nunca de parâmetro de URL.
- Mobilizador só filtra dentro da própria rede: **toda a sub-árvore** de indicações (indicados de indicados, recursivamente), não só indicados diretos.
- Esta é a aba **Pessoas** apenas. As abas Demandas e Banco de Talentos são planos separados (Planos 2 e 3) — a casca da tela (`FiltrosTabs`) já reserva o espaço pra elas, desabilitadas, mas não implementa o conteúdo.
- Seguir o padrão já estabelecido no projeto: páginas dentro de `/admin/` não re-verificam o papel do usuário (o `layout.tsx` já garante isso) — só API Routes (que não passam pelo layout) precisam checar autorização explicitamente.
- Tema dinâmico por gabinete (`corPrimaria`) em toda a UI nova, seguindo o padrão de botões já usado no resto do sistema (`text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium`, fundo `corPrimaria`, texto branco).

---

### Task 1: `src/lib/aniversario.ts` — funções puras de aniversário e idade

**Files:**
- Create: `src/lib/aniversario.ts`
- Test: `src/lib/__tests__/aniversario.test.ts`

**Interfaces:**
- Produces: `estaNoIntervaloAniversario(nascimento: Date, modo: 'dia' | 'semana' | 'mes', hoje: Date): boolean`, `calcularIdade(nascimento: Date, hoje: Date): number`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/aniversario.test.ts
import { describe, it, expect } from 'vitest'
import { estaNoIntervaloAniversario, calcularIdade } from '../aniversario'

describe('estaNoIntervaloAniversario', () => {
  it('modo dia — aniversário é hoje', () => {
    const hoje = new Date(2026, 6, 15)
    const nascimento = new Date(1990, 6, 15)
    expect(estaNoIntervaloAniversario(nascimento, 'dia', hoje)).toBe(true)
  })

  it('modo dia — aniversário não é hoje', () => {
    const hoje = new Date(2026, 6, 15)
    const nascimento = new Date(1990, 6, 16)
    expect(estaNoIntervaloAniversario(nascimento, 'dia', hoje)).toBe(false)
  })

  it('modo semana — aniversário em 3 dias', () => {
    const hoje = new Date(2026, 6, 15)
    const nascimento = new Date(1985, 6, 18)
    expect(estaNoIntervaloAniversario(nascimento, 'semana', hoje)).toBe(true)
  })

  it('modo semana — aniversário em 10 dias fica de fora', () => {
    const hoje = new Date(2026, 6, 15)
    const nascimento = new Date(1985, 6, 25)
    expect(estaNoIntervaloAniversario(nascimento, 'semana', hoje)).toBe(false)
  })

  it('modo semana — atravessa virada de ano', () => {
    const hoje = new Date(2026, 11, 29)
    const nascimento = new Date(1992, 0, 2)
    expect(estaNoIntervaloAniversario(nascimento, 'semana', hoje)).toBe(true)
  })

  it('modo mes — mesmo mês', () => {
    const hoje = new Date(2026, 6, 1)
    const nascimento = new Date(2000, 6, 30)
    expect(estaNoIntervaloAniversario(nascimento, 'mes', hoje)).toBe(true)
  })

  it('modo mes — mês diferente', () => {
    const hoje = new Date(2026, 6, 1)
    const nascimento = new Date(2000, 7, 1)
    expect(estaNoIntervaloAniversario(nascimento, 'mes', hoje)).toBe(false)
  })
})

describe('calcularIdade', () => {
  it('já fez aniversário este ano', () => {
    const nascimento = new Date(1990, 2, 10)
    const hoje = new Date(2026, 6, 15)
    expect(calcularIdade(nascimento, hoje)).toBe(36)
  })

  it('ainda não fez aniversário este ano', () => {
    const nascimento = new Date(1990, 9, 10)
    const hoje = new Date(2026, 6, 15)
    expect(calcularIdade(nascimento, hoje)).toBe(35)
  })

  it('aniversário é hoje', () => {
    const nascimento = new Date(1990, 6, 15)
    const hoje = new Date(2026, 6, 15)
    expect(calcularIdade(nascimento, hoje)).toBe(36)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/aniversario.test.ts`
Expected: FAIL with "Cannot find module '../aniversario'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/aniversario.ts

function aoMeioDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate())
}

function proximaOcorrenciaAniversario(nascimento: Date, hojeNormalizado: Date): Date {
  let candidato = new Date(hojeNormalizado.getFullYear(), nascimento.getMonth(), nascimento.getDate())
  if (candidato < hojeNormalizado) {
    candidato = new Date(hojeNormalizado.getFullYear() + 1, nascimento.getMonth(), nascimento.getDate())
  }
  return candidato
}

export function estaNoIntervaloAniversario(
  nascimento: Date,
  modo: 'dia' | 'semana' | 'mes',
  hoje: Date
): boolean {
  const hojeNormalizado = aoMeioDia(hoje)

  if (modo === 'mes') {
    return nascimento.getMonth() === hojeNormalizado.getMonth()
  }

  const proxima = proximaOcorrenciaAniversario(nascimento, hojeNormalizado)
  const diffDias = Math.round((proxima.getTime() - hojeNormalizado.getTime()) / (1000 * 60 * 60 * 24))

  if (modo === 'dia') return diffDias === 0
  return diffDias >= 0 && diffDias <= 6
}

export function calcularIdade(nascimento: Date, hoje: Date): number {
  let idade = hoje.getFullYear() - nascimento.getFullYear()
  const aindaNaoFezAniversarioEsteAno =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())
  if (aindaNaoFezAniversarioEsteAno) idade--
  return idade
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/aniversario.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/aniversario.ts src/lib/__tests__/aniversario.test.ts
git commit -m "feat: funções puras de aniversário (dia/semana/mês) e cálculo de idade"
```

---

### Task 2: `src/lib/filtros-pessoas.ts` — where-builder e filtro pós-consulta

**Files:**
- Create: `src/lib/filtros-pessoas.ts`
- Test: `src/lib/__tests__/filtros-pessoas.test.ts`

**Interfaces:**
- Consumes: `estaNoIntervaloAniversario`, `calcularIdade` de `src/lib/aniversario.ts` (Task 1)
- Produces: `type FiltrosPessoasParams = { genero?: string; regiaoId?: string; profissaoId?: string; segmentoId?: string; aniversario?: 'dia' | 'semana' | 'mes'; idadeMin?: string; idadeMax?: string }`, `buildWherePessoas(gabineteId: string, params: FiltrosPessoasParams, idsRede?: string[]): WherePessoas`, `aplicarFiltrosPosConsulta<T extends { nascimento: Date | null }>(pessoas: T[], params: FiltrosPessoasParams, hoje: Date): T[]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/filtros-pessoas.test.ts
import { describe, it, expect } from 'vitest'
import { buildWherePessoas, aplicarFiltrosPosConsulta } from '../filtros-pessoas'

describe('buildWherePessoas', () => {
  it('sempre filtra por gabineteId e deletedAt null', () => {
    const where = buildWherePessoas('gab-1', {})
    expect(where.gabineteId).toBe('gab-1')
    expect(where.deletedAt).toBeNull()
  })

  it('adiciona id in quando idsRede é passado (escopo mobilizador)', () => {
    const where = buildWherePessoas('gab-1', {}, ['p1', 'p2'])
    expect(where.id).toEqual({ in: ['p1', 'p2'] })
  })

  it('não filtra por id quando idsRede não é passado (escopo admin)', () => {
    const where = buildWherePessoas('gab-1', {})
    expect(where.id).toBeUndefined()
  })

  it('adiciona filtro de segmento via relação', () => {
    const where = buildWherePessoas('gab-1', { segmentoId: 'seg-1' })
    expect(where.segmentos).toEqual({ some: { segmentoId: 'seg-1' } })
  })

  it('exige nascimento não nulo quando há filtro de idade ou aniversário', () => {
    const where = buildWherePessoas('gab-1', { aniversario: 'mes' })
    expect(where.nascimento).toEqual({ not: null })
  })

  it('não exige nascimento quando não há filtro de idade/aniversário', () => {
    const where = buildWherePessoas('gab-1', { genero: 'feminino' })
    expect(where.nascimento).toBeUndefined()
  })
})

describe('aplicarFiltrosPosConsulta', () => {
  const hoje = new Date(2026, 6, 15)
  const pessoas = [
    { id: '1', nascimento: new Date(1990, 6, 15) },
    { id: '2', nascimento: new Date(1980, 0, 1) },
    { id: '3', nascimento: null as Date | null },
  ]

  it('filtra por aniversário do dia', () => {
    const resultado = aplicarFiltrosPosConsulta(pessoas, { aniversario: 'dia' }, hoje)
    expect(resultado.map((p) => p.id)).toEqual(['1'])
  })

  it('exclui pessoas sem nascimento quando há filtro de aniversário', () => {
    const resultado = aplicarFiltrosPosConsulta(pessoas, { aniversario: 'mes' }, hoje)
    expect(resultado.find((p) => p.id === '3')).toBeUndefined()
  })

  it('sem filtros de aniversário/idade, mantém todo mundo (inclusive sem nascimento)', () => {
    const resultado = aplicarFiltrosPosConsulta(pessoas, {}, hoje)
    expect(resultado.length).toBe(3)
  })

  it('filtra por faixa de idade', () => {
    const resultado = aplicarFiltrosPosConsulta(pessoas, { idadeMin: '35', idadeMax: '37' }, hoje)
    expect(resultado.map((p) => p.id)).toEqual(['1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/filtros-pessoas.test.ts`
Expected: FAIL with "Cannot find module '../filtros-pessoas'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/filtros-pessoas.ts
import { estaNoIntervaloAniversario, calcularIdade } from './aniversario'

export type FiltrosPessoasParams = {
  genero?: string
  regiaoId?: string
  profissaoId?: string
  segmentoId?: string
  aniversario?: 'dia' | 'semana' | 'mes'
  idadeMin?: string
  idadeMax?: string
}

export type WherePessoas = {
  gabineteId: string
  deletedAt: null
  id?: { in: string[] }
  genero?: string
  regiaoId?: string
  profissaoId?: string
  segmentos?: { some: { segmentoId: string } }
  nascimento?: { not: null }
}

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
  return where
}

export function aplicarFiltrosPosConsulta<T extends { nascimento: Date | null }>(
  pessoas: T[],
  params: FiltrosPessoasParams,
  hoje: Date
): T[] {
  const temFiltroDeData = Boolean(params.aniversario || params.idadeMin || params.idadeMax)
  return pessoas.filter((p) => {
    if (!p.nascimento) return !temFiltroDeData
    if (params.aniversario && !estaNoIntervaloAniversario(p.nascimento, params.aniversario, hoje)) return false
    const idade = calcularIdade(p.nascimento, hoje)
    if (params.idadeMin && idade < Number(params.idadeMin)) return false
    if (params.idadeMax && idade > Number(params.idadeMax)) return false
    return true
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/filtros-pessoas.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/filtros-pessoas.ts src/lib/__tests__/filtros-pessoas.test.ts
git commit -m "feat: where-builder e filtro pós-consulta de Pessoas para a Central de Filtros"
```

---

### Task 3: `src/lib/exportar-pessoas.ts` — geração de PDF e Excel

**Files:**
- Create: `src/lib/exportar-pessoas.ts`
- Test: `src/lib/__tests__/exportar-pessoas.test.ts`
- Modify: `package.json` (adiciona `pdf-lib` e `exceljs`)

**Interfaces:**
- Produces: `type PessoaExportavel = { nome: string; whatsapp: string; email: string | null; nascimento: Date | null; regiao: { nome: string } | null; profissao: { nome: string } | null; segmentos: { segmento: { nome: string } }[] }`, `gerarExcelPessoas(pessoas: PessoaExportavel[]): Promise<Buffer>`, `gerarPdfPessoas(pessoas: PessoaExportavel[]): Promise<Buffer>`

- [ ] **Step 1: Install dependencies**

```bash
npm install pdf-lib@1.17.1 exceljs@4.4.0
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/__tests__/exportar-pessoas.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarExcelPessoas, gerarPdfPessoas, type PessoaExportavel } from '../exportar-pessoas'

const pessoaExemplo: PessoaExportavel = {
  nome: 'Maria Silva',
  whatsapp: '61999998888',
  email: 'maria@example.com',
  nascimento: new Date(1990, 4, 20),
  regiao: { nome: 'Taguatinga' },
  profissao: { nome: 'Professora' },
  segmentos: [{ segmento: { nome: 'Saúde' } }],
}

describe('gerarExcelPessoas', () => {
  it('gera um .xlsx válido com uma linha por pessoa', async () => {
    const buffer = await gerarExcelPessoas([pessoaExemplo])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Pessoas')
    expect(sheet?.rowCount).toBe(2)
    expect(sheet?.getRow(2).getCell(1).value).toBe('Maria Silva')
  })

  it('gera planilha vazia (só cabeçalho) quando não há pessoas', async () => {
    const buffer = await gerarExcelPessoas([])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Pessoas')
    expect(sheet?.rowCount).toBe(1)
  })
})

describe('gerarPdfPessoas', () => {
  it('gera um PDF válido (bytes começam com %PDF-)', async () => {
    const buffer = await gerarPdfPessoas([pessoaExemplo])
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('não quebra com lista vazia', async () => {
    const buffer = await gerarPdfPessoas([])
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/exportar-pessoas.test.ts`
Expected: FAIL with "Cannot find module '../exportar-pessoas'"

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/exportar-pessoas.ts
import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type PessoaExportavel = {
  nome: string
  whatsapp: string
  email: string | null
  nascimento: Date | null
  regiao: { nome: string } | null
  profissao: { nome: string } | null
  segmentos: { segmento: { nome: string } }[]
}

function formatarLinha(p: PessoaExportavel) {
  return {
    nome: p.nome,
    whatsapp: p.whatsapp,
    email: p.email ?? '',
    regiao: p.regiao?.nome ?? '',
    profissao: p.profissao?.nome ?? '',
    segmentos: p.segmentos.map((s) => s.segmento.nome).join(', '),
    nascimento: p.nascimento ? p.nascimento.toLocaleDateString('pt-BR') : '',
  }
}

export async function gerarExcelPessoas(pessoas: PessoaExportavel[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Pessoas')
  sheet.columns = [
    { header: 'Nome', key: 'nome', width: 30 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'E-mail', key: 'email', width: 28 },
    { header: 'Região', key: 'regiao', width: 20 },
    { header: 'Profissão', key: 'profissao', width: 20 },
    { header: 'Segmentos', key: 'segmentos', width: 30 },
    { header: 'Nascimento', key: 'nascimento', width: 14 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const p of pessoas) sheet.addRow(formatarLinha(p))
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

const COLUNAS = [
  { chave: 'nome' as const, titulo: 'Nome', largura: 140 },
  { chave: 'whatsapp' as const, titulo: 'WhatsApp', largura: 90 },
  { chave: 'regiao' as const, titulo: 'Região', largura: 80 },
  { chave: 'profissao' as const, titulo: 'Profissão', largura: 90 },
  { chave: 'nascimento' as const, titulo: 'Nascimento', largura: 70 },
]

export async function gerarPdfPessoas(pessoas: PessoaExportavel[]): Promise<Buffer> {
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

  pagina.drawText('Pessoas filtradas', { x: margem, y, size: 14, font: fonteBold })
  y -= alturaLinha * 1.5
  desenharCabecalho()

  for (const p of pessoas) {
    if (y < margem + alturaLinha) {
      novaPagina()
      desenharCabecalho()
    }
    const linha = formatarLinha(p)
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/exportar-pessoas.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/exportar-pessoas.ts src/lib/__tests__/exportar-pessoas.test.ts
git commit -m "feat: geração de PDF (pdf-lib) e Excel (exceljs) de Pessoas exportadas"
```

---

### Task 4: `src/lib/rede.ts` — coleta recursiva da sub-rede do mobilizador

**Files:**
- Create: `src/lib/rede.ts`

**Interfaces:**
- Produces: `coletarSubRedeIds(pessoaId: string, gabineteId: string): Promise<string[]>`

**Não tem teste automatizado** — depende de uma conexão real com o Postgres (CTE recursiva via `$queryRaw`), e este projeto não tem infraestrutura de teste com banco de dados (só `src/lib` com funções puras é testado hoje). Verificação é manual (Step 3).

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/rede.ts
import { prisma } from './prisma'

// Retorna todos os pessoaId da sub-árvore de indicações de um mobilizador —
// indicados diretos E indicados de indicados, recursivamente. Prisma não
// suporta consulta recursiva nativamente, por isso usamos uma CTE em SQL
// bruto. A recursão percorre a estrutura de VinculoRede independente do
// deletedAt de Pessoa — quem consome o resultado (buildWherePessoas) já
// filtra pessoas soft-deletadas na consulta final.
export async function coletarSubRedeIds(pessoaId: string, gabineteId: string): Promise<string[]> {
  const resultado = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE sub_rede AS (
      SELECT id FROM "Pessoa" WHERE id = ${pessoaId} AND "gabineteId" = ${gabineteId}
      UNION ALL
      SELECT p.id
      FROM "Pessoa" p
      INNER JOIN "VinculoRede" v ON v."pessoaId" = p.id
      INNER JOIN sub_rede sr ON v."indicadoPorId" = sr.id
      WHERE v."gabineteId" = ${gabineteId} AND v."deletedAt" IS NULL
    )
    SELECT id FROM sub_rede WHERE id != ${pessoaId}
  `
  return resultado.map((r) => r.id)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 3: Manual verification (documented for later, executed together with Task 7)**

Não dá para verificar isoladamente sem uma tela que chame a função — a verificação real acontece no Task 7, ao testar a aba Pessoas do mobilizador com uma rede de pelo menos 2 níveis (um indicado que por sua vez indicou outra pessoa) e confirmar que o indicado de segundo nível aparece na listagem.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rede.ts
git commit -m "feat: coletarSubRedeIds — CTE recursiva pra sub-árvore de indicações do mobilizador"
```

---

### Task 5: Ligar o ícone da lupa no Topbar

**Files:**
- Modify: `src/components/admin/Topbar.tsx`
- Modify: `src/app/[slug]/admin/layout.tsx`
- Modify: `src/app/[slug]/mobilizador/layout.tsx`

**Interfaces:**
- Produces: prop `filtrosHref?: string` em `Topbar`

- [ ] **Step 1: Replace Topbar.tsx entirely**

```tsx
// src/components/admin/Topbar.tsx
import Link from 'next/link'
import Avatar from './Avatar'
import LiveClock from './LiveClock'

export default function Topbar({
  usuarioNome,
  usuarioFotoUrl,
  perfilHref,
  filtrosHref,
}: {
  usuarioNome: string
  usuarioFotoUrl: string | null
  perfilHref?: string
  filtrosHref?: string
}) {
  const perfilBloco = (
    <div className="flex items-center gap-2">
      <Avatar fotoUrl={usuarioFotoUrl} nome={usuarioNome} size={28} />
      <span className="text-sm hidden sm:inline text-[#494949]">{usuarioNome}</span>
    </div>
  )

  const lupa = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0">
      <circle cx="8.5" cy="8.5" r="6" stroke="#979797" strokeWidth="1.8" />
      <path d="M13.3 13.3 18 18" stroke="#979797" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
        {filtrosHref ? (
          <Link href={filtrosHref} aria-label="Abrir filtros" className="shrink-0 hover:opacity-70">
            {lupa}
          </Link>
        ) : (
          lupa
        )}
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

- [ ] **Step 2: Wire `filtrosHref` in `src/app/[slug]/admin/layout.tsx`**

Find this line:
```tsx
          <Topbar usuarioNome={usuarioNome} usuarioFotoUrl={usuarioFotoUrl} />
```

Replace with:
```tsx
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
            filtrosHref={`/${params.slug}/admin/filtros`}
          />
```

- [ ] **Step 3: Wire `filtrosHref` in `src/app/[slug]/mobilizador/layout.tsx`**

Find this block:
```tsx
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
            perfilHref={`/${params.slug}/mobilizador/perfil`}
          />
```

Replace with:
```tsx
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
            perfilHref={`/${params.slug}/mobilizador/perfil`}
            filtrosHref={`/${params.slug}/mobilizador/filtros`}
          />
```

- [ ] **Step 4: Verify TypeScript compiles and dev server has no console errors**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (the routes `/admin/filtros` and `/mobilizador/filtros` don't exist yet — that's fine, the link just 404s until Tasks 6/7 land; verify visually that the lupa is now clickable and doesn't look broken)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/Topbar.tsx "src/app/[slug]/admin/layout.tsx" "src/app/[slug]/mobilizador/layout.tsx"
git commit -m "feat: ícone de lupa do Topbar agora abre a tela de filtros"
```

---

### Task 6: Tela de filtros do admin — casca de abas + aba Pessoas

**Files:**
- Create: `src/app/[slug]/admin/filtros/FiltrosTabs.tsx`
- Create: `src/app/[slug]/admin/filtros/PessoasFiltro.tsx`
- Create: `src/app/[slug]/admin/filtros/page.tsx`

**Interfaces:**
- Consumes: `buildWherePessoas`, `aplicarFiltrosPosConsulta`, `FiltrosPessoasParams` (Task 2); `paginar` de `@/lib/paginacao` (já existe); `Pagination` de `@/components/admin/Pagination` (já existe); `corTextoContraste` não é necessário aqui (todos os botões usam texto branco fixo, como o padrão já usado em botões primários do sistema)
- Produces: componente `FiltrosTabs` e `PessoasFiltro`, reaproveitados pelo Task 7 (mobilizador)

- [ ] **Step 1: Create `FiltrosTabs.tsx`**

```tsx
// src/app/[slug]/admin/filtros/FiltrosTabs.tsx
import Link from 'next/link'

type Aba = { chave: string; label: string; href?: string }

export default function FiltrosTabs({
  abas,
  abaAtiva,
  corPrimaria,
}: {
  abas: Aba[]
  abaAtiva: string
  corPrimaria: string
}) {
  return (
    <div className="flex gap-2 border-b border-gray-200">
      {abas.map((aba) => {
        const ativa = aba.chave === abaAtiva
        if (!aba.href) {
          return (
            <span
              key={aba.chave}
              className="px-4 py-2 text-sm text-gray-300 cursor-not-allowed"
              title="Em breve"
            >
              {aba.label}
            </span>
          )
        }
        return (
          <Link
            key={aba.chave}
            href={aba.href}
            style={ativa ? { borderColor: corPrimaria, color: corPrimaria } : undefined}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              ativa ? '' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {aba.label}
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create `PessoasFiltro.tsx`**

```tsx
// src/app/[slug]/admin/filtros/PessoasFiltro.tsx
import Pagination from '@/components/admin/Pagination'

type PessoaLinha = {
  id: string
  nome: string
  whatsapp: string
  email: string | null
  nascimento: Date | null
  regiao: { nome: string } | null
  profissao: { nome: string } | null
  segmentos: { segmento: { nome: string } }[]
}

export default function PessoasFiltro({
  baseHref,
  exportarHref,
  searchParams,
  pessoas,
  totalFiltrado,
  paginaAtual,
  tamanhoPagina,
  regioes,
  profissoes,
  segmentos,
  corPrimaria,
}: {
  baseHref: string
  exportarHref: string
  searchParams: Record<string, string | undefined>
  pessoas: PessoaLinha[]
  totalFiltrado: number
  paginaAtual: number
  tamanhoPagina: number
  regioes: { id: string; nome: string }[]
  profissoes: { id: string; nome: string }[]
  segmentos: { id: string; nome: string }[]
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
          <label className="block text-xs font-medium text-gray-600">Aniversário</label>
          <select name="aniversario" defaultValue={searchParams.aniversario ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="dia">Hoje</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mês</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Sexo</label>
          <select name="genero" defaultValue={searchParams.genero ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
            <option value="outro">Outro</option>
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
        <div>
          <label className="block text-xs font-medium text-gray-600">Profissão</label>
          <select name="profissaoId" defaultValue={searchParams.profissaoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {profissoes.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Segmento</label>
          <select name="segmentoId" defaultValue={searchParams.segmentoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {segmentos.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Idade mín.</label>
          <input type="number" name="idadeMin" min={0} defaultValue={searchParams.idadeMin ?? ''} className="mt-1 w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Idade máx.</label>
          <input type="number" name="idadeMax" min={0} defaultValue={searchParams.idadeMax ?? ''} className="mt-1 w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria }}
          className="text-white text-sm px-4 py-1.5 rounded-md font-medium hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} pessoa(s) encontrada(s)</p>
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
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">WhatsApp</th>
              <th className="py-2 pr-3">Região</th>
              <th className="py-2 pr-3">Profissão</th>
              <th className="py-2 pr-3">Segmentos</th>
              <th className="py-2 pr-3">Nascimento</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-2 pr-3">{p.nome}</td>
                <td className="py-2 pr-3">{p.whatsapp}</td>
                <td className="py-2 pr-3">{p.regiao?.nome ?? '—'}</td>
                <td className="py-2 pr-3">{p.profissao?.nome ?? '—'}</td>
                <td className="py-2 pr-3">{p.segmentos.map((s) => s.segmento.nome).join(', ') || '—'}</td>
                <td className="py-2 pr-3">{p.nascimento ? p.nascimento.toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            ))}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">Nenhuma pessoa encontrada com esses filtros.</td>
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

- [ ] **Step 3: Create `page.tsx`**

```tsx
// src/app/[slug]/admin/filtros/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWherePessoas, aplicarFiltrosPosConsulta, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { paginar } from '@/lib/paginacao'
import FiltrosTabs from './FiltrosTabs'
import PessoasFiltro from './PessoasFiltro'

const TAMANHO_PAGINA = 20

export default async function AdminFiltrosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const filtros: FiltrosPessoasParams = {
    genero: searchParams.genero,
    regiaoId: searchParams.regiaoId,
    profissaoId: searchParams.profissaoId,
    segmentoId: searchParams.segmentoId,
    aniversario: searchParams.aniversario as 'dia' | 'semana' | 'mes' | undefined,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
  }

  const where = buildWherePessoas(gabinete.id, filtros)
  const candidatas = await prisma.pessoa.findMany({
    where,
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      nascimento: true,
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      segmentos: { select: { segmento: { select: { nome: true } } } },
    },
  })
  const filtradas = aplicarFiltrosPosConsulta(candidatas, filtros, new Date())

  const pagina = Number(searchParams.page ?? 1)
  const { skip, take } = paginar(filtradas.length, pagina, TAMANHO_PAGINA)
  const pessoasPagina = filtradas.slice(skip, skip + take)

  const [regioes, profissoes, segmentos] = await Promise.all([
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.profissao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.segmento.findMany({ where: { gabineteId: gabinete.id, status: 'ativo' }, orderBy: { nome: 'asc' } }),
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
          { chave: 'demandas', label: 'Demandas' },
          { chave: 'banco-talentos', label: 'Banco de Talentos' },
        ]}
        abaAtiva="pessoas"
        corPrimaria={gabinete.corPrimaria}
      />
      <PessoasFiltro
        baseHref={`/${params.slug}/admin/filtros`}
        exportarHref={`/api/${params.slug}/filtros/pessoas/exportar`}
        searchParams={searchParams}
        pessoas={pessoasPagina}
        totalFiltrado={filtradas.length}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        regioes={regioes}
        profissoes={profissoes}
        segmentos={segmentos}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 5: Manual verification**

Start dev server, log in as admin, click the lupa icon, confirm `/[slug]/admin/filtros` loads with the Pessoas tab active, filters submit via the URL (query string changes), and the table shows matching pessoas. The export links will 404 until Task 8 — that's expected at this point.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/filtros"
git commit -m "feat: tela de filtros do admin — casca de abas + aba Pessoas"
```

---

### Task 7: Tela de filtros do mobilizador — aba Pessoas escopada à própria rede

**Files:**
- Create: `src/app/[slug]/mobilizador/filtros/page.tsx`

**Interfaces:**
- Consumes: `assertMobilizadorAccess` de `@/lib/assert-mobilizador-access` (já existe); `coletarSubRedeIds` (Task 4); `buildWherePessoas`, `aplicarFiltrosPosConsulta` (Task 2); `FiltrosTabs`, `PessoasFiltro` (Task 6, importados de `../../admin/filtros/`)

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/[slug]/mobilizador/filtros/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import { buildWherePessoas, aplicarFiltrosPosConsulta, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { paginar } from '@/lib/paginacao'
import FiltrosTabs from '../../admin/filtros/FiltrosTabs'
import PessoasFiltro from '../../admin/filtros/PessoasFiltro'

const TAMANHO_PAGINA = 20

export default async function MobilizadorFiltrosPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const resultado = await assertMobilizadorAccess(params.slug).catch(() => null)
  if (!resultado) notFound()
  const { gabinete, pessoa } = resultado

  const idsRede = await coletarSubRedeIds(pessoa.id, gabinete.id)

  const filtros: FiltrosPessoasParams = {
    genero: searchParams.genero,
    regiaoId: searchParams.regiaoId,
    profissaoId: searchParams.profissaoId,
    segmentoId: searchParams.segmentoId,
    aniversario: searchParams.aniversario as 'dia' | 'semana' | 'mes' | undefined,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
  }

  const where = buildWherePessoas(gabinete.id, filtros, idsRede)
  const candidatas = await prisma.pessoa.findMany({
    where,
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      nascimento: true,
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      segmentos: { select: { segmento: { select: { nome: true } } } },
    },
  })
  const filtradas = aplicarFiltrosPosConsulta(candidatas, filtros, new Date())

  const pagina = Number(searchParams.page ?? 1)
  const { skip, take } = paginar(filtradas.length, pagina, TAMANHO_PAGINA)
  const pessoasPagina = filtradas.slice(skip, skip + take)

  const [regioes, profissoes, segmentos] = await Promise.all([
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.profissao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.segmento.findMany({ where: { gabineteId: gabinete.id, status: 'ativo' }, orderBy: { nome: 'asc' } }),
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
          { chave: 'demandas', label: 'Demandas' },
        ]}
        abaAtiva="pessoas"
        corPrimaria={gabinete.corPrimaria}
      />
      <PessoasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros`}
        exportarHref={`/api/${params.slug}/filtros/pessoas/exportar`}
        searchParams={searchParams}
        pessoas={pessoasPagina}
        totalFiltrado={filtradas.length}
        paginaAtual={pagina}
        tamanhoPagina={TAMANHO_PAGINA}
        regioes={regioes}
        profissoes={profissoes}
        segmentos={segmentos}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 3: Manual verification (also verifies Task 4)**

Log in as a mobilizador who has at least one 2-level-deep indication (A indicou B, B indicou C). Open `/[slug]/mobilizador/filtros`, confirm C (the second-level indication) shows up in the unfiltered list — this proves `coletarSubRedeIds` is walking the full recursive tree, not just direct indications. Confirm a mobilizador from a *different* branch of the network does NOT see pessoas outside their own sub-tree.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/mobilizador/filtros"
git commit -m "feat: tela de filtros do mobilizador — aba Pessoas escopada à sub-rede"
```

---

### Task 8: API Route de exportação — PDF e Excel

**Files:**
- Create: `src/app/api/[slug]/filtros/pessoas/exportar/route.ts`

**Interfaces:**
- Consumes: `assertAdminAccess` (existe), `assertMobilizadorAccess` (existe), `coletarSubRedeIds` (Task 4), `buildWherePessoas`, `aplicarFiltrosPosConsulta`, `FiltrosPessoasParams` (Task 2), `gerarPdfPessoas`, `gerarExcelPessoas` (Task 3)

- [ ] **Step 1: Create `route.ts`**

```typescript
// src/app/api/[slug]/filtros/pessoas/exportar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import { buildWherePessoas, aplicarFiltrosPosConsulta, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { gerarPdfPessoas, gerarExcelPessoas } from '@/lib/exportar-pessoas'

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  let gabineteId: string
  let idsRede: string[] | undefined

  try {
    const { gabinete } = await assertAdminAccess(params.slug)
    gabineteId = gabinete.id
  } catch {
    try {
      const { gabinete, pessoa } = await assertMobilizadorAccess(params.slug)
      gabineteId = gabinete.id
      idsRede = await coletarSubRedeIds(pessoa.id, gabinete.id)
    } catch {
      return new NextResponse('Não autorizado', { status: 403 })
    }
  }

  const sp = request.nextUrl.searchParams
  const filtros: FiltrosPessoasParams = {
    genero: sp.get('genero') ?? undefined,
    regiaoId: sp.get('regiaoId') ?? undefined,
    profissaoId: sp.get('profissaoId') ?? undefined,
    segmentoId: sp.get('segmentoId') ?? undefined,
    aniversario: (sp.get('aniversario') as 'dia' | 'semana' | 'mes' | null) ?? undefined,
    idadeMin: sp.get('idadeMin') ?? undefined,
    idadeMax: sp.get('idadeMax') ?? undefined,
  }
  const formato = sp.get('formato')

  const where = buildWherePessoas(gabineteId, filtros, idsRede)
  const candidatas = await prisma.pessoa.findMany({
    where,
    orderBy: { nome: 'asc' },
    select: {
      nome: true,
      whatsapp: true,
      email: true,
      nascimento: true,
      regiao: { select: { nome: true } },
      profissao: { select: { nome: true } },
      segmentos: { select: { segmento: { select: { nome: true } } } },
    },
  })
  const pessoas = aplicarFiltrosPosConsulta(candidatas, filtros, new Date())

  if (formato === 'excel') {
    const buffer = await gerarExcelPessoas(pessoas)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="pessoas_filtradas.xlsx"',
      },
    })
  }

  const buffer = await gerarPdfPessoas(pessoas)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pessoas_filtradas.pdf"',
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 3: Manual verification**

On `/[slug]/admin/filtros` (and `/[slug]/mobilizador/filtros`), apply a filter and click "Exportar PDF" — confirm a valid PDF downloads and opens with the filtered rows. Click "Exportar Excel" — confirm a valid `.xlsx` downloads and opens with a header row + one row per pessoa. As a mobilizador, confirm the exported file only contains pessoas from their own network (not the whole gabinete).

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all `src/lib/__tests__` tests pass (pre-existing `email.test.ts` failures due to missing `RESEND_API_KEY` are expected and unrelated)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/[slug]/filtros/pessoas/exportar"
git commit -m "feat: API Route de exportação de Pessoas em PDF ou Excel"
```
