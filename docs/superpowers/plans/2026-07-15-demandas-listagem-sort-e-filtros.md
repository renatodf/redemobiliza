# Listagem de Demandas — ordenação alfabética + ocultar filtros — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na listagem `/admin/demandas`, adicionar ordenação alfabética clicável às colunas Solicitante/Área/Status (mesmo padrão já usado em Responsável/Prazo) e ocultar (sem apagar) o formulário de filtros visível.

**Architecture:** Mudança inteira em um único arquivo (`src/app/[slug]/admin/demandas/page.tsx`), reaproveitando o componente `SortableHeader` já existente sem alterá-lo. O formulário de filtros é envolvido num comentário JSX em vez de removido, preservando a reativação futura.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5 (strict).

## Global Constraints

- "Status" ordena pelo valor bruto do campo (`aberta`/`atendida`/`expirada`/`nao_atendida`) em ordem alfabética — não por gravidade/prioridade.
- Nenhuma mudança na lógica de dados (`where`, `temFiltro`, período padrão de 30 dias) — ela continua respondendo aos mesmos parâmetros de URL (usados pelos links do Dashboard), só o formulário visual some.
- O formulário de filtros é **comentado**, não apagado — deve ser trivialmente reversível (remover o comentário) se o usuário pedir de volta.
- Este projeto não escreve teste automatizado para páginas que dependem de Prisma/UI (convenção já estabelecida) — verificação é manual.

---

### Task 1: Ordenação alfabética em Solicitante/Área/Status

**Files:**
- Modify: `src/app/[slug]/admin/demandas/page.tsx`

**Interfaces:**
- Consumes: `SortableHeader` (`src/components/SortableHeader.tsx`, já existe, props `{ label: string; field: string }` — sem nenhuma mudança nele).

- [ ] **Step 1: Estender `buildOrderBy`**

Bloco atual (topo do arquivo):

```ts
function buildOrderBy(sort?: string, order?: string) {
  const direcao = order === 'asc' ? ('asc' as const) : ('desc' as const)
  if (sort === 'prazoDesfecho') return { prazoDesfecho: direcao }
  if (sort === 'responsavel') return { responsavel: { nome: direcao } }
  return { criadoEm: 'desc' as const }
}
```

Vira:

```ts
function buildOrderBy(sort?: string, order?: string) {
  const direcao = order === 'asc' ? ('asc' as const) : ('desc' as const)
  if (sort === 'prazoDesfecho') return { prazoDesfecho: direcao }
  if (sort === 'responsavel') return { responsavel: { nome: direcao } }
  if (sort === 'solicitante') return { solicitante: { nome: direcao } }
  if (sort === 'area') return { area: { nome: direcao } }
  if (sort === 'status') return { status: direcao }
  return { criadoEm: 'desc' as const }
}
```

- [ ] **Step 2: Trocar os cabeçalhos estáticos por `SortableHeader`**

Bloco atual (dentro de `<thead>`):

```tsx
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Solicitante</th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Responsável" field="responsavel" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Área</th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Prazo" field="prazoDesfecho" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
```

Vira:

```tsx
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Solicitante" field="solicitante" />
              </th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Responsável" field="responsavel" />
              </th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Área" field="area" />
              </th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Prazo" field="prazoDesfecho" />
              </th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Status" field="status" />
              </th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/demandas/page.tsx"
git commit -m "feat: ordenacao alfabetica em Solicitante/Area/Status na listagem de Demandas"
```

---

### Task 2: Ocultar (sem apagar) o formulário de filtros

**Files:**
- Modify: `src/app/[slug]/admin/demandas/page.tsx`

**Interfaces:** nenhuma — mudança isolada de JSX, não afeta nenhum tipo/função consumida por outra task.

- [ ] **Step 1: Envolver o bloco de filtros num comentário JSX**

Bloco atual (entre os cards de resumo e a tabela):

```tsx
      {/* Filtros */}
      <form method="GET" className="bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <select name="status" defaultValue={searchParams.status ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos os status</option>
            <option value="aberta">Em aberto</option>
            <option value="expirada">Expirada</option>
            <option value="atendida">Atendida</option>
            <option value="nao_atendida">Não atendida</option>
          </select>

          <select name="areaId" defaultValue={searchParams.areaId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas as áreas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>

          <select name="responsavelId" defaultValue={searchParams.responsavelId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos os responsáveis</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>

          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas as regiões</option>
            {regioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>

          <select name="prazoAlterado" defaultValue={searchParams.prazoAlterado ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Prazo alterado: todos</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>

          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="px-4 py-1.5 rounded-md text-sm"
          >
            Filtrar
          </button>
        </div>

        <div className="flex gap-3 mt-3">
          <input name="dataInicio" type="date" defaultValue={searchParams.dataInicio ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input name="dataFim" type="date" defaultValue={searchParams.dataFim ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <a href={`/${params.slug}/admin/demandas`} className="text-sm text-gray-500 hover:text-gray-700 self-center">
            Limpar filtros
          </a>
        </div>
      </form>
```

Vira (bloco inteiro envolvido num único comentário JSX — o parser trata tudo entre `{/*` e `*/}`
como texto, então o `<form>` original fica preservado byte a byte, só não é renderizado):

```tsx
      {/* Filtros — ocultados a pedido do usuário em 15/07/2026 (spec:
      docs/superpowers/specs/2026-07-15-demandas-listagem-sort-e-filtros-design.md).
      A lógica de dados (where/temFiltro no topo deste arquivo) continua ativa e
      respondendo aos mesmos parâmetros de URL (usados pelos links do Dashboard,
      ex. clique numa fatia de "Demandas do mês") — só este formulário visual foi
      ocultado. Para reativar, apague esta linha de nota e as duas marcações
      `{/*`/`*/}` abaixo, sem tocar no conteúdo entre elas.

      <form method="GET" className="bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <select name="status" defaultValue={searchParams.status ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos os status</option>
            <option value="aberta">Em aberto</option>
            <option value="expirada">Expirada</option>
            <option value="atendida">Atendida</option>
            <option value="nao_atendida">Não atendida</option>
          </select>

          <select name="areaId" defaultValue={searchParams.areaId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas as áreas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>

          <select name="responsavelId" defaultValue={searchParams.responsavelId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos os responsáveis</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>

          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas as regiões</option>
            {regioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>

          <select name="prazoAlterado" defaultValue={searchParams.prazoAlterado ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Prazo alterado: todos</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>

          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="px-4 py-1.5 rounded-md text-sm"
          >
            Filtrar
          </button>
        </div>

        <div className="flex gap-3 mt-3">
          <input name="dataInicio" type="date" defaultValue={searchParams.dataInicio ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input name="dataFim" type="date" defaultValue={searchParams.dataFim ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <a href={`/${params.slug}/admin/demandas`} className="text-sm text-gray-500 hover:text-gray-700 self-center">
            Limpar filtros
          </a>
        </div>
      </form>
      */}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro. `tsconfig.json` não tem `noUnusedLocals`/`noUnusedParameters` ativado, então
`areas`/`colaboradores`/`regioes`/`corTexto` (que deixam de ser lidos no JSX renderizado, já que o
bloco inteiro virou comentário) não geram erro de compilação — não remova essas variáveis, elas
alimentam o formulário comentado, que existe de propósito.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[slug]/admin/demandas/page.tsx"
git commit -m "feat: oculta (sem remover) o formulario de filtros da listagem de Demandas"
```

---

### Task 3: Verificação final

**Files:** nenhum arquivo novo — verificação manual.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 3: Verificação manual (gabinete real, requer navegador — controller assume diretamente)**

- [ ] `/admin/demandas` não mostra mais o formulário de filtros (selects, datas, botão Filtrar,
  link Limpar filtros).
- [ ] Clicar no cabeçalho "Solicitante" ordena a lista pelo nome do solicitante — ciclo de 3
  estados (padrão → asc → desc → padrão), mesmo comportamento já visto em "Responsável".
- [ ] Mesmo teste pra "Área" e "Status".
- [ ] No Dashboard, clicar numa fatia/barra de "Demandas do mês" ainda chega em `/admin/demandas`
  com o recorte certo (contagem batendo com o que o Dashboard mostrava) — confirma que ocultar o
  formulário não quebrou a lógica de `where`/`temFiltro` que os links do Dashboard dependem.

Sem commit nesta task — é só verificação. Se algum passo falhar, volte pra task correspondente,
corrija, e repita a verificação a partir daí.
