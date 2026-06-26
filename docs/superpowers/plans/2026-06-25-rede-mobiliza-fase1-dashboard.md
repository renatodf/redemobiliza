# Dashboard do Administrador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o dashboard do administrador com filtro de período, cards de métricas e tabelas detalhadas (por segmento, ranking de mobilizadores, por origem, por região e por gênero).

**Architecture:** Page Server Component única em `/[slug]/admin/dashboard` que recebe `searchParams` para o filtro de período; todas as queries são paralelas via `Promise.all`; sem estado cliente — filtro funciona via URL.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Prisma, Tailwind CSS.

## Global Constraints

- Node.js ≥ 20, Next.js 14 App Router, TypeScript strict mode
- Todos os dados são lidos via Prisma — nunca SQL raw para métricas de aplicação
- `gabineteId` sempre extraído de sessão via layout existente (Plano 3 Task 1) — nunca de searchParams
- Período via `searchParams`: `periodo=hoje|7dias|30dias|personalizado`; `inicio` e `fim` para personalizado (formato `YYYY-MM-DD`)
- Métricas sem filtro de período: total de pessoas, mobilizadores ativos, membros da equipe
- Métricas com filtro: novas pessoas no período, ranking mobilizadores, origens
- Mobilizadores com zero convidados no período: aparecem no final da lista com contagem 0
- Ex-mobilizadores (`isMobilizador=false`) não aparecem no ranking mesmo com VinculoRede histórico
- `genero=null` exibido como "Não informado"; `origem=null` exibido como "Não informado"
- Dashboard em `/[slug]/admin/dashboard` — link para ele precisa ser adicionado na navegação do layout

---

## Mapa de Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/app/[slug]/admin/dashboard/page.tsx` | Page completa: filtro, cards e todas as tabelas |
| Modify: `src/app/[slug]/admin/layout.tsx` | Adicionar link "Dashboard" na navegação |

---

### Task 1: Cards de Métricas + Filtro de Período

**Files:**
- Create: `src/app/[slug]/admin/dashboard/page.tsx` (parcial — completado na Task 2)
- Modify: `src/app/[slug]/admin/layout.tsx`

**Interfaces:**
- Consome: `getGabineteBySlug` de `src/lib/gabinete.ts` (Plano 3 Task 1)
- `searchParams.periodo`: `'hoje' | '7dias' | '30dias' | 'personalizado'` (default: `'30dias'`)
- `searchParams.inicio` e `searchParams.fim`: strings `YYYY-MM-DD` (apenas quando `periodo='personalizado'`)

- [ ] **Passo 1: Adicionar link Dashboard no layout admin**

Abrir `src/app/[slug]/admin/layout.tsx` (Plano 3 Task 1). Adicionar uma barra de navegação após o banner de modo suporte e antes de `<main>`:

```typescript
{/* Navegação interna do painel — adicionar após o banner de modo suporte */}
<nav className="bg-white border-b border-gray-200 px-4">
  <div className="max-w-6xl mx-auto flex gap-6 text-sm">
    {[
      { href: `/${params.slug}/admin/dashboard`, label: 'Dashboard' },
      { href: `/${params.slug}/admin/pessoas`, label: 'Pessoas' },
      { href: `/${params.slug}/admin/segmentos`, label: 'Segmentos' },
      { href: `/${params.slug}/admin/regioes`, label: 'Regiões' },
      { href: `/${params.slug}/admin/profissoes`, label: 'Profissões' },
      { href: `/${params.slug}/admin/personalizacao`, label: 'Personalização' },
    ].map(({ href, label }) => (
      <a
        key={href}
        href={href}
        className="py-3 border-b-2 border-transparent hover:border-blue-500 hover:text-blue-700 text-gray-600 transition-colors"
      >
        {label}
      </a>
    ))}
  </div>
</nav>
```

- [ ] **Passo 2: Criar utilitário de cálculo de intervalo de datas**

No início de `src/app/[slug]/admin/dashboard/page.tsx`, criar a função de cálculo inline (não extrair para arquivo separado — é usada apenas aqui):

```typescript
function calcularIntervalo(periodo: string, inicio?: string, fim?: string): { dataInicio: Date; dataFim: Date } {
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

  if (periodo === 'personalizado' && inicio && fim) {
    const dataInicio = new Date(`${inicio}T00:00:00`)
    const dataFimCustom = new Date(`${fim}T23:59:59.999`)
    return { dataInicio, dataFim: dataFimCustom }
  }

  // Default: 30 dias
  const dataInicio = new Date(agora)
  dataInicio.setDate(dataInicio.getDate() - 30)
  dataInicio.setHours(0, 0, 0, 0)
  return { dataInicio, dataFim }
}
```

- [ ] **Passo 3: Criar page do dashboard com métricas fixas e filtradas**

```typescript
// src/app/[slug]/admin/dashboard/page.tsx
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { notFound } from 'next/navigation'

function calcularIntervalo(
  periodo: string,
  inicio?: string,
  fim?: string
): { dataInicio: Date; dataFim: Date } {
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
  if (periodo === 'personalizado' && inicio && fim) {
    return {
      dataInicio: new Date(`${inicio}T00:00:00`),
      dataFim: new Date(`${fim}T23:59:59.999`),
    }
  }
  // Default: 30 dias
  const dataInicio = new Date(agora)
  dataInicio.setDate(dataInicio.getDate() - 30)
  dataInicio.setHours(0, 0, 0, 0)
  return { dataInicio, dataFim }
}

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

const LABEL_GENERO: Record<string, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  outro: 'Outro',
  prefiro_nao_informar: 'Prefiro não informar',
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: {
    periodo?: string
    inicio?: string
    fim?: string
  }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const periodo = searchParams.periodo ?? '30dias'
  const { dataInicio, dataFim } = calcularIntervalo(
    periodo,
    searchParams.inicio,
    searchParams.fim
  )

  // Todas as queries em paralelo para melhor performance
  const [
    totalPessoas,
    novasPessoas,
    totalMobilizadores,
    totalEquipe,
    segmentosComContagem,
    mobilizadoresAtivos,
    pessoasPorOrigem,
    pessoasPorRegiao,
    pessoasPorGenero,
  ] = await Promise.all([
    // Total de pessoas — estado atual, sem filtro de período
    prisma.pessoa.count({ where: { gabineteId: gabinete.id } }),

    // Novas pessoas no período
    prisma.pessoa.count({
      where: {
        gabineteId: gabinete.id,
        criadoEm: { gte: dataInicio, lte: dataFim },
      },
    }),

    // Mobilizadores ativos — sem filtro
    prisma.pessoa.count({ where: { gabineteId: gabinete.id, isMobilizador: true } }),

    // Membros da equipe — sem filtro
    prisma.pessoa.count({ where: { gabineteId: gabinete.id, isEquipe: true } }),

    // Pessoas por segmento
    prisma.segmento.findMany({
      where: { gabineteId: gabinete.id, status: 'ativo' },
      select: {
        nome: true,
        tipo: true,
        _count: { select: { pessoas: true } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    // Mobilizadores ativos com contagem de convidados no período
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true },
      select: {
        id: true,
        nome: true,
        redesComoIndicador: {
          where: { criadoEm: { gte: dataInicio, lte: dataFim } },
          select: { id: true },
        },
      },
    }),

    // Pessoas por origem — estado atual, todos os registros
    prisma.pessoa.groupBy({
      by: ['origem'],
      where: { gabineteId: gabinete.id },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    // Regiões com contagem de pessoas
    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id },
      select: {
        nome: true,
        ativa: true,
        _count: { select: { pessoas: true } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    // Pessoas por gênero
    prisma.pessoa.groupBy({
      by: ['genero'],
      where: { gabineteId: gabinete.id },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
  ])

  // Processar ranking de mobilizadores
  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)

  // Helper para mostrar label do período
  const labelPeriodo: Record<string, string> = {
    hoje: 'Hoje',
    '7dias': 'Últimos 7 dias',
    '30dias': 'Últimos 30 dias',
    personalizado: `${searchParams.inicio ?? '?'} a ${searchParams.fim ?? '?'}`,
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

        {/* Filtro de período */}
        <div className="flex flex-wrap gap-2">
          {(['hoje', '7dias', '30dias'] as const).map((p) => (
            <a
              key={p}
              href={`/${params.slug}/admin/dashboard?periodo=${p}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                periodo === p
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {labelPeriodo[p]}
            </a>
          ))}
          <form method="GET" action={`/${params.slug}/admin/dashboard`} className="flex gap-1">
            <input type="hidden" name="periodo" value="personalizado" />
            <input
              name="inicio"
              type="date"
              defaultValue={searchParams.inicio}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            />
            <input
              name="fim"
              type="date"
              defaultValue={searchParams.fim}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-sm hover:border-blue-400"
            >
              Aplicar
            </button>
          </form>
        </div>
      </div>

      <p className="text-sm text-gray-500 -mt-4">
        Período selecionado: <strong>{labelPeriodo[periodo] ?? periodo}</strong>
      </p>

      {/* Cards de métricas */}
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
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Equipe</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">{totalEquipe}</p>
          <p className="text-xs text-gray-400 mt-0.5">membros</p>
        </div>
      </div>

      {/* Tabelas — veja Task 2 */}
      {/* PLACEHOLDER_TABELAS */}
    </div>
  )
}
```

- [ ] **Passo 4: Verificar que o TypeScript compila**

```bash
npx tsc --noEmit
```

Saída esperada: zero erros.

- [ ] **Passo 5: Commit parcial**

```bash
git add src/app/[slug]/admin/dashboard/page.tsx \
        src/app/[slug]/admin/layout.tsx
git commit -m "feat: dashboard — filtro de período e cards de métricas"
```

---

### Task 2: Tabelas Detalhadas do Dashboard

**Files:**
- Modify: `src/app/[slug]/admin/dashboard/page.tsx` (substituir `{/* PLACEHOLDER_TABELAS */}` pelas tabelas)

**Interfaces:**
- Consome dados já calculados em Task 1: `segmentosComContagem`, `rankingMobilizadores`, `pessoasPorOrigem`, `pessoasPorRegiao`, `pessoasPorGenero`
- `LABEL_ORIGEM` e `LABEL_GENERO` já definidos na Task 1

- [ ] **Passo 1: Substituir o placeholder pelas tabelas no JSX**

No `src/app/[slug]/admin/dashboard/page.tsx`, substituir a linha `{/* PLACEHOLDER_TABELAS */}` pelo seguinte bloco:

```typescript
{/* Tabelas de detalhe */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

  {/* Pessoas por segmento */}
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
              <td className="py-2 text-right font-medium text-gray-900">
                {s._count.pessoas}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>

  {/* Ranking de mobilizadores */}
  <section className="bg-white rounded-xl shadow-sm p-5">
    <h2 className="text-base font-semibold text-gray-800 mb-1">
      Ranking de mobilizadores
    </h2>
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
                <span className="text-gray-400 mr-2 font-mono text-xs">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {m.nome}
              </td>
              <td className="py-2 text-right font-medium text-gray-900">
                {m.contagem}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>

  {/* Pessoas por origem */}
  <section className="bg-white rounded-xl shadow-sm p-5">
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
            <tr key={o.origem ?? 'null'}>
              <td className="py-2 text-gray-800">
                {o.origem ? (LABEL_ORIGEM[o.origem] ?? o.origem) : 'Não informado'}
              </td>
              <td className="py-2 text-right font-medium text-gray-900">
                {o._count.id}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>

  {/* Pessoas por região */}
  <section className="bg-white rounded-xl shadow-sm p-5">
    <h2 className="text-base font-semibold text-gray-800 mb-3">
      Pessoas por região
    </h2>
    {pessoasPorRegiao.filter((r) => r._count.pessoas > 0).length === 0 ? (
      <p className="text-sm text-gray-500">Nenhuma pessoa com região cadastrada.</p>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left pb-2 text-gray-600 font-medium">Região</th>
            <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {pessoasPorRegiao
            .filter((r) => r._count.pessoas > 0)
            .map((r) => (
              <tr key={r.nome}>
                <td className="py-2 text-gray-800">
                  {r.nome}
                  {!r.ativa && (
                    <span className="ml-1 text-xs text-gray-400">(desativada)</span>
                  )}
                </td>
                <td className="py-2 text-right font-medium text-gray-900">
                  {r._count.pessoas}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    )}
  </section>

  {/* Pessoas por gênero */}
  <section className="bg-white rounded-xl shadow-sm p-5 lg:col-span-2">
    <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por gênero</h2>
    {pessoasPorGenero.length === 0 ? (
      <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left pb-2 text-gray-600 font-medium">Gênero</th>
            <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
            <th className="text-right pb-2 text-gray-600 font-medium">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {pessoasPorGenero.map((g) => (
            <tr key={g.genero ?? 'null'}>
              <td className="py-2 text-gray-800">
                {g.genero ? (LABEL_GENERO[g.genero] ?? g.genero) : 'Não informado'}
              </td>
              <td className="py-2 text-right font-medium text-gray-900">
                {g._count.id}
              </td>
              <td className="py-2 text-right text-gray-500">
                {totalPessoas > 0
                  ? `${Math.round((g._count.id / totalPessoas) * 100)}%`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>

</div>
```

- [ ] **Passo 2: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: zero erros.

- [ ] **Passo 3: Testar o dashboard completo**

```bash
npm run dev

# Acessar http://localhost:3000/[slug]/admin/dashboard

# 1. Cards de métricas: verificar que os números fazem sentido
#    (total pessoas = contagem no banco, mobilizadores = isMobilizador=true count)

# 2. Filtro "Hoje" → URL muda para ?periodo=hoje → novas pessoas = cadastros de hoje

# 3. Filtro "Últimos 7 dias" → URL muda para ?periodo=7dias

# 4. Período personalizado:
#    → preencher datas → Aplicar → URL com ?periodo=personalizado&inicio=...&fim=...

# 5. Tabela "Pessoas por segmento":
#    → deve listar segmentos ativos com contagem total de pessoas vinculadas

# 6. Ranking de mobilizadores:
#    → mobilizadores com mais convidados no período aparecem primeiro
#    → mobilizadores com zero convidados no período aparecem no final

# 7. Tabela de origem:
#    → "Não informado" para Pessoas com origem=null

# 8. Tabela de região:
#    → regiões desativadas com pessoas vinculadas exibem "(desativada)"
#    → regiões com zero pessoas não aparecem

# 9. Tabela de gênero:
#    → percentuais calculados corretamente
#    → "Não informado" para genero=null
```

- [ ] **Passo 4: Commit final**

```bash
git add src/app/[slug]/admin/dashboard/page.tsx
git commit -m "feat: dashboard com tabelas de segmentos, mobilizadores, origens, regiões e gênero"
```

---

## Auto-Review

**Cobertura da spec:**

| Requisito | Task |
|---|---|
| Total de pessoas (estado atual, sem período) | Task 1 — `totalPessoas` |
| Novas pessoas no período | Task 1 — `novasPessoas` com `criadoEm gte/lte` |
| Total mobilizadores ativos (sem período) | Task 1 — `totalMobilizadores` |
| Total membros equipe (sem período) | Task 1 — `totalEquipe` |
| Filtro por período (hoje / 7 dias / 30 dias / personalizado) | Task 1 — `searchParams.periodo` |
| Pessoas por segmento (tabela) | Task 2 — `segmentosComContagem` com `_count` |
| Ranking mobilizadores por convidados no período | Task 2 — `rankingMobilizadores` filtrado por `criadoEm` |
| Mobilizadores com zero convidados aparecem no final | Task 2 — sort por contagem, todos incluídos |
| Ex-mobilizadores não aparecem no ranking | Task 1 — query filtra `isMobilizador: true` |
| Pessoas por origem (tabela) | Task 2 — `pessoasPorOrigem` via `groupBy` |
| `origin=null` → "Não informado" | Task 2 — guard `o.origem ? LABEL_ORIGEM[o.origem] : 'Não informado'` |
| Pessoas por região administrativa | Task 2 — `pessoasPorRegiao` |
| Pessoas por gênero (tabela + percentual) | Task 2 — `pessoasPorGenero` com cálculo `%` |
| `genero=null` → "Não informado" | Task 2 — guard `g.genero ? LABEL_GENERO[g.genero] : 'Não informado'` |
| Label correto para cada valor de origem | Task 1 — `LABEL_ORIGEM` mapa completo |
| Label correto para cada valor de gênero | Task 1 — `LABEL_GENERO` mapa completo |
| Link "Dashboard" na navegação admin | Task 1 — adicionado em `layout.tsx` |
| Todas as queries em paralelo | Task 1 — `Promise.all([...])` ✅ |

**Verificações de placeholder:** Nenhum "TBD" ou "TODO" encontrado. O `{/* PLACEHOLDER_TABELAS */}` é substituído integralmente na Task 2.

**Consistência de tipos:**
- `segmentosComContagem` usa `_count: { select: { pessoas: true } }` — relação `Segmento.pessoas: PessoaSegmento[]` existe no schema ✅
- `pessoasPorRegiao` usa `_count: { select: { pessoas: true } }` — relação `Regiao.pessoas: Pessoa[]` existe no schema ✅
- `redesComoIndicador` — relação `Pessoa.redesComoIndicador: VinculoRede[] @relation("Indicador")` existe no schema ✅
- `pessoasPorOrigem` usa `groupBy(['origem'])` — `Pessoa.origem String?` existe no schema ✅
- `pessoasPorGenero` usa `groupBy(['genero'])` — `Pessoa.genero String?` existe no schema ✅
- `LABEL_PERIODO` resolve todos os valores possíveis sem fallback indefinido ✅
