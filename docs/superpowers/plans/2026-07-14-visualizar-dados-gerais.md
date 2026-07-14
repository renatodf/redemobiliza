# Visualizar Dados Gerais a partir de um filtro — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sempre que um filtro de Pessoas estiver ativo (Central de Filtros ou visão de rede de um mobilizador na tela de Usuários), mostrar um botão "Visualizar Dados Gerais" que leva ao Dashboard já filtrado pelo mesmo recorte; no Dashboard, mostrar badges removíveis por filtro ativo + "Limpar tudo".

**Architecture:** O Dashboard já usa a mesma função `buildWherePessoas` que a Central de Filtros, então a maior parte do trabalho é conectar navegação (botões/links), não construir filtragem nova — com uma exceção: um parâmetro novo, `redeDeId`, que escopa pela sub-rede completa (recursiva) de um mobilizador específico, reaproveitando `coletarSubRedeIds` já existente.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5 (strict) + Prisma 7.8 + Vitest.

## Global Constraints

- Filtros reconhecidos como "ativos" (para fins do botão/badges): `regiaoId`, `genero`, `profissaoId`, `segmentoId`, `escolaridade`, `religiao`, `redeDeId`. `periodo` nunca conta como filtro. `idadeMin`/`idadeMax`/`aniversario` também não contam (decisão do usuário — o Dashboard não aplica esses de verdade nos números agregados hoje, e corrigir isso é um trabalho maior fora de escopo).
- "Limpar tudo" no Dashboard preserva `periodo`, remove todos os campos da lista acima.
- Nenhuma mudança no destino dos cliques que já existem hoje (fatia de pizza, pin do mapa, item de região) — eles já preservam todos os parâmetros da URL atual via `construirHref`, então `redeDeId` atravessa esses cliques automaticamente, sem precisar tocar nesses componentes.
- `redeDeId` não se aplica ao lado do mobilizador (ele só vê a própria rede, sempre) — só ao lado do admin.
- Este projeto não escreve teste automatizado para código que depende de Prisma/DB ou para componentes visuais (convenção já estabelecida) — só funções puras (sem `prisma`, sem `fetch`) ganham teste TDD.

---

### Task 1: `src/lib/filtros-ativos.ts` — quais parâmetros contam como filtro

**Files:**
- Create: `src/lib/filtros-ativos.ts`
- Test: `src/lib/__tests__/filtros-ativos.test.ts`

**Interfaces:**
- Produces: `CAMPOS_FILTRO_PESSOAS: readonly string[]` (7 campos) e `temFiltroAtivo(searchParams: Record<string, string | undefined>): boolean` — usados por `VisualizarDadosGeraisButton` (Task 4), `DashboardConteudo.tsx` (Task 3) e as páginas que montam o link de "Limpar tudo".

- [ ] **Step 1: Escrever o teste**

Crie `src/lib/__tests__/filtros-ativos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { temFiltroAtivo, CAMPOS_FILTRO_PESSOAS } from '../filtros-ativos'

describe('temFiltroAtivo', () => {
  it('retorna false quando nenhum filtro está presente', () => {
    expect(temFiltroAtivo({})).toBe(false)
  })

  it('retorna false quando só periodo está presente', () => {
    expect(temFiltroAtivo({ periodo: '7dias' })).toBe(false)
  })

  it('retorna false quando só idade/aniversário estão presentes (fora de escopo)', () => {
    expect(temFiltroAtivo({ idadeMin: '18', idadeMax: '30', aniversario: 'mes' })).toBe(false)
  })

  it('retorna true quando regiaoId está presente', () => {
    expect(temFiltroAtivo({ regiaoId: 'abc' })).toBe(true)
  })

  it('retorna true quando redeDeId está presente (inclusive "raiz")', () => {
    expect(temFiltroAtivo({ redeDeId: 'raiz' })).toBe(true)
  })

  it('retorna true quando um filtro reconhecido é combinado com periodo', () => {
    expect(temFiltroAtivo({ periodo: 'hoje', genero: 'feminino' })).toBe(true)
  })

  it('ignora valores vazios (string vazia não conta como filtro ativo)', () => {
    expect(temFiltroAtivo({ regiaoId: '' })).toBe(false)
  })
})

describe('CAMPOS_FILTRO_PESSOAS', () => {
  it('inclui exatamente os 7 campos esperados', () => {
    expect([...CAMPOS_FILTRO_PESSOAS].sort()).toEqual(
      ['escolaridade', 'genero', 'profissaoId', 'redeDeId', 'regiaoId', 'religiao', 'segmentoId'].sort()
    )
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/__tests__/filtros-ativos.test.ts`
Expected: FAIL — `Cannot find module '../filtros-ativos'`.

- [ ] **Step 3: Implementar `filtros-ativos.ts`**

Crie `src/lib/filtros-ativos.ts`:

```ts
export const CAMPOS_FILTRO_PESSOAS = [
  'regiaoId',
  'genero',
  'profissaoId',
  'segmentoId',
  'escolaridade',
  'religiao',
  'redeDeId',
] as const

export function temFiltroAtivo(searchParams: Record<string, string | undefined>): boolean {
  return CAMPOS_FILTRO_PESSOAS.some((campo) => Boolean(searchParams[campo]))
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/__tests__/filtros-ativos.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/filtros-ativos.ts src/lib/__tests__/filtros-ativos.test.ts
git commit -m "feat: adiciona filtros-ativos.ts (quais parametros contam como filtro de Pessoas)"
```

---

### Task 2: `src/lib/rede.ts` — `resolverIdsRedeDe`

**Files:**
- Modify: `src/lib/rede.ts`

**Interfaces:**
- Consumes: `coletarSubRedeIds` (já existe neste mesmo arquivo), `prisma` (já importado neste arquivo).
- Produces: `resolverIdsRedeDe(redeDeId: string | undefined, gabineteId: string): Promise<string[] | undefined>` — usada por `admin/filtros/page.tsx` (Task 5) e `admin/dashboard/page.tsx` (Task 7).

- [ ] **Step 1: Adicionar a função ao final de `src/lib/rede.ts`**

Adicione ao final do arquivo (depois de `coletarSubRedeIds`):

```ts
// Resolve o parâmetro `redeDeId` (vindo da URL) para a lista de ids de pessoa
// que ele representa: `undefined` quando nenhum filtro de rede está ativo,
// a Rede Raiz (pessoas sem indicador) quando `redeDeId === 'raiz'`, ou a
// sub-rede completa e recursiva de um mobilizador específico nos demais casos.
export async function resolverIdsRedeDe(
  redeDeId: string | undefined,
  gabineteId: string
): Promise<string[] | undefined> {
  if (!redeDeId) return undefined
  if (redeDeId === 'raiz') {
    const vinculos = await prisma.vinculoRede.findMany({
      where: { indicadoPorId: null, gabineteId, deletedAt: null },
      select: { pessoaId: true },
    })
    return vinculos.map((v) => v.pessoaId)
  }
  return coletarSubRedeIds(redeDeId, gabineteId)
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rede.ts
git commit -m "feat: adiciona resolverIdsRedeDe (resolve parametro redeDeId pra lista de ids)"
```

Nota: sem teste automatizado nesta task — `resolverIdsRedeDe` depende de `prisma` (query real/CTE recursiva), e este projeto não mocka Prisma para esse tipo de função (mesma convenção já usada para `coletarSubRedeIds`, que também não tem teste). Verificação é manual, na Task 9.

---

### Task 3: `DashboardConteudo.tsx` — badges de filtro ativo + "Limpar tudo"

**Files:**
- Modify: `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`

**Interfaces:**
- Consumes: `CAMPOS_FILTRO_PESSOAS` (Task 1, `@/lib/filtros-ativos`).
- Produces: 3 novos props opcionais (`segmentoAtivo`, `profissaoAtiva`, `redeAtiva`) — serão preenchidos pelas Tasks 7 e 8. Até lá, ficam `undefined` e as badges de segmento/profissão/rede mostram o id cru em vez do nome (só relevante para quem estiver testando com esses parâmetros manualmente antes da Task 7/8 rodar — não é um estado que aparece em uso normal, já que a página nunca passa esses parâmetros sem o valor resolvido).

- [ ] **Step 1: Adicionar o import**

No topo do arquivo, junto aos outros imports (linha 8 atual, `import { PALETA_CATEGORICA, ... } from '@/lib/cores-graficos'`), adicione logo abaixo:

```ts
import { CAMPOS_FILTRO_PESSOAS } from '@/lib/filtros-ativos'
```

- [ ] **Step 2: Adicionar os 3 novos props**

Na assinatura da função (props de entrada), depois de `religiao` (a última linha antes do `}` que fecha a desestruturação, por volta da linha 72-73 atual):

```ts
  escolaridade,
  religiao,
```

Vira:

```ts
  escolaridade,
  religiao,
  segmentoAtivo,
  profissaoAtiva,
  redeAtiva,
```

E no bloco de tipos logo abaixo (por volta da linha 96-97 atual):

```ts
  escolaridade: ContagemChave[]
  religiao: ContagemChave[]
}) {
```

Vira:

```ts
  escolaridade: ContagemChave[]
  religiao: ContagemChave[]
  segmentoAtivo?: { nome: string } | null
  profissaoAtiva?: { nome: string } | null
  redeAtiva?: { nome: string } | null
}) {
```

- [ ] **Step 3: Montar a lista de filtros ativos exibíveis**

Logo antes do `return (` que abre o JSX (depois do bloco `const regioesComHref = regioes.map(...)`, por volta da linha 181-182 atual), adicione:

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

- [ ] **Step 4: Renderizar a linha de badges**

Logo depois do parágrafo "Período selecionado" (linhas 202-204 atuais):

```tsx
      <p className="text-sm text-gray-500 -mt-4">
        Período selecionado: <strong>{labelPeriodo[periodo] ?? periodo}</strong>
      </p>
```

Adicione logo abaixo (ainda antes da `<section>` de "Pessoas por região"):

```tsx
      {filtrosAtivosExibiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 -mt-4">
          {filtrosAtivosExibiveis.map((f) => (
            <span
              key={f.chave}
              className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs pl-2.5 pr-1.5 py-1 rounded-full"
            >
              {f.label}
              <a
                href={construirHref(dashboardHref, searchParams, {}, [f.chave])}
                className="text-gray-400 hover:text-gray-700 leading-none"
                aria-label={`Remover filtro ${f.label}`}
              >
                ×
              </a>
            </span>
          ))}
          <a
            href={construirHref(dashboardHref, searchParams, {}, [...CAMPOS_FILTRO_PESSOAS])}
            className="text-xs text-blue-600 hover:underline"
          >
            Limpar tudo
          </a>
        </div>
      )}
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/dashboard/DashboardConteudo.tsx"
git commit -m "feat: badges de filtro ativo + Limpar tudo no Dashboard"
```

---

### Task 4: `VisualizarDadosGeraisButton.tsx` — componente compartilhado

**Files:**
- Create: `src/components/admin/VisualizarDadosGeraisButton.tsx`

**Interfaces:**
- Consumes: `CAMPOS_FILTRO_PESSOAS`, `temFiltroAtivo` (Task 1, `@/lib/filtros-ativos`).
- Produces: componente `VisualizarDadosGeraisButton` (default export) — usado por `PessoasFiltro.tsx` (Task 5) e `admin/pessoas/page.tsx` (Task 6).

- [ ] **Step 1: Criar o componente**

Crie `src/components/admin/VisualizarDadosGeraisButton.tsx`:

```tsx
import { CAMPOS_FILTRO_PESSOAS, temFiltroAtivo } from '@/lib/filtros-ativos'

export default function VisualizarDadosGeraisButton({
  dashboardHref,
  searchParams,
  corPrimaria,
}: {
  dashboardHref: string
  searchParams: Record<string, string | undefined>
  corPrimaria: string
}) {
  if (!temFiltroAtivo(searchParams)) return null

  const qs = new URLSearchParams()
  for (const campo of CAMPOS_FILTRO_PESSOAS) {
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

Mesmo estilo visual dos botões "Exportar PDF"/"Exportar Excel" já existentes em `PessoasFiltro.tsx` (`text-[11px] px-2.5 py-1`, fundo `corPrimaria`, texto branco).

`temFiltroAtivo` já filtra por `CAMPOS_FILTRO_PESSOAS`, então o componente funciona tanto recebendo o `searchParams` inteiro da URL (caso da Central de Filtros, que tem `page`/outros campos que devem ser ignorados) quanto um objeto pequeno feito só com `{ redeDeId: '...' }` (caso da tela de Usuários, Task 6) — em ambos os casos só os 7 campos reconhecidos entram na URL de destino.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/VisualizarDadosGeraisButton.tsx
git commit -m "feat: adiciona componente VisualizarDadosGeraisButton"
```

---

### Task 5: Central de Filtros — botão "Visualizar Dados Gerais" + filtro `redeDeId`

**Files:**
- Modify: `src/app/[slug]/admin/filtros/PessoasFiltro.tsx`
- Modify: `src/app/[slug]/admin/filtros/page.tsx`
- Modify: `src/app/[slug]/mobilizador/filtros/page.tsx`

**Interfaces:**
- Consumes: `VisualizarDadosGeraisButton` (Task 4), `resolverIdsRedeDe` (Task 2).

- [ ] **Step 1: `PessoasFiltro.tsx` — novo prop `dashboardHref` + renderizar o botão**

Adicione o import no topo do arquivo (linha 1-3 atuais):

```ts
// src/app/[slug]/admin/filtros/PessoasFiltro.tsx
import Pagination from '@/components/admin/Pagination'
import { LIMITE_EXPORT_SINCRONO } from '@/lib/filtros-pessoas'
```

Vira:

```ts
// src/app/[slug]/admin/filtros/PessoasFiltro.tsx
import Pagination from '@/components/admin/Pagination'
import VisualizarDadosGeraisButton from '@/components/admin/VisualizarDadosGeraisButton'
import { LIMITE_EXPORT_SINCRONO } from '@/lib/filtros-pessoas'
```

Na assinatura da função (por volta da linha 16-44 atuais), adicione `dashboardHref` ao objeto de props e ao tipo:

```ts
export default function PessoasFiltro({
  baseHref,
  dashboardHref,
  exportarHref,
```

E no bloco de tipos:

```ts
  baseHref: string
  dashboardHref: string
  exportarHref: string
```

No JSX, a seção com os botões de exportar (linhas 150-165 atuais) é:

```tsx
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
```

Substitua por:

```tsx
        <div className="flex gap-2">
          <VisualizarDadosGeraisButton dashboardHref={dashboardHref} searchParams={searchParams} corPrimaria={corPrimaria} />
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
```

- [ ] **Step 2: `admin/filtros/page.tsx` — `redeDeId` + `dashboardHref`**

Adicione o import (junto aos outros, por volta da linha 5):

```ts
import { buildWherePessoas, aplicarFiltrosPosConsulta, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
```

Vira:

```ts
import { buildWherePessoas, aplicarFiltrosPosConsulta, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { resolverIdsRedeDe } from '@/lib/rede'
```

A linha que monta o `where` (linha 34 atual):

```ts
  const where = buildWherePessoas(gabinete.id, filtros)
```

Vira:

```ts
  const idsRede = await resolverIdsRedeDe(searchParams.redeDeId, gabinete.id)
  const where = buildWherePessoas(gabinete.id, filtros, idsRede)
```

No JSX, o componente `<PessoasFiltro>` (linhas 91-105 atuais) ganha o novo prop:

```tsx
      <PessoasFiltro
        baseHref={`/${params.slug}/admin/filtros`}
        exportarHref={`/api/${params.slug}/filtros/pessoas/exportar`}
```

Vira:

```tsx
      <PessoasFiltro
        baseHref={`/${params.slug}/admin/filtros`}
        dashboardHref={`/${params.slug}/admin/dashboard`}
        exportarHref={`/api/${params.slug}/filtros/pessoas/exportar`}
```

- [ ] **Step 3: `mobilizador/filtros/page.tsx` — só `dashboardHref`**

No JSX, o componente `<PessoasFiltro>` (linhas 84-96 atuais) ganha o novo prop (sem mudança de `redeDeId` — mobilizador não escolhe a rede de outra pessoa, já está sempre escopado à própria):

```tsx
      <PessoasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros`}
        exportarHref={`/api/${params.slug}/filtros/pessoas/exportar`}
```

Vira:

```tsx
      <PessoasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros`}
        dashboardHref={`/${params.slug}/mobilizador/dashboard`}
        exportarHref={`/api/${params.slug}/filtros/pessoas/exportar`}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[slug]/admin/filtros/PessoasFiltro.tsx" "src/app/[slug]/admin/filtros/page.tsx" "src/app/[slug]/mobilizador/filtros/page.tsx"
git commit -m "feat: botao Visualizar Dados Gerais na Central de Filtros + filtro redeDeId"
```

---

### Task 6: Tela de Usuários — botão na visão de rede

**Files:**
- Modify: `src/app/[slug]/admin/pessoas/page.tsx`

**Interfaces:**
- Consumes: `VisualizarDadosGeraisButton` (Task 4).

- [ ] **Step 1: Adicionar o import**

No topo do arquivo (linhas 1-11 atuais), depois de `import CadastrarUsuarioModal from './CadastrarUsuarioModal'`:

```ts
import CadastrarUsuarioModal from './CadastrarUsuarioModal'
import UsuariosTabs from './UsuariosTabs'
```

Vira:

```ts
import CadastrarUsuarioModal from './CadastrarUsuarioModal'
import UsuariosTabs from './UsuariosTabs'
import VisualizarDadosGeraisButton from '@/components/admin/VisualizarDadosGeraisButton'
```

- [ ] **Step 2: Renderizar o botão no cabeçalho, quando `rede` estiver presente**

O bloco do cabeçalho (linhas 146-159 atuais) é:

```tsx
      <div className="flex items-center justify-between flex-wrap gap-3 -mt-3">
        <h1 className="text-2xl font-bold text-gray-900">
          Usuários
          {donaDaRede && (
            <span className="font-normal text-gray-500">
              {' '}<span className="mx-1 text-gray-500">-</span> {rede === 'raiz' ? 'Rede Raiz' : `Rede de ${donaDaRede.nome}`}
            </span>
          )}
        </h1>
        <CadastrarUsuarioModal
          slug={params.slug}
          regioes={regioes}
          profissoes={profissoes}
          corPrimaria={gabinete.corPrimaria}
        />
      </div>
```

Substitua por:

```tsx
      <div className="flex items-center justify-between flex-wrap gap-3 -mt-3">
        <h1 className="text-2xl font-bold text-gray-900">
          Usuários
          {donaDaRede && (
            <span className="font-normal text-gray-500">
              {' '}<span className="mx-1 text-gray-500">-</span> {rede === 'raiz' ? 'Rede Raiz' : `Rede de ${donaDaRede.nome}`}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {rede && (
            <VisualizarDadosGeraisButton
              dashboardHref={`/${params.slug}/admin/dashboard`}
              searchParams={{ redeDeId: rede }}
              corPrimaria={gabinete.corPrimaria}
            />
          )}
          <CadastrarUsuarioModal
            slug={params.slug}
            regioes={regioes}
            profissoes={profissoes}
            corPrimaria={gabinete.corPrimaria}
          />
        </div>
      </div>
```

`rede` já vale tanto o id de um mobilizador quanto a string literal `'raiz'` (mesmo parâmetro que a própria tela já usa) — passar `{ redeDeId: rede }` cobre os dois casos sem lógica extra, porque o Dashboard/Central de Filtros entendem `redeDeId=raiz` do mesmo jeito que esta tela entende `rede=raiz` (Task 2).

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/pessoas/page.tsx"
git commit -m "feat: botao Visualizar Dados Gerais na visao de rede da tela de Usuarios"
```

---

### Task 7: `admin/dashboard/page.tsx` — `redeDeId`, fix de `profissaoId`, nomes pras badges

**Files:**
- Modify: `src/app/[slug]/admin/dashboard/page.tsx`

**Interfaces:**
- Consumes: `resolverIdsRedeDe` (Task 2), props novos de `DashboardConteudo` (Task 3).

- [ ] **Step 1: Import**

Junto aos imports existentes (linha 5 atual):

```ts
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
```

Vira:

```ts
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { resolverIdsRedeDe } from '@/lib/rede'
```

- [ ] **Step 2: `profissaoId` no filtro + `redeDeId` resolvido**

O bloco (linhas 50-59 atuais):

```ts
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
```

Vira:

```ts
  const filtrosPessoas: FiltrosPessoasParams = {
    regiaoId: searchParams.regiaoId,
    genero: searchParams.genero,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
    segmentoId: searchParams.segmentoId,
    profissaoId: searchParams.profissaoId,
    escolaridade: searchParams.escolaridade,
    religiao: searchParams.religiao,
  }
  const idsRede = await resolverIdsRedeDe(searchParams.redeDeId, gabinete.id)
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas, idsRede)

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

- [ ] **Step 3: Passar os novos props pro `DashboardConteudo`**

No JSX de retorno (por volta das linhas 209-210 atuais, logo depois de `religiao={religiaoRaw.map(...)}`):

```tsx
      escolaridade={escolaridadeRaw.map((e) => ({ chave: e.escolaridade, contagem: e._count.id }))}
      religiao={religiaoRaw.map((r) => ({ chave: r.religiao, contagem: r._count.id }))}
    />
```

Vira:

```tsx
      escolaridade={escolaridadeRaw.map((e) => ({ chave: e.escolaridade, contagem: e._count.id }))}
      religiao={religiaoRaw.map((r) => ({ chave: r.religiao, contagem: r._count.id }))}
      segmentoAtivo={segmentoAtivo}
      profissaoAtiva={profissaoAtiva}
      redeAtiva={searchParams.redeDeId === 'raiz' ? { nome: 'Rede Raiz' } : redeAtiva}
    />
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[slug]/admin/dashboard/page.tsx"
git commit -m "feat: Dashboard admin entende redeDeId e profissaoId, resolve nomes pras badges"
```

---

### Task 8: `mobilizador/dashboard/page.tsx` — fix de `profissaoId`, nomes pras badges

**Files:**
- Modify: `src/app/[slug]/mobilizador/dashboard/page.tsx`

**Interfaces:**
- Consumes: props novos de `DashboardConteudo` (Task 3) — só `segmentoAtivo`/`profissaoAtiva` (sem `redeAtiva`, fora de escopo pro mobilizador).

- [ ] **Step 1: `profissaoId` no filtro + nomes**

O bloco (por volta das linhas 54-63 atuais):

```ts
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
```

Vira:

```ts
  const filtrosPessoas: FiltrosPessoasParams = {
    regiaoId: searchParams.regiaoId,
    genero: searchParams.genero,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
    segmentoId: searchParams.segmentoId,
    profissaoId: searchParams.profissaoId,
    escolaridade: searchParams.escolaridade,
    religiao: searchParams.religiao,
  }
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas, idsRede)

  const [segmentoAtivo, profissaoAtiva] = await Promise.all([
    searchParams.segmentoId
      ? prisma.segmento.findFirst({ where: { id: searchParams.segmentoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
    searchParams.profissaoId
      ? prisma.profissao.findFirst({ where: { id: searchParams.profissaoId, gabineteId: gabinete.id }, select: { nome: true } })
      : Promise.resolve(null),
  ])
```

- [ ] **Step 2: Passar os novos props pro `DashboardConteudo`**

No JSX de retorno, encontre a linha equivalente a `religiao={religiaoRaw.map(...)}` (mesmo padrão do admin) e adicione logo abaixo, antes do `/>` de fechamento:

```tsx
      segmentoAtivo={segmentoAtivo}
      profissaoAtiva={profissaoAtiva}
```

(Sem `redeAtiva` — o mobilizador nunca tem `redeDeId` na URL, o prop fica `undefined` e nenhuma badge de rede aparece, que é o comportamento correto.)

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/mobilizador/dashboard/page.tsx"
git commit -m "feat: Dashboard mobilizador entende profissaoId, resolve nomes pras badges"
```

---

### Task 9: Verificação final

**Files:** nenhum arquivo novo — verificação automatizada + manual.

- [ ] **Step 1: Suíte de testes completa**

Run: `npx vitest run`
Expected: só as 2 falhas pré-existentes de `email.test.ts` (falta de `RESEND_API_KEY` local) — nenhuma outra falha.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 4: Verificação manual (gabinete real, requer navegador — controller assume diretamente)**

- [ ] Na Central de Filtros (admin), aplicar um filtro de região → botão "Visualizar Dados Gerais" aparece ao lado de "Exportar PDF/Excel". Clicar leva pro Dashboard, badge "Região: X" aparece, números batem com o que a Central de Filtros mostrava.
- [ ] Combinar região + sexo na Central de Filtros → duas badges aparecem no Dashboard depois de clicar "Visualizar Dados Gerais".
- [ ] Sem nenhum filtro na Central de Filtros → botão não aparece.
- [ ] Na tela de Usuários, entrar na rede de um mobilizador (`?rede=...`) → botão "Visualizar Dados Gerais" aparece perto do cabeçalho "Rede de Fulano". Clicar leva pro Dashboard com a badge "Rede: Fulano", e os números batem com a sub-rede **completa** dele (inclusive indicados de indicados, não só quem aparecia na tela de Usuários naquele nível específico).
- [ ] Testar também "Ver Rede Raiz" (`?rede=raiz`) → badge "Rede: Rede Raiz".
- [ ] No Dashboard com região + sexo ativos, clicar no × da badge de sexo → só região continua filtrando.
- [ ] No Dashboard com filtros ativos, clicar em "Limpar tudo" → volta pra visão geral; se período estava em "7 dias", continua em "7 dias" depois de limpar.
- [ ] No Dashboard filtrado por rede de um mobilizador, clicar numa fatia de pizza (ex: Sexo) → cai na Central de Filtros com região/rede combinados (mesmo filtro de rede + o novo filtro do clique).
- [ ] Repetir o fluxo da Central de Filtros no mobilizador (`/mobilizador/filtros` → "Visualizar Dados Gerais" → `/mobilizador/dashboard`), confirmando que aparece igual (sem opção de "rede", já que não se aplica).
- [ ] Filtrar por profissão na Central de Filtros (admin ou mobilizador) → confirmar que os números do Dashboard batem de verdade (fix da lacuna que esse plano fecha).

Sem commit nesta task — é só verificação. Se algum passo falhar, volte pra task correspondente, corrija, e repita a verificação a partir daí.
