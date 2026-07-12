# Dashboard "Dados Gerais" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o bug de `deletedAt` no dashboard admin já existente, torná-lo a tela inicial (admin e mobilizador), e adicionar cards de região + 5 gráficos de pizza clicáveis (Demandas/Sexo/Faixa etária/Escolaridade/Religião), com o dashboard inteiro reagindo aos mesmos parâmetros de filtro da Central de Filtros via URL.

**Architecture:** Um componente compartilhado `DashboardConteudo.tsx` (Server Component, sem `'use client'` — toda interatividade é link, não estado) recebe dados já computados (contagens, `groupBy`) via props e monta toda a UI (cards, tabelas, pizzas), incluindo a construção de cada `href` de clique-para-filtrar. `admin/dashboard/page.tsx` e (novo) `mobilizador/dashboard/page.tsx` só fazem a busca de dados — cada um com seu próprio escopo (gabinete inteiro vs. sub-rede) — e passam pra esse componente único, mesmo padrão já usado em `DemandasFiltro.tsx`/`BancoTalentosFiltro.tsx` (componente compartilhado sob `admin/`, importado por `mobilizador/` via caminho relativo).

**Tech Stack:** Next.js 14 App Router, Prisma, CSS `conic-gradient` pra pizza (sem lib nova, mesmo espírito do `GraficoDemandas` já existente).

## Global Constraints

- Todo card/gráfico do dashboard reflete os mesmos parâmetros de URL que a Central de Filtros usa (`regiaoId`, `genero`, `idadeMin`/`idadeMax`, `segmentoId`, `escolaridade`, `religiao`) — sem barra de filtro própria no dashboard.
- Cores de status de Demanda são as já reservadas no sistema (`statusDemandaPill`/`GraficoDemandas`), nunca recicladas: atendida `#6E9924`, não atendida `#B80000`, aberta/pendente `#CBB100`, expirada `#FB923C` (Tailwind `orange-400`, mesma cor já usada em `GraficoDemandas`).
- Cores categóricas (Sexo/Faixa etária/Escolaridade/Religião) usam a paleta validada do skill de dataviz do projeto (`references/palette.md`), em ordem fixa, nunca ciclada: `#2a78d6`, `#1baf7a`, `#eda100`, `#008300`, `#4a3aa7`, `#e34948`, `#e87ba4`, `#eb6834`. "Outros"/"Não informado" usam o tom neutro `#898781`, nunca uma cor da paleta, e **nunca são clicáveis** (não existe filtro correspondente pra esses valores hoje).
- Faixas etárias: `16-24`, `25-34`, `35-44`, `45-59`, `60+`.
- Religião/Escolaridade continuam texto livre (sem normalização de grafia) — agrupamento pro gráfico usa os 5 valores mais frequentes + "Outros" (resto) + "Não informado" (nulo/vazio).
- Demandas do gráfico de pizza usam a mesma janela "mês atual" já usada pelo `GraficoDemandas` existente (`inicioMes`/`fimMes`), não o seletor de período (hoje/7dias/30dias) — mesmo comportamento já estabelecido, só reaproveitado.
- **Lição de sessões anteriores**: `tsc --noEmit` e `vitest` NÃO pegam erros de ESLint (`next build` os pega, e o build Docker falha se houver erro de lint). Todo task desta plano precisa rodar `npm run build` completo antes do commit.
- Nenhuma mudança de comportamento na Central de Filtros já em produção além da adição dos 2 filtros novos (escolaridade/religião) — todos os filtros existentes continuam idênticos.

---

### Task 1: Helpers puros — `faixa-etaria.ts` e `agrupar-top-outros.ts`

**Files:**
- Create: `src/lib/faixa-etaria.ts`
- Test: `src/lib/__tests__/faixa-etaria.test.ts`
- Create: `src/lib/agrupar-top-outros.ts`
- Test: `src/lib/__tests__/agrupar-top-outros.test.ts`

**Interfaces:**
- Produces: `calcularFaixaEtaria(idade: number): string` — reaproveitado pela Task 4 (dashboard)
- Produces: `agruparTopEOutros(contagens: {chave: string | null; contagem: number}[], limite: number): {chave: string; contagem: number}[]` (type `FatiaAgrupada` exportado) — reaproveitado pela Task 4

- [ ] **Step 1: Escrever os testes de `faixa-etaria.ts` (falhando)**

Crie `src/lib/__tests__/faixa-etaria.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calcularFaixaEtaria } from '../faixa-etaria'

describe('calcularFaixaEtaria', () => {
  it('16-24', () => {
    expect(calcularFaixaEtaria(16)).toBe('16-24')
    expect(calcularFaixaEtaria(24)).toBe('16-24')
  })

  it('25-34', () => {
    expect(calcularFaixaEtaria(25)).toBe('25-34')
    expect(calcularFaixaEtaria(34)).toBe('25-34')
  })

  it('35-44', () => {
    expect(calcularFaixaEtaria(35)).toBe('35-44')
    expect(calcularFaixaEtaria(44)).toBe('35-44')
  })

  it('45-59', () => {
    expect(calcularFaixaEtaria(45)).toBe('45-59')
    expect(calcularFaixaEtaria(59)).toBe('45-59')
  })

  it('60+', () => {
    expect(calcularFaixaEtaria(60)).toBe('60+')
    expect(calcularFaixaEtaria(90)).toBe('60+')
  })

  it('limites exatos entre faixas', () => {
    expect(calcularFaixaEtaria(24)).toBe('16-24')
    expect(calcularFaixaEtaria(25)).toBe('25-34')
    expect(calcularFaixaEtaria(34)).toBe('25-34')
    expect(calcularFaixaEtaria(35)).toBe('35-44')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/faixa-etaria.test.ts`
Expected: FAIL — `Cannot find module '../faixa-etaria'`

- [ ] **Step 3: Criar `src/lib/faixa-etaria.ts`**

```typescript
export function calcularFaixaEtaria(idade: number): string {
  if (idade < 25) return '16-24'
  if (idade < 35) return '25-34'
  if (idade < 45) return '35-44'
  if (idade < 60) return '45-59'
  return '60+'
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/faixa-etaria.test.ts`
Expected: PASS — 6/6 testes

- [ ] **Step 5: Escrever os testes de `agrupar-top-outros.ts` (falhando)**

Crie `src/lib/__tests__/agrupar-top-outros.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { agruparTopEOutros } from '../agrupar-top-outros'

describe('agruparTopEOutros', () => {
  it('mantém todos os valores quando estão dentro do limite', () => {
    const resultado = agruparTopEOutros(
      [
        { chave: 'Católica', contagem: 10 },
        { chave: 'Evangélica', contagem: 8 },
      ],
      5
    )
    expect(resultado).toEqual([
      { chave: 'Católica', contagem: 10 },
      { chave: 'Evangélica', contagem: 8 },
    ])
  })

  it('ordena do maior pro menor', () => {
    const resultado = agruparTopEOutros(
      [
        { chave: 'B', contagem: 3 },
        { chave: 'A', contagem: 10 },
      ],
      5
    )
    expect(resultado.map((r) => r.chave)).toEqual(['A', 'B'])
  })

  it('agrupa o excedente em "Outros"', () => {
    const resultado = agruparTopEOutros(
      [
        { chave: 'A', contagem: 10 },
        { chave: 'B', contagem: 8 },
        { chave: 'C', contagem: 5 },
        { chave: 'D', contagem: 2 },
      ],
      2
    )
    expect(resultado).toEqual([
      { chave: 'A', contagem: 10 },
      { chave: 'B', contagem: 8 },
      { chave: 'Outros', contagem: 7 },
    ])
  })

  it('agrupa null e string vazia em "Não informado"', () => {
    const resultado = agruparTopEOutros(
      [
        { chave: 'A', contagem: 10 },
        { chave: null, contagem: 3 },
        { chave: '', contagem: 2 },
      ],
      5
    )
    expect(resultado).toEqual([
      { chave: 'A', contagem: 10 },
      { chave: 'Não informado', contagem: 5 },
    ])
  })

  it('sem excedente, não gera fatia "Outros"', () => {
    const resultado = agruparTopEOutros([{ chave: 'A', contagem: 10 }], 5)
    expect(resultado.find((r) => r.chave === 'Outros')).toBeUndefined()
  })

  it('sem valores não informados, não gera fatia "Não informado"', () => {
    const resultado = agruparTopEOutros([{ chave: 'A', contagem: 10 }], 5)
    expect(resultado.find((r) => r.chave === 'Não informado')).toBeUndefined()
  })

  it('lista vazia retorna lista vazia', () => {
    expect(agruparTopEOutros([], 5)).toEqual([])
  })
})
```

- [ ] **Step 6: Rodar e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/agrupar-top-outros.test.ts`
Expected: FAIL — `Cannot find module '../agrupar-top-outros'`

- [ ] **Step 7: Criar `src/lib/agrupar-top-outros.ts`**

```typescript
export type FatiaAgrupada = { chave: string; contagem: number }

export function agruparTopEOutros(
  contagens: { chave: string | null; contagem: number }[],
  limite: number
): FatiaAgrupada[] {
  const naoInformado = contagens.filter((c) => !c.chave || !c.chave.trim())
  const informado = contagens
    .filter((c) => c.chave && c.chave.trim())
    .sort((a, b) => b.contagem - a.contagem)

  const totalNaoInformado = naoInformado.reduce((acc, c) => acc + c.contagem, 0)
  const top = informado.slice(0, limite)
  const resto = informado.slice(limite)
  const totalResto = resto.reduce((acc, c) => acc + c.contagem, 0)

  const resultado: FatiaAgrupada[] = top.map((c) => ({ chave: c.chave as string, contagem: c.contagem }))
  if (totalResto > 0) resultado.push({ chave: 'Outros', contagem: totalResto })
  if (totalNaoInformado > 0) resultado.push({ chave: 'Não informado', contagem: totalNaoInformado })
  return resultado
}
```

- [ ] **Step 8: Rodar e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/agrupar-top-outros.test.ts`
Expected: PASS — 7/7 testes

- [ ] **Step 9: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos (erros pré-existentes em arquivos de teste de exportação, não relacionados — ignore-os)

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 10: Commit**

```bash
git add src/lib/faixa-etaria.ts src/lib/__tests__/faixa-etaria.test.ts \
  src/lib/agrupar-top-outros.ts src/lib/__tests__/agrupar-top-outros.test.ts
git commit -m "feat: helpers calcularFaixaEtaria e agruparTopEOutros"
```

---

### Task 2: Cores e componente `GraficoPizza`

**Files:**
- Create: `src/lib/cores-graficos.ts`
- Create: `src/components/GraficoPizza.tsx`

**Interfaces:**
- Produces: `PALETA_CATEGORICA: string[]`, `COR_NEUTRA: string`, `CORES_STATUS_DEMANDA: Record<string, string>` — reaproveitados pela Task 4
- Produces: `GraficoPizza` component, `FatiaPizza` type (`{ chave: string; label: string; valor: number; cor: string; href?: string }`) — reaproveitado pela Task 4

Sem teste automatizado — mesmo padrão de `GraficoDemandas.tsx` (componente de apresentação, sem teste no projeto).

- [ ] **Step 1: Criar `src/lib/cores-graficos.ts`**

```typescript
// Paleta categórica validada (skill de dataviz do projeto,
// references/palette.md) — ordem fixa, nunca ciclada.
export const PALETA_CATEGORICA = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
]

// "Outros"/"Não informado" usam esse tom neutro — nunca competem por
// uma cor da paleta categórica.
export const COR_NEUTRA = '#898781'

// Cores de status já reservadas no sistema (mesmas de statusDemandaPill
// em src/lib/status-demanda.ts e GraficoDemandas) — nunca reciclar pra
// outra dimensão.
export const CORES_STATUS_DEMANDA: Record<string, string> = {
  atendida: '#6E9924',
  nao_atendida: '#B80000',
  aberta: '#CBB100',
  expirada: '#FB923C',
}
```

- [ ] **Step 2: Criar `src/components/GraficoPizza.tsx`**

```tsx
export type FatiaPizza = {
  chave: string
  label: string
  valor: number
  cor: string
  href?: string
}

export function GraficoPizza({ titulo, fatias }: { titulo: string; fatias: FatiaPizza[] }) {
  const total = fatias.reduce((acc, f) => acc + f.valor, 0)
  let acumulado = 0
  const stops = fatias.map((f) => {
    const inicio = total > 0 ? (acumulado / total) * 360 : 0
    acumulado += f.valor
    const fim = total > 0 ? (acumulado / total) * 360 : 0
    return `${f.cor} ${inicio}deg ${fim}deg`
  })
  const gradiente = total > 0 ? `conic-gradient(${stops.join(', ')})` : '#e1e0d9'

  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-3">{titulo}</h2>
      {total === 0 ? (
        <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="w-28 h-28 rounded-full shrink-0" style={{ background: gradiente }} aria-hidden />
          <ul className="flex-1 space-y-1.5 text-sm">
            {fatias.map((f) => {
              const conteudo = (
                <span className="flex items-center justify-between gap-2 w-full">
                  <span className="flex items-center gap-2 text-gray-700">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.cor }} aria-hidden />
                    {f.label}
                  </span>
                  <span className="font-medium text-gray-900">{f.valor}</span>
                </span>
              )
              return (
                <li key={f.chave}>
                  {f.href ? (
                    <a href={f.href} className="flex hover:underline">
                      {conteudo}
                    </a>
                  ) : (
                    <div className="flex">{conteudo}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 4: Commit**

```bash
git add src/lib/cores-graficos.ts src/components/GraficoPizza.tsx
git commit -m "feat: cores de gráficos + componente GraficoPizza reaproveitável"
```

---

### Task 3: Central de Filtros — filtros de Escolaridade e Religião

**Files:**
- Modify: `src/lib/filtros-pessoas.ts`
- Modify: `src/lib/__tests__/filtros-pessoas.test.ts`
- Modify: `src/app/[slug]/admin/filtros/PessoasFiltro.tsx`
- Modify: `src/app/[slug]/admin/filtros/page.tsx`
- Modify: `src/app/[slug]/mobilizador/filtros/page.tsx`

**Interfaces:**
- Produces: `FiltrosPessoasParams.escolaridade?: string`, `FiltrosPessoasParams.religiao?: string` — reaproveitados pela Task 4 (dashboard)

- [ ] **Step 1: Adicionar os testes (falhando) em `src/lib/__tests__/filtros-pessoas.test.ts`**

Adicione ao final do `describe('buildWherePessoas', ...)`:

```typescript
  it('filtra por escolaridade', () => {
    const where = buildWherePessoas('gab-1', { escolaridade: 'Superior completo' })
    expect(where.escolaridade).toBe('Superior completo')
  })

  it('sem filtro de escolaridade, não aplica', () => {
    const where = buildWherePessoas('gab-1', {})
    expect(where.escolaridade).toBeUndefined()
  })

  it('filtra por religião', () => {
    const where = buildWherePessoas('gab-1', { religiao: 'Católica' })
    expect(where.religiao).toBe('Católica')
  })

  it('sem filtro de religião, não aplica', () => {
    const where = buildWherePessoas('gab-1', {})
    expect(where.religiao).toBeUndefined()
  })
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/filtros-pessoas.test.ts`
Expected: FAIL — 4 novos testes falhando (`where.escolaridade`/`where.religiao` não existem no tipo/retorno ainda)

- [ ] **Step 3: Estender `src/lib/filtros-pessoas.ts`**

Troque:

```typescript
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
```

por:

```typescript
export type FiltrosPessoasParams = {
  genero?: string
  regiaoId?: string
  profissaoId?: string
  segmentoId?: string
  aniversario?: 'dia' | 'semana' | 'mes'
  idadeMin?: string
  idadeMax?: string
  escolaridade?: string
  religiao?: string
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
  escolaridade?: string
  religiao?: string
}
```

Troque:

```typescript
  if (params.segmentoId) where.segmentos = { some: { segmentoId: params.segmentoId } }
  if (params.aniversario || params.idadeMin || params.idadeMax) {
    where.nascimento = { not: null }
  }
  return where
}
```

por:

```typescript
  if (params.segmentoId) where.segmentos = { some: { segmentoId: params.segmentoId } }
  if (params.aniversario || params.idadeMin || params.idadeMax) {
    where.nascimento = { not: null }
  }
  if (params.escolaridade) where.escolaridade = params.escolaridade
  if (params.religiao) where.religiao = params.religiao
  return where
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/filtros-pessoas.test.ts`
Expected: PASS — todos os testes, incluindo os 4 novos

- [ ] **Step 5: Adicionar os 2 selects em `PessoasFiltro.tsx`**

Troque a assinatura de props:

```typescript
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
```

por:

```typescript
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
  escolaridades,
  religioes,
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
  escolaridades: string[]
  religioes: string[]
  corPrimaria: string
}) {
```

Troque:

```tsx
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
```

por:

```tsx
        <div>
          <label className="block text-xs font-medium text-gray-600">Idade mín.</label>
          <input type="number" name="idadeMin" min={0} defaultValue={searchParams.idadeMin ?? ''} className="mt-1 w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Idade máx.</label>
          <input type="number" name="idadeMax" min={0} defaultValue={searchParams.idadeMax ?? ''} className="mt-1 w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Escolaridade</label>
          <select name="escolaridade" defaultValue={searchParams.escolaridade ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {escolaridades.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Religião</label>
          <select name="religiao" defaultValue={searchParams.religiao ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {religioes.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
```

- [ ] **Step 6: Buscar e passar `escolaridades`/`religioes` em `admin/filtros/page.tsx`**

Troque:

```typescript
  const filtros: FiltrosPessoasParams = {
    genero: searchParams.genero,
    regiaoId: searchParams.regiaoId,
    profissaoId: searchParams.profissaoId,
    segmentoId: searchParams.segmentoId,
    aniversario: searchParams.aniversario as 'dia' | 'semana' | 'mes' | undefined,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
  }
```

por:

```typescript
  const filtros: FiltrosPessoasParams = {
    genero: searchParams.genero,
    regiaoId: searchParams.regiaoId,
    profissaoId: searchParams.profissaoId,
    segmentoId: searchParams.segmentoId,
    aniversario: searchParams.aniversario as 'dia' | 'semana' | 'mes' | undefined,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
    escolaridade: searchParams.escolaridade,
    religiao: searchParams.religiao,
  }
```

Troque:

```typescript
  const [regioes, profissoes, segmentos] = await Promise.all([
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.profissao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.segmento.findMany({ where: { gabineteId: gabinete.id, status: 'ativo' }, orderBy: { nome: 'asc' } }),
  ])
```

por:

```typescript
  const [regioes, profissoes, segmentos, escolaridadesRaw, religioesRaw] = await Promise.all([
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.profissao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    prisma.segmento.findMany({ where: { gabineteId: gabinete.id, status: 'ativo' }, orderBy: { nome: 'asc' } }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, deletedAt: null, escolaridade: { not: null } },
      select: { escolaridade: true },
      distinct: ['escolaridade'],
      orderBy: { escolaridade: 'asc' },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, deletedAt: null, religiao: { not: null } },
      select: { religiao: true },
      distinct: ['religiao'],
      orderBy: { religiao: 'asc' },
    }),
  ])
  const escolaridades = escolaridadesRaw.map((e) => e.escolaridade as string)
  const religioes = religioesRaw.map((r) => r.religiao as string)
```

Troque o uso do componente `<PessoasFiltro ... segmentos={segmentos} corPrimaria={gabinete.corPrimaria} />` adicionando as duas novas props antes de `corPrimaria`:

```tsx
        segmentos={segmentos}
        escolaridades={escolaridades}
        religioes={religioes}
        corPrimaria={gabinete.corPrimaria}
```

- [ ] **Step 7: Mesma alteração em `mobilizador/filtros/page.tsx`**

Aplique exatamente as mesmas três mudanças do Step 6 (adicionar `escolaridade`/`religiao` em `FiltrosPessoasParams`, buscar `escolaridadesRaw`/`religioesRaw` via `Promise.all`, passar `escolaridades`/`religioes` pro componente) — mesmo padrão, mesmo arquivo-espelho.

- [ ] **Step 8: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 9: Verificação manual**

Suba o servidor de dev, acesse `/[slug]/admin/filtros` e `/[slug]/mobilizador/filtros`, confirme que os selects "Escolaridade" e "Religião" aparecem, populados com os valores já cadastrados no gabinete, e que filtrar por um deles funciona (reduz a lista corretamente).

- [ ] **Step 10: Commit**

```bash
git add src/lib/filtros-pessoas.ts src/lib/__tests__/filtros-pessoas.test.ts \
  "src/app/[slug]/admin/filtros/PessoasFiltro.tsx" \
  "src/app/[slug]/admin/filtros/page.tsx" \
  "src/app/[slug]/mobilizador/filtros/page.tsx"
git commit -m "feat: filtros de Escolaridade e Religião na aba Pessoas da Central de Filtros"
```

---

### Task 4: Dashboard do admin — `DashboardConteudo.tsx` compartilhado + correção do bug + novas seções

**Files:**
- Create: `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`
- Modify: `src/app/[slug]/admin/dashboard/page.tsx`
- Modify: `src/app/[slug]/admin/page.tsx`

**Interfaces:**
- Consumes: `calcularFaixaEtaria`, `agruparTopEOutros`, `type FatiaAgrupada` (Task 1); `PALETA_CATEGORICA`, `COR_NEUTRA`, `CORES_STATUS_DEMANDA`, `GraficoPizza`, `type FatiaPizza` (Task 2); `buildWherePessoas`, `type FiltrosPessoasParams` (Task 3, já estendido)
- Produces: `DashboardConteudo` component — reaproveitado pela Task 5 (dashboard do mobilizador)

Sem teste automatizado — Server Components de orquestração/apresentação, mesmo padrão já aceito pras páginas da Central de Filtros e pelo `GraficoDemandas` existente.

**Nota sobre o bug corrigido**: todas as consultas de `Pessoa` no dashboard atual (exceto a de `Demanda`, que já filtra corretamente) não filtram `deletedAt: null` — pessoas com soft-delete estão sendo contadas. Este task substitui essas consultas por outras que passam por `buildWherePessoas` (que sempre inclui `deletedAt: null`), corrigindo o bug como efeito direto da própria extensão de filtro por URL.

- [ ] **Step 1: Criar `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`**

```tsx
// src/app/[slug]/admin/dashboard/DashboardConteudo.tsx
import { GraficoDemandas } from '@/components/GraficoDemandas'
import { GraficoPizza, type FatiaPizza } from '@/components/GraficoPizza'
import { calcularIdade } from '@/lib/aniversario'
import { calcularFaixaEtaria } from '@/lib/faixa-etaria'
import { agruparTopEOutros } from '@/lib/agrupar-top-outros'
import { PALETA_CATEGORICA, COR_NEUTRA, CORES_STATUS_DEMANDA } from '@/lib/cores-graficos'

type ContagemChave = { chave: string | null; contagem: number }

const LABEL_ORIGEM: Record<string, string> = {
  qrcode: 'QR Code',
  link: 'Link',
  manual: 'Manual',
  indicacao: 'Indicação',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  importacao: 'Importação',
}

function construirHref(
  base: string,
  searchParams: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>,
  excluir: string[]
): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && !excluir.includes(k)) qs.set(k, v)
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v) qs.set(k, v)
  }
  return `${base}?${qs.toString()}`
}

function faixaParaQuery(faixa: string): Record<string, string> {
  if (faixa === '16-24') return { idadeMin: '16', idadeMax: '24' }
  if (faixa === '25-34') return { idadeMin: '25', idadeMax: '34' }
  if (faixa === '35-44') return { idadeMin: '35', idadeMax: '44' }
  if (faixa === '45-59') return { idadeMin: '45', idadeMax: '59' }
  return { idadeMin: '60' }
}

export function DashboardConteudo({
  slug,
  dashboardHref,
  filtrosHref,
  demandasHref,
  searchParams,
  periodo,
  labelPeriodo,
  totalPessoas,
  novasPessoas,
  totalMobilizadores,
  totalEquipe,
  segmentosComContagem,
  rankingMobilizadores,
  pessoasPorOrigem,
  regioes,
  contagemGenero,
  contagemDemandas,
  mesLabel,
  dataInicioStr,
  dataFimStr,
  nascimentos,
  totalSemNascimento,
  escolaridade,
  religiao,
}: {
  slug: string
  dashboardHref: string
  filtrosHref: string
  demandasHref: string
  searchParams: Record<string, string | undefined>
  periodo: string
  labelPeriodo: Record<string, string>
  totalPessoas: number
  novasPessoas: number
  totalMobilizadores: number
  totalEquipe: number
  segmentosComContagem: { nome: string; tipo: string; contagem: number }[]
  rankingMobilizadores: { nome: string; contagem: number }[]
  pessoasPorOrigem: ContagemChave[]
  regioes: { id: string; nome: string; ativa: boolean; contagem: number }[]
  contagemGenero: ContagemChave[]
  contagemDemandas: ContagemChave[]
  mesLabel: string
  dataInicioStr: string
  dataFimStr: string
  nascimentos: Date[]
  totalSemNascimento: number
  escolaridade: ContagemChave[]
  religiao: ContagemChave[]
}) {
  // Demandas — cores de status reservadas, sempre as 4 fatias (mesmo 0)
  const mapaDemandas = Object.fromEntries(contagemDemandas.map((c) => [c.chave, c.contagem]))
  const DEMANDA_STATUS: { chave: string; label: string }[] = [
    { chave: 'atendida', label: 'Atendida' },
    { chave: 'nao_atendida', label: 'Não atendida' },
    { chave: 'aberta', label: 'Pendente' },
    { chave: 'expirada', label: 'Expirada' },
  ]
  const barrasDemandas = DEMANDA_STATUS.map((s) => ({
    status: s.chave,
    label: s.label,
    bgClass:
      s.chave === 'atendida' ? 'bg-green-500' : s.chave === 'nao_atendida' ? 'bg-red-400' : s.chave === 'expirada' ? 'bg-orange-400' : 'bg-yellow-400',
    count: mapaDemandas[s.chave] ?? 0,
    href: `${demandasHref}?status=${s.chave}&dataInicio=${dataInicioStr}&dataFim=${dataFimStr}`,
  }))
  const fatiasDemandas: FatiaPizza[] = DEMANDA_STATUS.map((s) => ({
    chave: s.chave,
    label: s.label,
    valor: mapaDemandas[s.chave] ?? 0,
    cor: CORES_STATUS_DEMANDA[s.chave],
    href: `${demandasHref}?status=${s.chave}&dataInicio=${dataInicioStr}&dataFim=${dataFimStr}`,
  }))

  // Sexo
  const mapaGenero = Object.fromEntries(contagemGenero.map((c) => [c.chave ?? 'nao_informado', c.contagem]))
  const GENEROS: { chave: string; label: string }[] = [
    { chave: 'masculino', label: 'Masculino' },
    { chave: 'feminino', label: 'Feminino' },
    { chave: 'outro', label: 'Outro' },
  ]
  const fatiasSexo: FatiaPizza[] = GENEROS.map((g, i) => ({
    chave: g.chave,
    label: g.label,
    valor: mapaGenero[g.chave] ?? 0,
    cor: PALETA_CATEGORICA[i],
    href: construirHref(filtrosHref, searchParams, { genero: g.chave }, ['periodo', 'inicio', 'fim']),
  }))
  if (mapaGenero['nao_informado']) {
    fatiasSexo.push({ chave: 'nao_informado', label: 'Não informado', valor: mapaGenero['nao_informado'], cor: COR_NEUTRA })
  }

  // Faixa etária
  const hoje = new Date()
  const contagemFaixas: Record<string, number> = {}
  for (const nascimento of nascimentos) {
    const faixa = calcularFaixaEtaria(calcularIdade(nascimento, hoje))
    contagemFaixas[faixa] = (contagemFaixas[faixa] ?? 0) + 1
  }
  const FAIXAS_ORDEM = ['16-24', '25-34', '35-44', '45-59', '60+']
  const fatiasIdade: FatiaPizza[] = FAIXAS_ORDEM.map((faixa, i) => ({
    chave: faixa,
    label: faixa,
    valor: contagemFaixas[faixa] ?? 0,
    cor: PALETA_CATEGORICA[i],
    href: construirHref(filtrosHref, searchParams, faixaParaQuery(faixa), ['periodo', 'inicio', 'fim']),
  }))
  if (totalSemNascimento > 0) {
    fatiasIdade.push({ chave: 'nao_informado', label: 'Não informado', valor: totalSemNascimento, cor: COR_NEUTRA })
  }

  // Escolaridade / Religião (texto livre — top 5 + Outros + Não informado)
  function fatiasTextoLivre(dados: ContagemChave[], campo: 'escolaridade' | 'religiao'): FatiaPizza[] {
    const agrupado = agruparTopEOutros(dados.map((d) => ({ chave: d.chave, contagem: d.contagem })), 5)
    return agrupado.map((f, i) => {
      const especial = f.chave === 'Outros' || f.chave === 'Não informado'
      return {
        chave: f.chave,
        label: f.chave,
        valor: f.contagem,
        cor: especial ? COR_NEUTRA : PALETA_CATEGORICA[i],
        href: especial ? undefined : construirHref(filtrosHref, searchParams, { [campo]: f.chave }, ['periodo', 'inicio', 'fim']),
      }
    })
  }
  const fatiasEscolaridade = fatiasTextoLivre(escolaridade, 'escolaridade')
  const fatiasReligiao = fatiasTextoLivre(religiao, 'religiao')

  // Regiões
  const regioesComHref = regioes.map((r) => ({
    ...r,
    href: construirHref(filtrosHref, searchParams, { regiaoId: r.id }, ['periodo', 'inicio', 'fim']),
  }))

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

        <div className="flex flex-wrap gap-2">
          {(['hoje', '7dias', '30dias'] as const).map((p) => (
            <a
              key={p}
              href={construirHref(dashboardHref, searchParams, { periodo: p }, [])}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              aria-current={periodo === p ? 'true' : undefined}
            >
              {labelPeriodo[p]}
            </a>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 -mt-4">
        Período selecionado: <strong>{labelPeriodo[periodo] ?? periodo}</strong>
      </p>

      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por região</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {regioesComHref.map((r) => (
            <a key={r.id} href={r.href} className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                {r.nome}
                {!r.ativa && <span className="ml-1 normal-case text-gray-400">(desativada)</span>}
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{r.contagem}</p>
            </a>
          ))}
          {regioesComHref.length === 0 && <p className="text-sm text-gray-500">Nenhuma região cadastrada.</p>}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <GraficoPizza titulo="Demandas do mês" fatias={fatiasDemandas} />
        <GraficoPizza titulo="Sexo" fatias={fatiasSexo} />
        <GraficoPizza titulo="Faixa etária" fatias={fatiasIdade} />
        <GraficoPizza titulo="Escolaridade" fatias={fatiasEscolaridade} />
        <GraficoPizza titulo="Religião" fatias={fatiasReligiao} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total pessoas</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalPessoas}</p>
          <p className="text-xs text-gray-400 mt-0.5">estado atual</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Novas no período</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{novasPessoas}</p>
          <p className="text-xs text-gray-400 mt-0.5">{labelPeriodo[periodo]}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Mobilizadores</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{totalMobilizadores}</p>
          <p className="text-xs text-gray-400 mt-0.5">ativos agora</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Colaboradores</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">{totalEquipe}</p>
          <p className="text-xs text-gray-400 mt-0.5">membros</p>
        </div>
      </div>

      <GraficoDemandas barras={barrasDemandas} mesLabel={mesLabel} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por segmento</h2>
          {segmentosComContagem.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum segmento ativo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Segmento</th>
                  <th className="text-left pb-2 text-gray-600 font-medium">Tipo</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {segmentosComContagem.map((s) => (
                  <tr key={s.nome}>
                    <td className="py-2 text-gray-800">{s.nome}</td>
                    <td className="py-2 text-gray-500 capitalize">{s.tipo}</td>
                    <td className="py-2 text-right font-medium text-gray-900">{s.contagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Ranking de mobilizadores</h2>
          <p className="text-xs text-gray-400 mb-3">Convidados no período: {labelPeriodo[periodo]}</p>
          {rankingMobilizadores.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum mobilizador ativo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Mobilizador</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Convidados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rankingMobilizadores.map((m, i) => (
                  <tr key={m.nome}>
                    <td className="py-2 text-gray-800">
                      <span className="text-gray-400 mr-2 font-mono text-xs">{String(i + 1).padStart(2, '0')}</span>
                      {m.nome}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">{m.contagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por origem</h2>
          {pessoasPorOrigem.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Origem</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pessoasPorOrigem.map((o) => (
                  <tr key={o.chave ?? 'null'}>
                    <td className="py-2 text-gray-800">{o.chave ? (LABEL_ORIGEM[o.chave] ?? o.chave) : 'Não informado'}</td>
                    <td className="py-2 text-right font-medium text-gray-900">{o.contagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
```

**Nota:** o seletor de período "personalizado" (form com `inicio`/`fim`) do dashboard original foi removido desta versão — os 3 botões (hoje/7dias/30dias) continuam. Reintroduzi-lo exigiria decidir como ele interage com os novos parâmetros de filtro; ficou fora pra manter esta task focada no que foi especificado. Se sentir falta, é um ajuste pequeno e isolado depois.

- [ ] **Step 2: Substituir `src/app/[slug]/admin/dashboard/page.tsx` inteiro**

```tsx
// src/app/[slug]/admin/dashboard/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { DashboardConteudo } from './DashboardConteudo'

function calcularIntervalo(periodo: string): { dataInicio: Date; dataFim: Date } {
  const agora = new Date()
  const dataFim = new Date(agora)
  dataFim.setHours(23, 59, 59, 999)

  if (periodo === 'hoje') {
    const dataInicio = new Date(agora)
    dataInicio.setHours(0, 0, 0, 0)
    return { dataInicio, dataFim }
  }
  if (periodo === '7dias') {
    const dataInicio = new Date(agora)
    dataInicio.setDate(dataInicio.getDate() - 7)
    dataInicio.setHours(0, 0, 0, 0)
    return { dataInicio, dataFim }
  }
  const dataInicio = new Date(agora)
  dataInicio.setDate(dataInicio.getDate() - 30)
  dataInicio.setHours(0, 0, 0, 0)
  return { dataInicio, dataFim }
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const periodo = searchParams.periodo ?? '30dias'
  const { dataInicio, dataFim } = calcularIntervalo(periodo)

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999)
  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dataInicioStr = inicioMes.toISOString().slice(0, 10)
  const dataFimStr = fimMes.toISOString().slice(0, 10)

  const filtrosPessoas: FiltrosPessoasParams = {
    regiaoId: searchParams.regiaoId,
    genero: searchParams.genero,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
    segmentoId: searchParams.segmentoId,
    escolaridade: searchParams.escolaridade,
    religiao: searchParams.religiao,
  }
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas)

  const [
    totalPessoas,
    novasPessoas,
    totalMobilizadores,
    totalEquipe,
    segmentosRaw,
    mobilizadoresAtivos,
    pessoasPorOrigemRaw,
    regioesRaw,
    pessoasPorGeneroRaw,
    demandasMesRaw,
    escolaridadeRaw,
    religiaoRaw,
    nascimentosPessoas,
    totalSemNascimento,
  ] = await Promise.all([
    prisma.pessoa.count({ where: wherePessoas }),

    prisma.pessoa.count({
      where: { ...wherePessoas, criadoEm: { gte: dataInicio, lte: dataFim } },
    }),

    prisma.pessoa.count({ where: { ...wherePessoas, isMobilizador: true } }),

    prisma.pessoa.count({ where: { ...wherePessoas, isColaborador: true } }),

    prisma.segmento.findMany({
      where: { gabineteId: gabinete.id, status: 'ativo' },
      select: {
        nome: true,
        tipo: true,
        _count: { select: { pessoas: { where: { pessoa: wherePessoas } } } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    prisma.pessoa.findMany({
      where: { ...wherePessoas, isMobilizador: true },
      select: {
        id: true,
        nome: true,
        redesComoIndicador: {
          where: { criadoEm: { gte: dataInicio, lte: dataFim } },
          select: { id: true },
        },
      },
    }),

    prisma.pessoa.groupBy({
      by: ['origem'],
      where: wherePessoas,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id },
      select: {
        id: true,
        nome: true,
        ativa: true,
        _count: { select: { pessoas: { where: wherePessoas } } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    prisma.pessoa.groupBy({
      by: ['genero'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.demanda.groupBy({
      by: ['status'],
      where: {
        gabineteId: gabinete.id,
        deletedAt: null,
        criadoEm: { gte: inicioMes, lte: fimMes },
        solicitante: wherePessoas,
      },
      _count: { id: true },
    }),

    prisma.pessoa.groupBy({
      by: ['escolaridade'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.pessoa.groupBy({
      by: ['religiao'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.pessoa.findMany({
      where: { ...wherePessoas, nascimento: { not: null } },
      select: { nascimento: true },
    }),

    prisma.pessoa.count({ where: { ...wherePessoas, nascimento: null } }),
  ])

  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)

  const labelPeriodo: Record<string, string> = {
    hoje: 'Hoje',
    '7dias': 'Últimos 7 dias',
    '30dias': 'Últimos 30 dias',
  }

  return (
    <DashboardConteudo
      slug={params.slug}
      dashboardHref={`/${params.slug}/admin/dashboard`}
      filtrosHref={`/${params.slug}/admin/filtros`}
      demandasHref={`/${params.slug}/admin/demandas`}
      searchParams={searchParams}
      periodo={periodo}
      labelPeriodo={labelPeriodo}
      totalPessoas={totalPessoas}
      novasPessoas={novasPessoas}
      totalMobilizadores={totalMobilizadores}
      totalEquipe={totalEquipe}
      segmentosComContagem={segmentosRaw.map((s) => ({ nome: s.nome, tipo: s.tipo, contagem: s._count.pessoas }))}
      rankingMobilizadores={rankingMobilizadores}
      pessoasPorOrigem={pessoasPorOrigemRaw.map((o) => ({ chave: o.origem, contagem: o._count.id }))}
      regioes={regioesRaw.map((r) => ({ id: r.id, nome: r.nome, ativa: r.ativa, contagem: r._count.pessoas }))}
      contagemGenero={pessoasPorGeneroRaw.map((g) => ({ chave: g.genero, contagem: g._count.id }))}
      contagemDemandas={demandasMesRaw.map((d) => ({ chave: d.status, contagem: d._count.id }))}
      mesLabel={mesLabel}
      dataInicioStr={dataInicioStr}
      dataFimStr={dataFimStr}
      nascimentos={nascimentosPessoas.map((p) => p.nascimento as Date)}
      totalSemNascimento={totalSemNascimento}
      escolaridade={escolaridadeRaw.map((e) => ({ chave: e.escolaridade, contagem: e._count.id }))}
      religiao={religiaoRaw.map((r) => ({ chave: r.religiao, contagem: r._count.id }))}
    />
  )
}
```

- [ ] **Step 3: Fazer `/admin` redirecionar pro dashboard**

Em `src/app/[slug]/admin/page.tsx`, troque:

```typescript
export default function AdminPage({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/admin/pessoas`)
}
```

por:

```typescript
export default function AdminPage({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/admin/dashboard`)
}
```

- [ ] **Step 4: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros — **este é o passo mais importante desta task**, dado o tamanho da reescrita.

- [ ] **Step 5: Verificação manual**

Suba o servidor de dev, acesse `/[slug]/admin` e confirme que cai em `/[slug]/admin/dashboard`. Confirme que os 4 cards de estatística mostram números plausíveis (compare com a contagem real de pessoas ativas do gabinete de teste, verificando que pessoas excluídas — soft-delete — não entram na conta, o que confirma o bug corrigido). Confirme que os cards de região aparecem, incluindo uma região com 0 pessoas caso exista. Confirme os 5 gráficos de pizza renderizam (mesmo com fatias pequenas/zeradas) e que clicar numa fatia de Sexo/Faixa etária/Escolaridade/Religião leva pra `/admin/filtros` com o filtro certo aplicado, e clicar numa fatia de Demandas leva pra `/admin/demandas` com o status certo. Aplique um filtro (ex: `?regiaoId=X`) direto na URL do dashboard e confirme que os cards de estatística e as seções existentes (segmento/origem/ranking) também mudam de acordo.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/dashboard/DashboardConteudo.tsx" \
  "src/app/[slug]/admin/dashboard/page.tsx" \
  "src/app/[slug]/admin/page.tsx"
git commit -m "feat: dashboard do admin — corrige bug de deletedAt, vira tela inicial, adiciona região+5 pizzas"
```

---

### Task 5: Dashboard do mobilizador + reorganização do menu

**Files:**
- Create: `src/app/[slug]/mobilizador/dashboard/page.tsx`
- Create: `src/app/[slug]/mobilizador/rede/page.tsx` (conteúdo movido de `mobilizador/page.tsx`)
- Modify: `src/app/[slug]/mobilizador/page.tsx` (vira redirect)
- Modify: `src/components/admin/Sidebar.tsx`

**Interfaces:**
- Consumes: `DashboardConteudo` (Task 4); `buildWherePessoas`, `type FiltrosPessoasParams` (Task 3); `coletarSubRedeIds` de `@/lib/rede` (já existe); `assertMobilizadorAccess` de `@/lib/assert-mobilizador-access` (já existe)

Sem teste automatizado — mesmo padrão da Task 4.

- [ ] **Step 1: Criar `src/app/[slug]/mobilizador/rede/page.tsx` com o conteúdo atual de `mobilizador/page.tsx`**

Crie o arquivo com este conteúdo exato — é o conteúdo atual de `src/app/[slug]/mobilizador/page.tsx`, com só duas mudanças: o nome da função (`MobilizadorPage` → `MobilizadorRedePage`) e as duas ocorrências do `href` do breadcrumb que apontavam pra `/mobilizador` agora apontam pra `/mobilizador/rede` (marcadas abaixo). `baseHref` da tabela (`/mobilizador/pessoas`) não muda — é uma rota diferente, sem relação com esta:

```tsx
// src/app/[slug]/mobilizador/rede/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { mapPapelParaTipoConta } from '@/lib/tipo-conta'
import UsuariosTable, { type UsuarioRow } from '../../admin/pessoas/UsuariosTable'

function buildOrderBy(sort?: string, order?: string) {
  if (sort === 'nome') {
    return { nome: (order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
  }
  return { criadoEm: 'desc' as const }
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

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true, tokenMobilizador: true },
  })
  if (!pessoa || !pessoa.tokenMobilizador) notFound()

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
          Acompanhe aqui as pessoas cadastradas na sua rede.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Minha Rede</h2>

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

Note que o import de `UsuariosTable` mudou de `'../admin/pessoas/UsuariosTable'` pra `'../../admin/pessoas/UsuariosTable'` — o arquivo agora está um nível mais fundo (`mobilizador/rede/` em vez de `mobilizador/`), então o caminho relativo precisa de um `../` a mais.

- [ ] **Step 2: Criar `src/app/[slug]/mobilizador/dashboard/page.tsx`**

```tsx
// src/app/[slug]/mobilizador/dashboard/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { DashboardConteudo } from '../../admin/dashboard/DashboardConteudo'

function calcularIntervalo(periodo: string): { dataInicio: Date; dataFim: Date } {
  const agora = new Date()
  const dataFim = new Date(agora)
  dataFim.setHours(23, 59, 59, 999)

  if (periodo === 'hoje') {
    const dataInicio = new Date(agora)
    dataInicio.setHours(0, 0, 0, 0)
    return { dataInicio, dataFim }
  }
  if (periodo === '7dias') {
    const dataInicio = new Date(agora)
    dataInicio.setDate(dataInicio.getDate() - 7)
    dataInicio.setHours(0, 0, 0, 0)
    return { dataInicio, dataFim }
  }
  const dataInicio = new Date(agora)
  dataInicio.setDate(dataInicio.getDate() - 30)
  dataInicio.setHours(0, 0, 0, 0)
  return { dataInicio, dataFim }
}

export default async function MobilizadorDashboardPage({
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

  const periodo = searchParams.periodo ?? '30dias'
  const { dataInicio, dataFim } = calcularIntervalo(periodo)

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999)
  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dataInicioStr = inicioMes.toISOString().slice(0, 10)
  const dataFimStr = fimMes.toISOString().slice(0, 10)

  const filtrosPessoas: FiltrosPessoasParams = {
    regiaoId: searchParams.regiaoId,
    genero: searchParams.genero,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
    segmentoId: searchParams.segmentoId,
    escolaridade: searchParams.escolaridade,
    religiao: searchParams.religiao,
  }
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas, idsRede)

  const [
    totalPessoas,
    novasPessoas,
    totalMobilizadores,
    totalEquipe,
    segmentosRaw,
    mobilizadoresAtivos,
    pessoasPorOrigemRaw,
    regioesRaw,
    pessoasPorGeneroRaw,
    demandasMesRaw,
    escolaridadeRaw,
    religiaoRaw,
    nascimentosPessoas,
    totalSemNascimento,
  ] = await Promise.all([
    prisma.pessoa.count({ where: wherePessoas }),

    prisma.pessoa.count({
      where: { ...wherePessoas, criadoEm: { gte: dataInicio, lte: dataFim } },
    }),

    prisma.pessoa.count({ where: { ...wherePessoas, isMobilizador: true } }),

    prisma.pessoa.count({ where: { ...wherePessoas, isColaborador: true } }),

    prisma.segmento.findMany({
      where: { gabineteId: gabinete.id, status: 'ativo' },
      select: {
        nome: true,
        tipo: true,
        _count: { select: { pessoas: { where: { pessoa: wherePessoas } } } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    prisma.pessoa.findMany({
      where: { ...wherePessoas, isMobilizador: true },
      select: {
        id: true,
        nome: true,
        redesComoIndicador: {
          where: { criadoEm: { gte: dataInicio, lte: dataFim } },
          select: { id: true },
        },
      },
    }),

    prisma.pessoa.groupBy({
      by: ['origem'],
      where: wherePessoas,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id },
      select: {
        id: true,
        nome: true,
        ativa: true,
        _count: { select: { pessoas: { where: wherePessoas } } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    prisma.pessoa.groupBy({
      by: ['genero'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.demanda.groupBy({
      by: ['status'],
      where: {
        gabineteId: gabinete.id,
        deletedAt: null,
        responsavelId: pessoa.id,
        criadoEm: { gte: inicioMes, lte: fimMes },
        solicitante: wherePessoas,
      },
      _count: { id: true },
    }),

    prisma.pessoa.groupBy({
      by: ['escolaridade'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.pessoa.groupBy({
      by: ['religiao'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.pessoa.findMany({
      where: { ...wherePessoas, nascimento: { not: null } },
      select: { nascimento: true },
    }),

    prisma.pessoa.count({ where: { ...wherePessoas, nascimento: null } }),
  ])

  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)

  const labelPeriodo: Record<string, string> = {
    hoje: 'Hoje',
    '7dias': 'Últimos 7 dias',
    '30dias': 'Últimos 30 dias',
  }

  return (
    <DashboardConteudo
      slug={params.slug}
      dashboardHref={`/${params.slug}/mobilizador/dashboard`}
      filtrosHref={`/${params.slug}/mobilizador/filtros`}
      demandasHref={`/${params.slug}/mobilizador/demandas`}
      searchParams={searchParams}
      periodo={periodo}
      labelPeriodo={labelPeriodo}
      totalPessoas={totalPessoas}
      novasPessoas={novasPessoas}
      totalMobilizadores={totalMobilizadores}
      totalEquipe={totalEquipe}
      segmentosComContagem={segmentosRaw.map((s) => ({ nome: s.nome, tipo: s.tipo, contagem: s._count.pessoas }))}
      rankingMobilizadores={rankingMobilizadores}
      pessoasPorOrigem={pessoasPorOrigemRaw.map((o) => ({ chave: o.origem, contagem: o._count.id }))}
      regioes={regioesRaw.map((r) => ({ id: r.id, nome: r.nome, ativa: r.ativa, contagem: r._count.pessoas }))}
      contagemGenero={pessoasPorGeneroRaw.map((g) => ({ chave: g.genero, contagem: g._count.id }))}
      contagemDemandas={demandasMesRaw.map((d) => ({ chave: d.status, contagem: d._count.id }))}
      mesLabel={mesLabel}
      dataInicioStr={dataInicioStr}
      dataFimStr={dataFimStr}
      nascimentos={nascimentosPessoas.map((p) => p.nascimento as Date)}
      totalSemNascimento={totalSemNascimento}
      escolaridade={escolaridadeRaw.map((e) => ({ chave: e.escolaridade, contagem: e._count.id }))}
      religiao={religiaoRaw.map((r) => ({ chave: r.religiao, contagem: r._count.id }))}
    />
  )
}
```

**Nota:** o filtro de Demandas do mobilizador combina `responsavelId: pessoa.id` (só as demandas atribuídas a ele — mesmo critério de `/mobilizador/demandas`) **e** `solicitante: wherePessoas` (pra que filtrar por região/sexo/etc também restrinja quais demandas aparecem, pelo critério do solicitante) — as duas condições juntas, não uma ou outra.

- [ ] **Step 3: Trocar `mobilizador/page.tsx` por um redirect**

Substitua todo o conteúdo de `src/app/[slug]/mobilizador/page.tsx` por:

```tsx
import { redirect } from 'next/navigation'

export default function MobilizadorPage({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/mobilizador/dashboard`)
}
```

- [ ] **Step 4: Atualizar `Sidebar.tsx` — novo item "Dados Gerais" pro mobilizador**

Troque:

```typescript
function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Início', href: `/${slug}/mobilizador`, icone: 'inicio' },
    { label: 'Demandas', href: `/${slug}/mobilizador/demandas`, icone: 'demandas' },
    { label: 'Link de Cadastro', href: `/${slug}/mobilizador/link-cadastro`, icone: 'link-cadastro' },
  ]
}
```

por:

```typescript
function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Dados Gerais', href: `/${slug}/mobilizador/dashboard`, icone: 'dados-gerais' },
    { label: 'Início', href: `/${slug}/mobilizador/rede`, icone: 'inicio' },
    { label: 'Demandas', href: `/${slug}/mobilizador/demandas`, icone: 'demandas' },
    { label: 'Link de Cadastro', href: `/${slug}/mobilizador/link-cadastro`, icone: 'link-cadastro' },
  ]
}
```

- [ ] **Step 5: Verificar TypeScript e build completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos

Run: `npm run build`
Expected: build completo sem erros

- [ ] **Step 6: Rodar a suíte de testes inteira**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: mesmas 2 falhas pré-existentes em `email.test.ts` (RESEND_API_KEY ausente), nenhuma nova falha. Confirme que os testes novos das Tasks 1 e 3 (`faixa-etaria.test.ts`, `agrupar-top-outros.test.ts`, os 4 casos novos em `filtros-pessoas.test.ts`) aparecem passando.

- [ ] **Step 7: Verificação manual**

Com um usuário mobilizador de teste (que tenha ao menos uma pessoa na rede): acesse `/[slug]/mobilizador` e confirme que cai em `/[slug]/mobilizador/dashboard`. Confirme que "Início" no menu agora leva pra `/[slug]/mobilizador/rede` e mostra a mesma listagem/breadcrumb de rede de sempre (navegação em cascata continua funcionando). Confirme que os números do dashboard do mobilizador refletem só a sub-rede dele (compare com a contagem real). Confirme que "Demandas" do mobilizador só mostra as atribuídas a ele.

- [ ] **Step 8: Commit**

```bash
git add "src/app/[slug]/mobilizador/dashboard/page.tsx" \
  "src/app/[slug]/mobilizador/rede/page.tsx" \
  "src/app/[slug]/mobilizador/page.tsx" \
  src/components/admin/Sidebar.tsx
git commit -m "feat: dashboard do mobilizador escopado à rede + reorganização do menu (Início vira /rede)"
```
