# Nome clicável abre a ficha da pessoa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em 6 telas específicas (Central de Filtros → abas Pessoas/Demandas/Banco de Talentos, listagem principal de Demandas admin e mobilizador, Dashboard → Ranking de mobilizadores), o nome de uma pessoa vira um link que abre a ficha dela (`/[slug]/admin/pessoas/[id]` ou `/[slug]/mobilizador/pessoas/[id]`, rotas já existentes).

**Architecture:** Mudança de UI + pequenos ajustes de query em componentes/páginas já existentes. Nenhum componente novo, nenhuma Server Action nova, nenhuma rota nova, nenhuma mudança de schema. Cada componente compartilhado (`PessoasFiltro.tsx`, `DemandasFiltro.tsx`) ganha um novo prop `baseHrefPessoa: string`, passado por cada `page.tsx` chamador com o caminho certo pro papel (admin vs mobilizador) — mesmo padrão já usado por `dashboardHref`/`filtrosHref`/`demandasHref` em `DashboardConteudo.tsx`. Onde o dado ainda não trazia o `id` da pessoa (selects do Prisma, `rankingMobilizadores`), o `id` passa a ser selecionado/repassado.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5 + Tailwind 3.4 + Prisma 7.8.

## Global Constraints

- `UsuariosTable.tsx`, `RedesTable.tsx` e `CadastrosBusca.tsx` **não são tocados** — comportamento atual mantido (ver spec, seção "Contexto").
- A ficha `/[slug]/mobilizador/pessoas/[id]` já é protegida por checagem de sub-árvore (`mobilizador/pessoas/[pessoaId]/page.tsx`) — **essa checagem não muda**. Este plano só decide, na origem, se o link aparece.
- Nas duas telas de Demandas do mobilizador (Central de Filtros → aba Demandas, e a listagem principal `/mobilizador/demandas`), o nome do **Solicitante** só vira link se a pessoa estiver na sub-rede do mobilizador logado (incluindo ele mesmo) — caso contrário, fica texto puro, sem gerar link que dá 404. O **Responsável** nessas mesmas telas é sempre o próprio mobilizador logado (`buildWhereDemandas(..., pessoa.id)`), então sempre vira link.
- Estilo do link: reaproveita o padrão de `UsuariosTable.tsx` (`hover:underline`, sem virar um link azul destoante) — preserva a cor de texto que a célula já tinha antes (herdada, se não havia `className` de cor; ou a cor explícita já usada, ex. `text-gray-600`), só acrescenta `hover:underline`.
- Mesma aba/mesma janela (`<Link>` padrão do Next, sem `target="_blank"`).

Spec completo: `docs/superpowers/specs/2026-07-23-nome-clicavel-abre-ficha-design.md`.

---

### Task 1: Central de Filtros → aba Pessoas

**Files:**
- Modify: `src/app/[slug]/admin/filtros/PessoasFiltro.tsx`
- Modify: `src/app/[slug]/admin/filtros/page.tsx`
- Modify: `src/app/[slug]/mobilizador/filtros/page.tsx`

**Interfaces:**
- Produces: `PessoasFiltro` ganha um novo prop obrigatório `baseHrefPessoa: string`.

`PessoaLinha` já tem `id: string` — nenhuma mudança de query necessária nesta task.

- [ ] **Step 1: Adicionar o import de `Link` e o prop `baseHrefPessoa` em `PessoasFiltro.tsx`**

No topo do arquivo (linha 1-4 atual):

```tsx
// src/app/[slug]/admin/filtros/PessoasFiltro.tsx
import Pagination from '@/components/admin/Pagination'
import VisualizarDadosGeraisButton from '@/components/admin/VisualizarDadosGeraisButton'
import { LIMITE_EXPORT_SINCRONO } from '@/lib/filtros-pessoas'
```

Substituir por:

```tsx
// src/app/[slug]/admin/filtros/PessoasFiltro.tsx
import Link from 'next/link'
import Pagination from '@/components/admin/Pagination'
import VisualizarDadosGeraisButton from '@/components/admin/VisualizarDadosGeraisButton'
import { LIMITE_EXPORT_SINCRONO } from '@/lib/filtros-pessoas'
```

Localizar a assinatura da função (linhas 17-47 atuais):

```tsx
export default function PessoasFiltro({
  baseHref,
  dashboardHref,
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
  dashboardHref: string
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

Substituir por (adiciona `baseHrefPessoa` logo após `baseHref`, nos dois blocos — destructure e tipo):

```tsx
export default function PessoasFiltro({
  baseHref,
  baseHrefPessoa,
  dashboardHref,
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
  baseHrefPessoa: string
  dashboardHref: string
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

- [ ] **Step 2: Envolver o nome em `<Link>` na tabela**

Localizar (linha 187 atual):

```tsx
                <td className="py-2 pr-3">{p.nome}</td>
```

Substituir por:

```tsx
                <td className="py-2 pr-3">
                  <Link href={`${baseHrefPessoa}/${p.id}`} className="hover:underline">
                    {p.nome}
                  </Link>
                </td>
```

- [ ] **Step 3: Passar `baseHrefPessoa` nos dois chamadores**

Em `src/app/[slug]/admin/filtros/page.tsx`, localizar (linha 93-94 atual):

```tsx
      <PessoasFiltro
        baseHref={`/${params.slug}/admin/filtros`}
```

Substituir por:

```tsx
      <PessoasFiltro
        baseHref={`/${params.slug}/admin/filtros`}
        baseHrefPessoa={`/${params.slug}/admin/pessoas`}
```

Em `src/app/[slug]/mobilizador/filtros/page.tsx`, localizar (linha 94-95 atual):

```tsx
      <PessoasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros`}
```

Substituir por:

```tsx
      <PessoasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros`}
        baseHrefPessoa={`/${params.slug}/mobilizador/pessoas`}
```

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 3 arquivos desta task.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[slug]/admin/filtros/PessoasFiltro.tsx" "src/app/[slug]/admin/filtros/page.tsx" "src/app/[slug]/mobilizador/filtros/page.tsx"
git commit -m "$(cat <<'EOF'
feat: nome clicável na aba Pessoas da Central de Filtros

Abre a ficha da pessoa (admin ou mobilizador, conforme o papel de
quem está vendo). Sempre linkável — a listagem já é escopada pela
sub-rede do lado mobilizador.
EOF
)"
```

---

### Task 2: Central de Filtros → aba Banco de Talentos

**Files:**
- Modify: `src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx`
- Modify: `src/app/[slug]/admin/filtros/banco-talentos/page.tsx`

**Interfaces:**
- Produces: `BancoTalentosFiltro` ganha um novo prop obrigatório `baseHrefPessoa: string`. Esta aba só existe no admin (confirmado — sem contraparte no mobilizador), então `baseHrefPessoa` é sempre `/[slug]/admin/pessoas`.

`TalentoLinha.pessoaId` já existe — nenhuma mudança de query necessária.

- [ ] **Step 1: Adicionar o import de `Link` e o prop `baseHrefPessoa`**

No topo do arquivo (linhas 1-6 atuais):

```tsx
'use client'

import { useState } from 'react'
import Pagination from '@/components/admin/Pagination'
import { corTextoContraste } from '@/lib/cor-contraste'
import { ComboBoxMultiplo } from '@/components/admin/ComboBoxMultiplo'
```

Substituir por:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Pagination from '@/components/admin/Pagination'
import { corTextoContraste } from '@/lib/cor-contraste'
import { ComboBoxMultiplo } from '@/components/admin/ComboBoxMultiplo'
```

Localizar a assinatura da função (linhas 19-43 atuais):

```tsx
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
```

Substituir por:

```tsx
export default function BancoTalentosFiltro({
  baseHref,
  baseHrefPessoa,
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
  baseHrefPessoa: string
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
```

- [ ] **Step 2: Envolver o nome em `<Link>` na tabela**

Localizar (linha 202 atual):

```tsx
                <td className="py-2 pr-3">{t.pessoa.nome}</td>
```

Substituir por:

```tsx
                <td className="py-2 pr-3">
                  <Link href={`${baseHrefPessoa}/${t.pessoaId}`} className="hover:underline">
                    {t.pessoa.nome}
                  </Link>
                </td>
```

- [ ] **Step 3: Passar `baseHrefPessoa` no chamador**

Em `src/app/[slug]/admin/filtros/banco-talentos/page.tsx`, localizar (linha 76-77 atual):

```tsx
      <BancoTalentosFiltro
        baseHref={`/${params.slug}/admin/filtros/banco-talentos`}
```

Substituir por:

```tsx
      <BancoTalentosFiltro
        baseHref={`/${params.slug}/admin/filtros/banco-talentos`}
        baseHrefPessoa={`/${params.slug}/admin/pessoas`}
```

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 2 arquivos desta task.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx" "src/app/[slug]/admin/filtros/banco-talentos/page.tsx"
git commit -m "$(cat <<'EOF'
feat: nome clicável na aba Banco de Talentos da Central de Filtros

Abre a ficha da pessoa (admin — aba não existe no mobilizador).
EOF
)"
```

---

### Task 3: Central de Filtros → aba Demandas

**Files:**
- Modify: `src/app/[slug]/admin/filtros/DemandasFiltro.tsx`
- Modify: `src/app/[slug]/admin/filtros/demandas/page.tsx`
- Modify: `src/app/[slug]/mobilizador/filtros/demandas/page.tsx`

**Interfaces:**
- Produces: `DemandasFiltro` ganha `baseHrefPessoa: string` (obrigatório) e `idsRedeSolicitante?: Set<string>` (opcional — só o lado mobilizador passa; quando ausente, todo solicitante vira link).
- Consumes (da Task de infraestrutura já existente, não desta plan): `coletarSubRedeIds(pessoaId: string, gabineteId: string): Promise<string[]>`, de `@/lib/rede` — **importante**: essa função exclui o próprio `pessoaId` do resultado (`WHERE id != pessoaId` na query), então o chamador do lado mobilizador precisa incluir o próprio id manualmente no `Set` (ver Step 4).

`DemandaLinha.solicitante`/`.responsavel` hoje só têm `{ nome: string }` — ganham `id: string` (schema muda, então os dois `page.tsx` chamadores também precisam do `id: true` no `select` do Prisma).

- [ ] **Step 1: Adicionar `id` ao tipo `DemandaLinha`, o import de `Link`, e os novos props em `DemandasFiltro.tsx`**

No topo do arquivo (linhas 1-14 atuais):

```tsx
// src/app/[slug]/admin/filtros/DemandasFiltro.tsx
import Pagination from '@/components/admin/Pagination'
import VisualizarDadosGeraisDemandasButton from '@/components/admin/VisualizarDadosGeraisDemandasButton'
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
```

Substituir por:

```tsx
// src/app/[slug]/admin/filtros/DemandasFiltro.tsx
import Link from 'next/link'
import Pagination from '@/components/admin/Pagination'
import VisualizarDadosGeraisDemandasButton from '@/components/admin/VisualizarDadosGeraisDemandasButton'
import { statusDemandaPill } from '@/lib/status-demanda'

type DemandaLinha = {
  id: string
  titulo: string
  status: string
  prazoDesfecho: Date
  area: { nome: string }
  solicitante: { id: string; nome: string }
  responsavel: { id: string; nome: string }
}
```

Localizar a assinatura da função (linhas 16-40 atuais):

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

Substituir por:

```tsx
export default function DemandasFiltro({
  baseHref,
  baseHrefPessoa,
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
  idsRedeSolicitante,
}: {
  baseHref: string
  baseHrefPessoa: string
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
  idsRedeSolicitante?: Set<string>
}) {
```

- [ ] **Step 2: Envolver Solicitante (condicional) e Responsável (sempre) em `<Link>` na tabela**

Localizar (linhas 144-145 atuais):

```tsx
                  <td className="py-2 pr-3">{d.solicitante.nome}</td>
                  <td className="py-2 pr-3">{d.responsavel.nome}</td>
```

Substituir por:

```tsx
                  <td className="py-2 pr-3">
                    {!idsRedeSolicitante || idsRedeSolicitante.has(d.solicitante.id) ? (
                      <Link href={`${baseHrefPessoa}/${d.solicitante.id}`} className="hover:underline">
                        {d.solicitante.nome}
                      </Link>
                    ) : (
                      d.solicitante.nome
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <Link href={`${baseHrefPessoa}/${d.responsavel.id}`} className="hover:underline">
                      {d.responsavel.nome}
                    </Link>
                  </td>
```

- [ ] **Step 3: `id: true` no select do Prisma e `baseHrefPessoa` no chamador admin**

Em `src/app/[slug]/admin/filtros/demandas/page.tsx`, localizar (linhas 46-48 atuais):

```tsx
        area: { select: { nome: true } },
        solicitante: { select: { nome: true } },
        responsavel: { select: { nome: true } },
```

Substituir por:

```tsx
        area: { select: { nome: true } },
        solicitante: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true } },
```

Localizar (linha 72-73 atual):

```tsx
      <DemandasFiltro
        baseHref={`/${params.slug}/admin/filtros/demandas`}
```

Substituir por:

```tsx
      <DemandasFiltro
        baseHref={`/${params.slug}/admin/filtros/demandas`}
        baseHrefPessoa={`/${params.slug}/admin/pessoas`}
```

(Sem `idsRedeSolicitante` no lado admin — prop fica `undefined`, todo solicitante vira link.)

- [ ] **Step 4: `id: true` no select, cálculo de `idsRedeSolicitante`, e `baseHrefPessoa` no chamador mobilizador**

Em `src/app/[slug]/mobilizador/filtros/demandas/page.tsx`, localizar o import (linhas 1-7 atuais):

```tsx
// src/app/[slug]/mobilizador/filtros/demandas/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import FiltrosTabs from '../../../admin/filtros/FiltrosTabs'
import DemandasFiltro from '../../../admin/filtros/DemandasFiltro'
```

Substituir por:

```tsx
// src/app/[slug]/mobilizador/filtros/demandas/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { buildWhereDemandas, type FiltrosDemandasParams } from '@/lib/filtros-demandas'
import { coletarSubRedeIds } from '@/lib/rede'
import FiltrosTabs from '../../../admin/filtros/FiltrosTabs'
import DemandasFiltro from '../../../admin/filtros/DemandasFiltro'
```

Localizar (linhas 46-48 atuais):

```tsx
        area: { select: { nome: true } },
        solicitante: { select: { nome: true } },
        responsavel: { select: { nome: true } },
```

Substituir por:

```tsx
        area: { select: { nome: true } },
        solicitante: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true } },
```

Localizar (linhas 36-55 atuais, o `Promise.all` inteiro):

```tsx
  const [demandasPagina, totalFiltrado, areas, regioes] = await Promise.all([
    prisma.demanda.findMany({
```

Substituir por (adiciona `coletarSubRedeIds` no mesmo `Promise.all`):

```tsx
  const [demandasPagina, totalFiltrado, areas, regioes, subRedeIds] = await Promise.all([
    prisma.demanda.findMany({
```

E localizar o fechamento desse `Promise.all` (linha 54-55 atuais):

```tsx
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
  ])
```

Substituir por:

```tsx
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' } }),
    coletarSubRedeIds(pessoa.id, gabinete.id),
  ])

  // coletarSubRedeIds exclui o próprio pessoa.id do resultado — inclui aqui
  // pra que uma demanda cujo solicitante é o próprio mobilizador também vire link.
  const idsRedeSolicitante = new Set([pessoa.id, ...subRedeIds])
```

Localizar (linha 72-73 atual):

```tsx
      <DemandasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros/demandas`}
```

Substituir por:

```tsx
      <DemandasFiltro
        baseHref={`/${params.slug}/mobilizador/filtros/demandas`}
        baseHrefPessoa={`/${params.slug}/mobilizador/pessoas`}
```

E localizar o fechamento do componente (linha 82-84 atuais):

```tsx
        areas={areas}
        regioes={regioes}
        corPrimaria={gabinete.corPrimaria}
      />
```

Substituir por (adiciona `idsRedeSolicitante` como último prop, mantendo a mesma indentação já usada pelos outros props deste componente):

```tsx
        areas={areas}
        regioes={regioes}
        corPrimaria={gabinete.corPrimaria}
        idsRedeSolicitante={idsRedeSolicitante}
      />
```

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 3 arquivos desta task.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/filtros/DemandasFiltro.tsx" "src/app/[slug]/admin/filtros/demandas/page.tsx" "src/app/[slug]/mobilizador/filtros/demandas/page.tsx"
git commit -m "$(cat <<'EOF'
feat: nome clicável na aba Demandas da Central de Filtros

Solicitante e Responsável abrem a ficha da pessoa. Do lado
mobilizador, Solicitante só vira link quando está na sub-rede de
quem está vendo (senão fica texto puro, sem gerar 404); Responsável
é sempre o próprio mobilizador, sempre vira link.
EOF
)"
```

---

### Task 4: Listagem principal de Demandas (admin e mobilizador)

**Files:**
- Modify: `src/app/[slug]/admin/demandas/page.tsx`
- Modify: `src/app/[slug]/mobilizador/demandas/page.tsx`

**Interfaces:**
- Consumes: `coletarSubRedeIds` de `@/lib/rede` (mesma função e mesma ressalva do "exclui o próprio id" da Task 3).
- Ambos os arquivos já importam `Link` de `next/link` — nenhum import novo de `Link` necessário.

- [ ] **Step 1: `id: true` nos selects e `<Link>` nas células, em `admin/demandas/page.tsx`**

Localizar (linhas 98-99 atuais):

```tsx
        solicitante: { select: { nome: true } },
        responsavel: { select: { nome: true } },
```

Substituir por:

```tsx
        solicitante: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true } },
```

Localizar (linhas 278-279 atuais):

```tsx
                  <td className="px-4 py-3 text-gray-600">{d.solicitante.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{d.responsavel.nome}</td>
```

Substituir por:

```tsx
                  <td className="px-4 py-3 text-gray-600">
                    <Link href={`/${params.slug}/admin/pessoas/${d.solicitante.id}`} className="hover:underline">
                      {d.solicitante.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <Link href={`/${params.slug}/admin/pessoas/${d.responsavel.id}`} className="hover:underline">
                      {d.responsavel.nome}
                    </Link>
                  </td>
```

- [ ] **Step 2: `id: true` no select, cálculo de `idsRedeSolicitante`, e `<Link>` condicional em `mobilizador/demandas/page.tsx`**

Localizar o import (linhas 1-5 atuais):

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { corTextoContraste } from '@/lib/cor-contraste'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
```

Substituir por:

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { corTextoContraste } from '@/lib/cor-contraste'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'
```

Localizar (linha 51 atual):

```tsx
      solicitante: { select: { nome: true } },
```

Substituir por:

```tsx
      solicitante: { select: { id: true, nome: true } },
```

Localizar o fechamento da query (linhas 44-54 atuais):

```tsx
    orderBy: { prazoDesfecho: 'asc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      prazoAlterado: true,
      solicitante: { select: { id: true, nome: true } },
      area: { select: { nome: true } },
    },
  })
```

Substituir por (adiciona o cálculo de `idsRedeSolicitante` logo depois da query, mesma ressalva de incluir o próprio `pessoa.id` da Task 3):

```tsx
    orderBy: { prazoDesfecho: 'asc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      prazoAlterado: true,
      solicitante: { select: { id: true, nome: true } },
      area: { select: { nome: true } },
    },
  })

  // coletarSubRedeIds exclui o próprio pessoa.id do resultado — inclui aqui
  // pra que uma demanda cujo solicitante é o próprio mobilizador também vire link.
  const idsRedeSolicitante = new Set([pessoa.id, ...(await coletarSubRedeIds(pessoa.id, gabinete.id))])
```

Localizar (linha 104 atual):

```tsx
                  <td className="px-4 py-3 text-gray-600">{d.solicitante.nome}</td>
```

Substituir por:

```tsx
                  <td className="px-4 py-3 text-gray-600">
                    {idsRedeSolicitante.has(d.solicitante.id) ? (
                      <Link href={`/${params.slug}/mobilizador/pessoas/${d.solicitante.id}`} className="hover:underline">
                        {d.solicitante.nome}
                      </Link>
                    ) : (
                      d.solicitante.nome
                    )}
                  </td>
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 2 arquivos desta task.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/demandas/page.tsx" "src/app/[slug]/mobilizador/demandas/page.tsx"
git commit -m "$(cat <<'EOF'
feat: nome clicável na listagem principal de Demandas

Mesma regra da aba Demandas da Central de Filtros: Solicitante do
mobilizador só vira link quando está na sub-rede de quem está vendo.
EOF
)"
```

---

### Task 5: Dashboard → Ranking de mobilizadores

**Files:**
- Modify: `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`
- Modify: `src/app/[slug]/admin/dashboard/page.tsx`
- Modify: `src/app/[slug]/mobilizador/dashboard/page.tsx`

**Interfaces:**
- Produces: `DashboardConteudo` ganha um novo prop obrigatório `pessoaHrefBase: string`; `rankingMobilizadores` ganha `id: string` no tipo.
- A query `mobilizadoresAtivos` nos dois `page.tsx` já seleciona `id` — só falta repassar no `.map()` que monta `rankingMobilizadores`. A query já é escopada pela sub-rede do lado mobilizador (mesmo `wherePessoas` usado em toda a tela) — sempre linkável nos dois papéis, sem condicional.

- [ ] **Step 1: Import de `Link`, prop `pessoaHrefBase`, e `id` no tipo de `rankingMobilizadores`, em `DashboardConteudo.tsx`**

No topo do arquivo (linhas 1-9 atuais):

```tsx
// src/app/[slug]/admin/dashboard/DashboardConteudo.tsx
import { GraficoDemandas } from '@/components/GraficoDemandas'
import { GraficoPizza, type FatiaPizza } from '@/components/GraficoPizza'
import MapaCadastros from '@/components/MapaCadastrosLoader'
import { calcularIdade } from '@/lib/aniversario'
import { calcularFaixaEtaria } from '@/lib/faixa-etaria'
import { agruparTopEOutros } from '@/lib/agrupar-top-outros'
import { PALETA_CATEGORICA, COR_NEUTRA, CORES_STATUS_DEMANDA } from '@/lib/cores-graficos'
import { CAMPOS_FILTRO_PESSOAS, CAMPOS_FILTRO_DEMANDAS } from '@/lib/filtros-ativos'
```

Substituir por:

```tsx
// src/app/[slug]/admin/dashboard/DashboardConteudo.tsx
import Link from 'next/link'
import { GraficoDemandas } from '@/components/GraficoDemandas'
import { GraficoPizza, type FatiaPizza } from '@/components/GraficoPizza'
import MapaCadastros from '@/components/MapaCadastrosLoader'
import { calcularIdade } from '@/lib/aniversario'
import { calcularFaixaEtaria } from '@/lib/faixa-etaria'
import { agruparTopEOutros } from '@/lib/agrupar-top-outros'
import { PALETA_CATEGORICA, COR_NEUTRA, CORES_STATUS_DEMANDA } from '@/lib/cores-graficos'
import { CAMPOS_FILTRO_PESSOAS, CAMPOS_FILTRO_DEMANDAS } from '@/lib/filtros-ativos'
```

Localizar (linhas 48-50 atuais — o `slug` hoje é mantido só pra paridade de interface, sem uso real):

```tsx
export function DashboardConteudo({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mantido na interface para paridade com a Task 5 (dashboard do mobilizador)
  slug,
  dashboardHref,
```

Substituir por (`slug` passa a ser usado de verdade — remove o eslint-disable):

```tsx
export function DashboardConteudo({
  slug,
  pessoaHrefBase,
  dashboardHref,
```

Localizar o tipo de `rankingMobilizadores` (linha 91 atual):

```tsx
  rankingMobilizadores: { nome: string; contagem: number }[]
```

Substituir por:

```tsx
  rankingMobilizadores: { id: string; nome: string; contagem: number }[]
```

E localizar a linha correspondente no bloco de tipos da desestruturação — o objeto de tipo completo (linhas 76-79 atuais, onde `slug: string` aparece):

```tsx
}: {
  slug: string
  dashboardHref: string
  filtrosHref: string
```

Substituir por:

```tsx
}: {
  slug: string
  pessoaHrefBase: string
  dashboardHref: string
  filtrosHref: string
```

- [ ] **Step 2: Envolver o nome em `<Link>` na tabela de ranking**

Localizar (linhas 391-396 atuais):

```tsx
                {rankingMobilizadores.map((m, i) => (
                  <tr key={m.nome}>
                    <td className="py-2 text-gray-800">
                      <span className="text-gray-400 mr-2 font-mono text-xs">{String(i + 1).padStart(2, '0')}</span>
                      {m.nome}
                    </td>
```

Substituir por:

```tsx
                {rankingMobilizadores.map((m, i) => (
                  <tr key={m.id}>
                    <td className="py-2 text-gray-800">
                      <span className="text-gray-400 mr-2 font-mono text-xs">{String(i + 1).padStart(2, '0')}</span>
                      <Link href={`${pessoaHrefBase}/${m.id}`} className="hover:underline">
                        {m.nome}
                      </Link>
                    </td>
```

- [ ] **Step 3: `id` no `.map()` de `rankingMobilizadores` e `pessoaHrefBase` no chamador, em `admin/dashboard/page.tsx`**

Localizar (linhas 194-196 atuais):

```tsx
  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)
```

Substituir por:

```tsx
  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ id: m.id, nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)
```

Localizar (linhas 205-208 atuais):

```tsx
    <DashboardConteudo
      slug={params.slug}
      dashboardHref={`/${params.slug}/admin/dashboard`}
      filtrosHref={`/${params.slug}/admin/filtros`}
```

Substituir por:

```tsx
    <DashboardConteudo
      slug={params.slug}
      pessoaHrefBase={`/${params.slug}/admin/pessoas`}
      dashboardHref={`/${params.slug}/admin/dashboard`}
      filtrosHref={`/${params.slug}/admin/filtros`}
```

- [ ] **Step 4: Mesmas duas mudanças em `mobilizador/dashboard/page.tsx`**

Localizar (linhas 198-200 atuais):

```tsx
  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)
```

Substituir por:

```tsx
  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ id: m.id, nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)
```

Localizar (linhas 209-212 atuais):

```tsx
    <DashboardConteudo
      slug={params.slug}
      dashboardHref={`/${params.slug}/mobilizador/dashboard`}
      filtrosHref={`/${params.slug}/mobilizador/filtros`}
```

Substituir por:

```tsx
    <DashboardConteudo
      slug={params.slug}
      pessoaHrefBase={`/${params.slug}/mobilizador/pessoas`}
      dashboardHref={`/${params.slug}/mobilizador/dashboard`}
      filtrosHref={`/${params.slug}/mobilizador/filtros`}
```

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados aos 3 arquivos desta task.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[slug]/admin/dashboard/DashboardConteudo.tsx" "src/app/[slug]/admin/dashboard/page.tsx" "src/app/[slug]/mobilizador/dashboard/page.tsx"
git commit -m "$(cat <<'EOF'
feat: nome clicável no Ranking de mobilizadores do Dashboard

id já era selecionado na query mas não chegava até o componente —
só faltava repassar.
EOF
)"
```

---

### Task 6: Verificação final

**Files:** nenhum (task só de verificação manual — nenhum código novo).

- [ ] **Step 1: Checar tipos e rodar a suíte de testes**

Run: `npx tsc --noEmit`
Expected: limpo, sem nenhum erro em todo o projeto.

Run: `npx vitest run`
Expected: mesmo baseline de antes deste plano (nenhum teste novo foi escrito — mudança é só de UI/wiring; 2 falhas pré-existentes em `email.test.ts` por falta de `RESEND_API_KEY` local são esperadas e não são regressão).

- [ ] **Step 2: Verificação manual no navegador — admin**

```bash
npm run dev
```

Logado como admin num gabinete de teste com dados reais (ex. `amigos-do-izalci`):
1. Central de Filtros → aba Pessoas: nome de uma pessoa na tabela é um link; clicar abre `/admin/pessoas/[id]` dessa pessoa.
2. Central de Filtros → aba Demandas: Solicitante e Responsável são links; clicar em cada um abre a ficha certa.
3. Central de Filtros → aba Banco de Talentos: nome é link; clicar abre a ficha certa.
4. `/admin/demandas` (listagem principal): Solicitante e Responsável são links; clicar em cada um abre a ficha certa.
5. Dashboard → "Ranking de mobilizadores": nome é link; clicar abre a ficha certa.
6. Nas 3 telas fora de escopo (Usuários, Redes, Central de Filtros → Cadastros), comportamento idêntico ao de antes: Usuários já linkava, Redes continua indo pro drill-down `?rede=id`, Cadastros continua selecionando pra edição inline.
7. Sem erros no console.

- [ ] **Step 3: Verificação manual no navegador — mobilizador**

Logado como mobilizador no mesmo gabinete de teste:
1. Central de Filtros → aba Pessoas: nome é link; abre `/mobilizador/pessoas/[id]`.
2. Central de Filtros → aba Demandas: encontrar (ou confirmar via consulta direta ao banco) uma demanda cujo Solicitante **está** na sub-rede do mobilizador logado — nome deve ser link, e abrir a ficha. Encontrar uma demanda cujo Solicitante **não está** na sub-rede — nome deve aparecer em texto puro, sem link. Responsável (sempre o próprio mobilizador) deve sempre ser link e abrir a própria ficha dele.
3. `/mobilizador/demandas` (listagem principal): mesmo teste do item 2 pro Solicitante.
4. Dashboard → "Ranking de mobilizadores": nome é link; abre a ficha certa (sempre dentro da sub-rede, então sempre deve funcionar).
5. Sem erros no console.

- [ ] **Step 4: Commit (se algum ajuste for necessário durante a verificação)**

Se a verificação manual não pedir nenhum ajuste, não há o que commitar nesta task — as Tasks 1-5 já cobrem todo o código. Caso algo precise de correção, aplicar o fix e commitar com uma mensagem descrevendo o que a verificação encontrou.

---

## Self-Review

**Spec coverage:** As 6 telas do spec (`docs/superpowers/specs/2026-07-23-nome-clicavel-abre-ficha-design.md`) têm task própria (Pessoas → Task 1, Banco de Talentos → Task 2, Demandas Central de Filtros → Task 3, Demandas listagem principal → Task 4, Ranking do Dashboard → Task 5) ou são cobertas por steps compartilhados dentro dessas tasks (admin+mobilizador do mesmo componente ficam na mesma task, já que mudam o mesmo arquivo de componente). As 3 telas fora de escopo (Usuários, Redes, Cadastros) não são tocadas por nenhuma task — confirmado por não aparecerem em nenhum `Files:` de nenhuma task. A regra de segurança do Solicitante fora da sub-rede está nas Tasks 3 e 4 (as duas telas de Demandas do mobilizador), com a mesma lógica (`idsRedeSolicitante`) e a mesma ressalva sobre `coletarSubRedeIds` excluir o próprio id.

**Placeholder scan:** Nenhum "TBD"/"implementar depois" — todo código é completo e literal, copiável direto.

**Type consistency:** `baseHrefPessoa` tem o mesmo nome e tipo (`string`) em `PessoasFiltro`, `DemandasFiltro`, `BancoTalentosFiltro`. `idsRedeSolicitante?: Set<string>` tem o mesmo nome/tipo no prop de `DemandasFiltro` (Task 3) e na variável local homônima em `mobilizador/demandas/page.tsx` (Task 4) — não é o mesmo prop (arquivos diferentes), mas o nome e a semântica ("conjunto de ids que podem virar link, incluindo o próprio mobilizador") são propositalmente idênticos, pra facilitar leitura cruzada. `pessoaHrefBase` em `DashboardConteudo` seguindo o mesmo padrão de nome de `dashboardHref`/`filtrosHref`/`demandasHref`, já existentes no mesmo componente. `rankingMobilizadores: { id: string; nome: string; contagem: number }[]` bate exatamente entre o tipo em `DashboardConteudo.tsx` (Task 5, Step 1) e o `.map()` nos dois `page.tsx` (Task 5, Steps 3-4).
