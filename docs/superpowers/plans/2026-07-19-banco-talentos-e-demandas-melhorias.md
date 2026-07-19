# Banco de Talentos + Demandas — Melhorias de Filtro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duas frentes independentes, executadas na mesma sessão: (1) trocar a lista de botões de área por um combo box multi-seleção e adicionar busca por nome na tela de Banco de Talentos; (2) trocar os contadores de Demandas por dois gráficos de pizza com filtro cruzado multi-seleção.

**Architecture:** Componentes/funções novos seguem os padrões já estabelecidos no projeto (sem lib de UI externa, filtro server-side via query params em formulário GET, `GraficoPizza` já existente reaproveitado sem alteração). Lógica pura (filtro de opções do combo box, toggle de seleção múltipla, filtro por nome) ganha teste Vitest; componentes React e páginas (sem teste automatizado no projeto até hoje) são verificados manualmente no navegador.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Prisma 7.8, Tailwind, Vitest.

## Global Constraints

- Sem biblioteca de UI/combobox externa — o projeto não usa nenhuma (`grep` em `package.json` confirma). Todo componente novo é feito à mão com Tailwind, mesmo padrão de `Pagination`/`GraficoPizza`/`GraficoDemandas`.
- O projeto não tem nenhum teste de componente React (`.test.tsx`) — só funções puras ganham teste Vitest. Mudanças de UI são verificadas manualmente (`npm run dev`, testar no navegador), não com teste automatizado.
- Filtros continuam sendo aplicados via `GET` com query params e recarregamento de página (padrão já usado em toda a tela de Filtros) — sem introduzir fetch client-side/SPA nessas telas.
- Cores de gráfico já definidas em `src/lib/cores-graficos.ts` (`CORES_STATUS_DEMANDA`, `PALETA_CATEGORICA`, `COR_NEUTRA`) — reaproveitar exatamente esses valores, não inventar cor nova.
- `GraficoPizza` (`src/components/GraficoPizza.tsx`) não muda — já suporta `href` por fatia, é reaproveitado como está.

---

### Task 1: Filtro por nome em `buildWhereBancoTalentos` (TDD)

**Files:**
- Modify: `src/lib/filtros-banco-talentos.ts`
- Modify: `src/lib/__tests__/filtros-banco-talentos.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `FiltrosBancoTalentosParams` ganha campo opcional `nome?: string`; `WhereBancoTalentos.pessoa` ganha campo opcional `nome?: { contains: string; mode: 'insensitive' }` — a Task 3 usa esse nome de campo exato.

- [ ] **Step 1: Escrever os testes que hoje falham**

Adicionar ao final de `src/lib/__tests__/filtros-banco-talentos.test.ts` (dentro do `describe('buildWhereBancoTalentos', ...)`, antes do `})` final):

```typescript
  it('filtra por nome via relação pessoa, case-insensitive', () => {
    const where = buildWhereBancoTalentos('gab-1', { nome: 'Maria' })
    expect(where.pessoa.nome).toEqual({ contains: 'Maria', mode: 'insensitive' })
  })

  it('sem filtro de nome, não aplica', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.pessoa.nome).toBeUndefined()
  })

  it('nome com só espaços em branco não aplica filtro', () => {
    const where = buildWhereBancoTalentos('gab-1', { nome: '   ' })
    expect(where.pessoa.nome).toBeUndefined()
  })

  it('combina nome com os outros filtros', () => {
    const where = buildWhereBancoTalentos('gab-1', { nome: 'Ana', regiaoId: 'regiao-1' })
    expect(where.pessoa).toEqual({
      gabineteId: 'gab-1',
      deletedAt: null,
      regiaoId: 'regiao-1',
      nome: { contains: 'Ana', mode: 'insensitive' },
    })
  })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd /Users/renato/Documents/meubd && npx vitest run src/lib/__tests__/filtros-banco-talentos.test.ts`
Expected: FAIL — `where.pessoa.nome` é `undefined` nos casos que esperam valor (o campo `nome` ainda não existe em `FiltrosBancoTalentosParams`, TypeScript nem aceita o objeto passado — o erro pode aparecer como falha de compilação do teste).

- [ ] **Step 3: Implementar o filtro de nome**

Editar `src/lib/filtros-banco-talentos.ts` — arquivo completo fica assim:

```typescript
export type FiltrosBancoTalentosParams = {
  areaIds?: string[]
  prioridade?: string
  isPcd?: 'sim' | 'nao'
  regiaoId?: string
  nome?: string
}

export type WhereBancoTalentos = {
  colocado: false
  curriculoUrl: { not: null }
  pessoa: { gabineteId: string; deletedAt: null; regiaoId?: string; nome?: { contains: string; mode: 'insensitive' } }
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
    pessoa: { gabineteId, deletedAt: null },
  }
  if (params.regiaoId) where.pessoa.regiaoId = params.regiaoId
  if (params.nome && params.nome.trim()) where.pessoa.nome = { contains: params.nome.trim(), mode: 'insensitive' }
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

Run: `cd /Users/renato/Documents/meubd && npx vitest run src/lib/__tests__/filtros-banco-talentos.test.ts`
Expected: todos os testes passando (20 testes: 16 já existentes + 4 novos).

- [ ] **Step 5: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/renato/Documents/meubd
git add src/lib/filtros-banco-talentos.ts src/lib/__tests__/filtros-banco-talentos.test.ts
git commit -m "$(cat <<'EOF'
feat: filtro por nome em buildWhereBancoTalentos

Novo campo opcional nome, filtra Pessoa.nome via contains
case-insensitive, testado com Vitest (TDD).
EOF
)"
```

---

### Task 2: Componente `ComboBoxMultiplo` (TDD na lógica de filtro)

**Files:**
- Create: `src/components/admin/ComboBoxMultiplo.tsx`
- Create: `src/lib/__tests__/filtrar-opcoes-combobox.test.ts`
- Create: `src/lib/filtrar-opcoes-combobox.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `filtrarOpcoesComboBox(opcoes: OpcaoComboBox[], busca: string, selecionados: Set<string>): OpcaoComboBox[]` (função pura, usada pelo componente); componente `ComboBoxMultiplo({ opcoes, selecionados, onToggle, placeholder }): JSX.Element` — a Task 3 importa e usa esse componente com essas props exatas.

- [ ] **Step 1: Escrever o teste que hoje falha**

Criar `src/lib/__tests__/filtrar-opcoes-combobox.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { filtrarOpcoesComboBox, type OpcaoComboBox } from '../filtrar-opcoes-combobox'

const OPCOES: OpcaoComboBox[] = [
  { id: '1', label: 'Educação' },
  { id: '2', label: 'Saúde' },
  { id: '3', label: 'Saneamento' },
]

describe('filtrarOpcoesComboBox', () => {
  it('sem busca, retorna todas as opções não selecionadas', () => {
    expect(filtrarOpcoesComboBox(OPCOES, '', new Set())).toEqual(OPCOES)
  })

  it('filtra por texto contido no label, case-insensitive', () => {
    expect(filtrarOpcoesComboBox(OPCOES, 'sa', new Set())).toEqual([
      { id: '2', label: 'Saúde' },
      { id: '3', label: 'Saneamento' },
    ])
  })

  it('exclui opções já selecionadas mesmo que o texto bata', () => {
    expect(filtrarOpcoesComboBox(OPCOES, 'sa', new Set(['2']))).toEqual([{ id: '3', label: 'Saneamento' }])
  })

  it('busca sem nenhuma opção compatível retorna lista vazia', () => {
    expect(filtrarOpcoesComboBox(OPCOES, 'zzz', new Set())).toEqual([])
  })

  it('busca com espaços nas pontas é ignorada na comparação', () => {
    expect(filtrarOpcoesComboBox(OPCOES, '  educação  ', new Set())).toEqual([{ id: '1', label: 'Educação' }])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd /Users/renato/Documents/meubd && npx vitest run src/lib/__tests__/filtrar-opcoes-combobox.test.ts`
Expected: FAIL — `Cannot find module '../filtrar-opcoes-combobox'`.

- [ ] **Step 3: Implementar `filtrar-opcoes-combobox.ts`**

Criar `src/lib/filtrar-opcoes-combobox.ts`:

```typescript
export type OpcaoComboBox = { id: string; label: string }

export function filtrarOpcoesComboBox(
  opcoes: OpcaoComboBox[],
  busca: string,
  selecionados: Set<string>
): OpcaoComboBox[] {
  const buscaNormalizada = busca.trim().toLowerCase()
  return opcoes.filter((o) => {
    if (selecionados.has(o.id)) return false
    if (!buscaNormalizada) return true
    return o.label.toLowerCase().includes(buscaNormalizada)
  })
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd /Users/renato/Documents/meubd && npx vitest run src/lib/__tests__/filtrar-opcoes-combobox.test.ts`
Expected: todos os 5 testes passando.

- [ ] **Step 5: Implementar o componente `ComboBoxMultiplo`**

Criar `src/components/admin/ComboBoxMultiplo.tsx`:

```typescript
'use client'

import { useRef, useState, useEffect } from 'react'
import { filtrarOpcoesComboBox, type OpcaoComboBox } from '@/lib/filtrar-opcoes-combobox'

export function ComboBoxMultiplo({
  opcoes,
  selecionados,
  onToggle,
  placeholder,
}: {
  opcoes: OpcaoComboBox[]
  selecionados: Set<string>
  onToggle: (id: string) => void
  placeholder: string
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  const opcoesFiltradas = filtrarOpcoesComboBox(opcoes, busca, selecionados)

  function selecionar(id: string) {
    onToggle(id)
    setBusca('')
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full"
      />
      {aberto && opcoesFiltradas.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg text-sm">
          {opcoesFiltradas.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => selecionar(o.id)}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
cd /Users/renato/Documents/meubd
git add src/lib/filtrar-opcoes-combobox.ts src/lib/__tests__/filtrar-opcoes-combobox.test.ts src/components/admin/ComboBoxMultiplo.tsx
git commit -m "$(cat <<'EOF'
feat: componente ComboBoxMultiplo (digitável + filtro, multi-seleção)

Sem lib externa, mesmo padrão de componentes próprios do projeto.
Lógica de filtro de opções extraída em função pura testada com
Vitest (TDD); o componente em si (interação de dropdown) segue o
padrão do projeto de não ter teste automatizado de UI — verificação
manual na Task 3, que o integra na tela real.
EOF
)"
```

---

### Task 3: Integrar combo box + busca por nome na tela de Banco de Talentos

**Files:**
- Modify: `src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx`
- Modify: `src/app/[slug]/admin/filtros/banco-talentos/page.tsx`

**Interfaces:**
- Consumes: `ComboBoxMultiplo` de `@/components/admin/ComboBoxMultiplo` (Task 2); `FiltrosBancoTalentosParams.nome`/`buildWhereBancoTalentos` de `@/lib/filtros-banco-talentos` (Task 1).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Passar `nome` da URL pro `buildWhereBancoTalentos`**

Em `src/app/[slug]/admin/filtros/banco-talentos/page.tsx`, dentro do objeto `filtros` (linhas 21-26 hoje), adicionar o campo `nome`:

```typescript
  const filtros: FiltrosBancoTalentosParams = {
    areaIds: searchParams.areaIds ? searchParams.areaIds.split(',').filter(Boolean) : undefined,
    prioridade: searchParams.prioridade,
    isPcd: searchParams.isPcd === 'sim' || searchParams.isPcd === 'nao' ? searchParams.isPcd : undefined,
    regiaoId: searchParams.regiaoId,
    nome: searchParams.nome,
  }
```

- [ ] **Step 2: Trocar o bloco de botões de área pelo `ComboBoxMultiplo` e adicionar o campo de busca por nome**

Em `src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx`:

1. Adicionar o import no topo do arquivo:

```typescript
import { ComboBoxMultiplo } from '@/components/admin/ComboBoxMultiplo'
```

2. Substituir o bloco `<div>` de "Área de interesse" (linhas 82-101 hoje, do `<div>` que contém `<p className="text-xs font-medium text-gray-600 mb-1">Área de interesse</p>` até o `</div>` correspondente) por:

```typescript
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Área de interesse</p>
          <ComboBoxMultiplo
            opcoes={areas.map((a) => ({ id: a.id, label: a.nome }))}
            selecionados={areasFiltro}
            onToggle={toggleAreaFiltro}
            placeholder="Buscar área..."
          />
          {areasFiltro.size > 0 && (
            <div className="flex flex-wrap gap-1.5 max-w-md mt-2">
              {areas
                .filter((a) => areasFiltro.has(a.id))
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAreaFiltro(a.id)}
                    style={{ backgroundColor: corPrimaria, color: corTexto }}
                    className="px-2.5 py-1 rounded text-xs font-medium"
                  >
                    {a.nome}
                  </button>
                ))}
            </div>
          )}
          {areas.length === 0 && <p className="text-xs text-gray-500 mt-1">Nenhuma área cadastrada.</p>}
        </div>
```

3. Adicionar um campo de busca por nome, logo antes do campo "Prioridade" (antes da linha `<div>\n          <label className="block text-xs font-medium text-gray-600">Prioridade</label>` de hoje):

```typescript
        <div>
          <label className="block text-xs font-medium text-gray-600">Nome</label>
          <input
            type="text"
            name="nome"
            defaultValue={searchParams.nome ?? ''}
            placeholder="Buscar por nome..."
            className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
```

- [ ] **Step 3: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificar manualmente no navegador**

```bash
cd /Users/renato/Documents/meubd
npm run dev
```

Abrir `http://localhost:3000/izalci/admin/filtros/banco-talentos` (ajustar a porta se o terminal informar outra), logar como admin do gabinete `izalci` se necessário. Confirmar:
- O campo "Área de interesse" mostra um combo box de texto, não mais a lista de botões inteira.
- Digitar parte do nome de uma área filtra o dropdown; clicar numa opção adiciona um botão cinza abaixo, com a cor do gabinete.
- Clicar no botão cinza remove a seleção.
- Preencher "Nome" com o nome de alguém que já tem currículo (ex: "Ingrid" ou "Domingos", já confirmados na importação Izalci) e clicar "Filtrar" — a lista deve mostrar só essa pessoa.
- Limpar filtro volta a mostrar todos.

- [ ] **Step 5: Commit**

```bash
cd /Users/renato/Documents/meubd
git add src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx src/app/[slug]/admin/filtros/banco-talentos/page.tsx
git commit -m "$(cat <<'EOF'
feat: combo box de área e busca por nome no Banco de Talentos

Troca a lista de botões de área (sempre visível) pelo ComboBoxMultiplo
digitável — botões cinza continuam existindo, mas só pras áreas já
selecionadas. Adiciona campo de busca por nome no mesmo formulário de
filtro já existente, sem JavaScript novo (GET, mesmo padrão dos
outros filtros da tela).
EOF
)"
```

---

### Task 4: Função pura de toggle de seleção múltipla (TDD)

**Files:**
- Create: `src/lib/toggle-lista.ts`
- Create: `src/lib/__tests__/toggle-lista.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `toggleLista(lista: string[], valor: string): string[]` — a Task 5 usa essa assinatura exata.

- [ ] **Step 1: Escrever os testes que hoje falham**

Criar `src/lib/__tests__/toggle-lista.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { toggleLista } from '../toggle-lista'

describe('toggleLista', () => {
  it('valor ausente na lista é adicionado', () => {
    expect(toggleLista(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  })

  it('valor já presente na lista é removido', () => {
    expect(toggleLista(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('lista vazia, adiciona o valor', () => {
    expect(toggleLista([], 'a')).toEqual(['a'])
  })

  it('lista com um único valor igual ao buscado, remove e fica vazia', () => {
    expect(toggleLista(['a'], 'a')).toEqual([])
  })

  it('não modifica a lista original (imutável)', () => {
    const original = ['a', 'b']
    toggleLista(original, 'c')
    expect(original).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd /Users/renato/Documents/meubd && npx vitest run src/lib/__tests__/toggle-lista.test.ts`
Expected: FAIL — `Cannot find module '../toggle-lista'`.

- [ ] **Step 3: Implementar `toggle-lista.ts`**

Criar `src/lib/toggle-lista.ts`:

```typescript
export function toggleLista(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd /Users/renato/Documents/meubd && npx vitest run src/lib/__tests__/toggle-lista.test.ts`
Expected: todos os 5 testes passando.

- [ ] **Step 5: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/renato/Documents/meubd
git add src/lib/toggle-lista.ts src/lib/__tests__/toggle-lista.test.ts
git commit -m "$(cat <<'EOF'
feat: função pura toggleLista pra seleção múltipla acumulativa

Usada pelos gráficos de pizza de Demandas (Task 5) pra alternar
status/área selecionados via clique — imutável, testada com Vitest
(TDD).
EOF
)"
```

---

### Task 5: Gráficos de pizza com filtro cruzado em Demandas

**Files:**
- Modify: `src/app/[slug]/admin/demandas/page.tsx`
- Modify: `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`

**Interfaces:**
- Consumes: `toggleLista` de `@/lib/toggle-lista` (Task 4); `GraficoPizza`/`FatiaPizza` de `@/components/GraficoPizza` (já existe); `CORES_STATUS_DEMANDA`/`PALETA_CATEGORICA` de `@/lib/cores-graficos` (já existe).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Trocar `status`/`areaId` por `statusIds`/`areaIds` e remover o default de 30 dias**

Em `src/app/[slug]/admin/demandas/page.tsx`, substituir **tudo de uma vez**, num único bloco contíguo — desde `searchParams,\n}: {` (parte final da assinatura da função, linha 35 hoje) até o fechamento do `where` (linha 83 hoje) — pelo código abaixo. Isso inclui remover as declarações de `hoje`, `inicioMes`, `fimMes`, `mesLabel`, `dataInicioStr`, `dataFimStr` (linhas 52-57 hoje) — elas não têm mais uso depois desta task (os gráficos novos são histórico completo, sem escopo de mês) e o `tsconfig.json` deste projeto não tem `noUnusedLocals`, então `tsc` não avisa sozinho se ficarem esquecidas; **não pule essa remoção**:

```typescript
  searchParams,
}: {
  params: { slug: string }
  searchParams: {
    statusIds?: string
    areaIds?: string
    responsavelId?: string
    regiaoId?: string
    prazoAlterado?: string
    dataInicio?: string
    dataFim?: string
    pagina?: string
    sort?: string
    order?: string
  }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const statusSelecionados = searchParams.statusIds ? searchParams.statusIds.split(',').filter(Boolean) : []
  const areaSelecionadas = searchParams.areaIds ? searchParams.areaIds.split(',').filter(Boolean) : []

  const pagina = Math.max(1, Number(searchParams.pagina ?? 1))

  const whereBase = { gabineteId: gabinete.id, deletedAt: null }
  const where = {
    ...whereBase,
    ...(statusSelecionados.length > 0 ? { status: { in: statusSelecionados } } : {}),
    ...(areaSelecionadas.length > 0 ? { areaId: { in: areaSelecionadas } } : {}),
    ...(searchParams.responsavelId ? { responsavelId: searchParams.responsavelId } : {}),
    ...(searchParams.regiaoId ? { solicitante: { regiaoId: searchParams.regiaoId } } : {}),
    ...(searchParams.prazoAlterado ? { prazoAlterado: searchParams.prazoAlterado === 'sim' } : {}),
    ...(searchParams.dataInicio || searchParams.dataFim
      ? {
          criadoEm: {
            ...(searchParams.dataInicio ? { gte: new Date(`${searchParams.dataInicio}T00:00:00`) } : {}),
            ...(searchParams.dataFim ? { lte: new Date(`${searchParams.dataFim}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }
  const whereParaStatus = {
    ...whereBase,
    ...(areaSelecionadas.length > 0 ? { areaId: { in: areaSelecionadas } } : {}),
  }
  const whereParaArea = {
    ...whereBase,
    ...(statusSelecionados.length > 0 ? { status: { in: statusSelecionados } } : {}),
  }
```

- [ ] **Step 2: Trocar as queries de contagem e montar as duas listas de fatias**

Substituir o bloco `Promise.all` (linhas 86-118 hoje) e tudo que vem depois até o fim dos `barrasDemandas`/`totalPrazoAlterado` (linhas 120-134 hoje) por:

```typescript
  const [demandas, total, contagensStatus, contagensArea, areas] = await Promise.all([
    prisma.demanda.findMany({
      where,
      orderBy: buildOrderBy(searchParams.sort, searchParams.order),
      skip: (pagina - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        titulo: true,
        status: true,
        prazoDesfecho: true,
        prazoAlterado: true,
        criadoEm: true,
        solicitante: { select: { nome: true } },
        responsavel: { select: { nome: true } },
        area: { select: { nome: true } },
      },
    }),
    prisma.demanda.count({ where }),
    prisma.demanda.groupBy({ by: ['status'], where: whereParaStatus, _count: { id: true } }),
    prisma.demanda.groupBy({ by: ['areaId'], where: whereParaArea, _count: { id: true } }),
    prisma.areaDemanda.findMany({ where: { gabineteId: gabinete.id }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])

  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  const baseHref = `/${params.slug}/admin/demandas`
  function hrefComToggleStatus(chave: string): string {
    const novaLista = toggleLista(statusSelecionados, chave)
    const params2 = new URLSearchParams()
    if (novaLista.length > 0) params2.set('statusIds', novaLista.join(','))
    if (areaSelecionadas.length > 0) params2.set('areaIds', areaSelecionadas.join(','))
    const qs = params2.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }
  function hrefComToggleArea(id: string): string {
    const novaLista = toggleLista(areaSelecionadas, id)
    const params2 = new URLSearchParams()
    if (statusSelecionados.length > 0) params2.set('statusIds', statusSelecionados.join(','))
    if (novaLista.length > 0) params2.set('areaIds', novaLista.join(','))
    const qs = params2.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }

  const mapaStatus = Object.fromEntries(contagensStatus.map((c) => [c.status, c._count.id]))
  const STATUS_LABELS: { chave: string; label: string }[] = [
    { chave: 'aberta', label: 'Em aberto' },
    { chave: 'atendida', label: 'Atendida' },
    { chave: 'nao_atendida', label: 'Não atendida' },
    { chave: 'expirada', label: 'Expirada' },
  ]
  const fatiasStatus: FatiaPizza[] = STATUS_LABELS.map((s) => ({
    chave: s.chave,
    label: s.label,
    valor: mapaStatus[s.chave] ?? 0,
    cor: CORES_STATUS_DEMANDA[s.chave],
    href: hrefComToggleStatus(s.chave),
  }))

  const mapaArea = Object.fromEntries(contagensArea.map((c) => [c.areaId, c._count.id]))
  const fatiasArea: FatiaPizza[] = areas.map((a, i) => ({
    chave: a.id,
    label: a.nome,
    valor: mapaArea[a.id] ?? 0,
    cor: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length],
    href: hrefComToggleArea(a.id),
  }))

  const temFiltroAtivo = statusSelecionados.length > 0 || areaSelecionadas.length > 0
```

- [ ] **Step 3: Adicionar os imports novos no topo do arquivo**

No topo de `src/app/[slug]/admin/demandas/page.tsx`, substituir a linha `import { GraficoDemandas } from '@/components/GraficoDemandas'` por:

```typescript
import { GraficoPizza, type FatiaPizza } from '@/components/GraficoPizza'
import { CORES_STATUS_DEMANDA, PALETA_CATEGORICA } from '@/lib/cores-graficos'
import { toggleLista } from '@/lib/toggle-lista'
```

- [ ] **Step 4: Trocar o JSX — dois `GraficoPizza` + botão de limpar filtro, no lugar do gráfico de barras e dos 5 cards**

Substituir o bloco `<GraficoDemandas .../>` seguido do `{/* Cards de resumo */}` (da linha `<GraficoDemandas barras={barrasDemandas} mesLabel={mesLabel} />` até o `</div>` de fechamento da grade de cards, linhas 149-168 hoje) por:

```typescript
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {temFiltroAtivo ? 'Filtrado — clique numa fatia pra ajustar' : 'Clique numa fatia pra filtrar'}
        </p>
        {temFiltroAtivo && (
          <Link href={`/${params.slug}/admin/demandas`} className="text-sm text-gray-500 underline hover:text-gray-700">
            Limpar filtro
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GraficoPizza titulo="Status" fatias={fatiasStatus} />
        <GraficoPizza titulo="Área" fatias={fatiasArea} />
      </div>
```

- [ ] **Step 5: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Corrigir o link do Dashboard pro novo parâmetro `statusIds`**

Em `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`, trocar as duas ocorrências de `?status=${s.chave}&dataInicio=` (linhas 122 e 129 hoje, em `barrasDemandas` e `fatiasDemandas`) por `?statusIds=${s.chave}&dataInicio=`.

- [ ] **Step 7: Checar tipos de novo**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Verificar manualmente no navegador**

```bash
cd /Users/renato/Documents/meubd
npm run dev
```

Abrir `http://localhost:3000/izalci/admin/demandas`. Confirmar:
- Aparecem dois gráficos de pizza (Status, Área), sem o gráfico de barras nem os 5 cards antigos.
- Clicar numa fatia de área filtra a tabela abaixo e o gráfico de Status recalcula pra mostrar só a distribuição dentro dessa área.
- Clicar em outra fatia de área **soma** à seleção (não substitui) — tabela mostra as duas áreas juntas.
- Clicar de novo na mesma fatia de área remove ela da seleção.
- Botão "Limpar filtro" aparece só quando tem filtro ativo, e ao clicar volta a mostrar tudo sem filtro.
- No Dashboard (`/izalci/admin/dashboard`), clicar numa fatia do gráfico "Demandas do mês" ainda leva pra tela de Demandas com o filtro de status aplicado corretamente (parâmetro `statusIds`).

- [ ] **Step 9: Commit**

```bash
cd /Users/renato/Documents/meubd
git add src/app/[slug]/admin/demandas/page.tsx src/app/[slug]/admin/dashboard/DashboardConteudo.tsx
git commit -m "$(cat <<'EOF'
feat: gráficos de pizza com filtro cruzado multi-seleção em Demandas

Troca o gráfico de barras (mês atual) e os 5 cards (histórico total)
por dois GraficoPizza (status, área) mostrando todo o histórico.
Clique acumula seleção (toggle), cada gráfico ignora o próprio filtro
mas respeita o do outro (faceted). Botão de limpar filtro. Remove o
default de "últimos 30 dias" da tabela, pra bater com os gráficos.
Corrige o link do Dashboard pro novo parâmetro statusIds.
EOF
)"
```
