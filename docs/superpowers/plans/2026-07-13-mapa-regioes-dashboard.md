# Mapa de Regiões do DF no Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um mapa estático e interativo (pan/zoom) do Distrito Federal ao dashboard "Dados Gerais", com um balão por Região Administrativa mostrando quantidade de pessoas, clicável; e tornar as fatias dos 5 gráficos de pizza existentes clicáveis diretamente no círculo colorido.

**Architecture:** Dois componentes novos e independentes (`regioes-df-mapa.ts` com dados+funções puras, `MapaRegioesDF.tsx` client component) mais uma alteração no componente compartilhado `GraficoPizza.tsx` (troca de `conic-gradient` por `<svg>` com um `<path>` clicável por fatia). Nenhuma mudança de schema, API ou query — tudo consome dado já computado em `DashboardConteudo.tsx`.

**Tech Stack:** Next.js 14 (App Router, React Server + Client Components) / TypeScript / Tailwind / Vitest.

## Global Constraints

- Mapa é uma ilustração SVG estática com pan/zoom via CSS transform — sem biblioteca de mapas externa, sem serviço de tiles geográficos (spec, seção "Fora de escopo").
- Balão sem correspondência na tabela fixa do DF é ignorado silenciosamente, sem erro/aviso (spec, "Tratamento de erro").
- Nenhuma query nova ao banco — reaproveitar `regioesComHref` já computado em `DashboardConteudo.tsx`.
- `GraficoPizza.tsx` é compartilhado entre admin e mobilizador — qualquer mudança vale pros dois automaticamente, sem tocar nas duas páginas separadamente.
- Tamanho do balão sempre entre 17px e 34px (spec).

---

### Task 1: Tabela de Regiões do DF + funções puras

**Files:**
- Create: `src/lib/regioes-df-mapa.ts`
- Test: `src/lib/__tests__/regioes-df-mapa.test.ts`

**Interfaces:**
- Produz: `encontrarPosicaoRegiao(nome: string): { x: number; y: number } | null` e `calcularTamanhoBalao(contagem: number, min: number, max: number, tamanhoMin?: number, tamanhoMax?: number): number`, ambas exportadas de `src/lib/regioes-df-mapa.ts`. `x`/`y` são percentuais (0-100) relativos ao viewBox `0 0 100 85` do mapa. `tamanhoMin`/`tamanhoMax` default pra `17`/`34`.

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// src/lib/__tests__/regioes-df-mapa.test.ts
import { describe, it, expect } from 'vitest'
import { encontrarPosicaoRegiao, calcularTamanhoBalao } from '../regioes-df-mapa'

describe('encontrarPosicaoRegiao', () => {
  it('encontra região por nome exato', () => {
    expect(encontrarPosicaoRegiao('Taguatinga')).toEqual({ x: 28, y: 50 })
  })

  it('encontra região ignorando acentuação e caixa', () => {
    expect(encontrarPosicaoRegiao('AGUAS CLARAS')).toEqual({ x: 33, y: 52 })
    expect(encontrarPosicaoRegiao('águas claras')).toEqual({ x: 33, y: 52 })
  })

  it('retorna null para nome sem correspondência', () => {
    expect(encontrarPosicaoRegiao('Cidade Inventada')).toBeNull()
  })

  it('retorna null para nome vazio', () => {
    expect(encontrarPosicaoRegiao('')).toBeNull()
  })
})

describe('calcularTamanhoBalao', () => {
  it('retorna o tamanho mínimo quando contagem é igual ao mínimo do conjunto', () => {
    expect(calcularTamanhoBalao(10, 10, 100)).toBe(17)
  })

  it('retorna o tamanho máximo quando contagem é igual ao máximo do conjunto', () => {
    expect(calcularTamanhoBalao(100, 10, 100)).toBe(34)
  })

  it('retorna um valor intermediário proporcional', () => {
    expect(calcularTamanhoBalao(55, 10, 100)).toBeCloseTo(25.5, 5)
  })

  it('retorna o ponto médio quando min e max são iguais (evita divisão por zero)', () => {
    expect(calcularTamanhoBalao(42, 42, 42)).toBe(25.5)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/__tests__/regioes-df-mapa.test.ts`
Expected: FAIL — `Cannot find module '../regioes-df-mapa'`

- [ ] **Step 3: Implementar**

```typescript
// src/lib/regioes-df-mapa.ts
type PosicaoRegiao = { nome: string; x: number; y: number }

// Coordenadas aproximadas (percentual, viewBox 0 0 100 85) — ilustrativas, não uma
// projeção cartográfica real. Inclui as Regiões Administrativas oficiais do DF e
// alguns apelidos informais comuns (Asa Norte/Sul, Sudoeste/Octogonal, etc) já que
// gabinetes cadastram o nome da Região livremente.
const REGIOES_DF: PosicaoRegiao[] = [
  { nome: 'Plano Piloto', x: 50, y: 30 },
  { nome: 'Asa Norte', x: 52, y: 25 },
  { nome: 'Asa Sul', x: 50, y: 35 },
  { nome: 'Sudoeste', x: 44, y: 38 },
  { nome: 'Octogonal', x: 43, y: 39 },
  { nome: 'Noroeste', x: 46, y: 22 },
  { nome: 'Cruzeiro', x: 42, y: 33 },
  { nome: 'Lago Norte', x: 58, y: 22 },
  { nome: 'Lago Sul', x: 58, y: 38 },
  { nome: 'Núcleo Bandeirante', x: 42, y: 45 },
  { nome: 'Candangolândia', x: 44, y: 47 },
  { nome: 'Park Way', x: 45, y: 55 },
  { nome: 'Guará', x: 35, y: 45 },
  { nome: 'Águas Claras', x: 33, y: 52 },
  { nome: 'Vicente Pires', x: 30, y: 45 },
  { nome: 'Taguatinga', x: 28, y: 50 },
  { nome: 'Ceilândia', x: 22, y: 42 },
  { nome: 'Samambaia', x: 25, y: 62 },
  { nome: 'Recanto das Emas', x: 30, y: 65 },
  { nome: 'Riacho Fundo', x: 38, y: 55 },
  { nome: 'Riacho Fundo II', x: 35, y: 60 },
  { nome: 'Santa Maria', x: 40, y: 68 },
  { nome: 'Gama', x: 38, y: 78 },
  { nome: 'Brazlândia', x: 16, y: 26 },
  { nome: 'Sobradinho', x: 62, y: 18 },
  { nome: 'Sobradinho II', x: 64, y: 16 },
  { nome: 'Planaltina', x: 72, y: 14 },
  { nome: 'Fercal', x: 60, y: 12 },
  { nome: 'Paranoá', x: 65, y: 32 },
  { nome: 'Itapoã', x: 62, y: 28 },
  { nome: 'São Sebastião', x: 68, y: 45 },
  { nome: 'Jardim Botânico', x: 62, y: 40 },
  { nome: 'Varjão', x: 54, y: 20 },
  { nome: 'SCIA', x: 40, y: 38 },
  { nome: 'Estrutural', x: 40, y: 38 },
  { nome: 'SIA', x: 41, y: 40 },
  { nome: 'Arniqueira', x: 32, y: 50 },
  { nome: 'Sol Nascente', x: 20, y: 45 },
  { nome: 'Pôr do Sol', x: 20, y: 45 },
]

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function encontrarPosicaoRegiao(nome: string): { x: number; y: number } | null {
  const alvo = normalizar(nome)
  if (!alvo) return null
  const encontrada = REGIOES_DF.find((r) => normalizar(r.nome) === alvo)
  return encontrada ? { x: encontrada.x, y: encontrada.y } : null
}

export function calcularTamanhoBalao(
  contagem: number,
  min: number,
  max: number,
  tamanhoMin = 17,
  tamanhoMax = 34
): number {
  if (max <= min) return (tamanhoMin + tamanhoMax) / 2
  const proporcao = (contagem - min) / (max - min)
  return tamanhoMin + proporcao * (tamanhoMax - tamanhoMin)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/__tests__/regioes-df-mapa.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos

- [ ] **Step 6: Commit**

```bash
git add src/lib/regioes-df-mapa.ts src/lib/__tests__/regioes-df-mapa.test.ts
git commit -m "feat: tabela de Regiões Administrativas do DF + funções de posição e tamanho do balão"
```

---

### Task 2: Componente `MapaRegioesDF`

**Files:**
- Create: `src/components/MapaRegioesDF.tsx`

**Interfaces:**
- Consome: `encontrarPosicaoRegiao`, `calcularTamanhoBalao` da Task 1 (`@/lib/regioes-df-mapa`).
- Produz: `export default function MapaRegioesDF({ regioes }: { regioes: RegiaoMapa[] })`, onde `export type RegiaoMapa = { id: string; nome: string; contagem: number; href?: string }` — mesmo shape do `regioesComHref` já existente em `DashboardConteudo.tsx` (id, nome, contagem, href), usado na Task 4.

- [ ] **Step 1: Implementar o componente**

```tsx
// src/components/MapaRegioesDF.tsx
'use client'

import { useRef, useState } from 'react'
import { encontrarPosicaoRegiao, calcularTamanhoBalao } from '@/lib/regioes-df-mapa'

const CONTORNO_DF = 'M20,9 L70,7 L86,24 L80,54 L58,79 L28,77 L11,53 L14,24 Z'

export type RegiaoMapa = { id: string; nome: string; contagem: number; href?: string }

export default function MapaRegioesDF({ regioes }: { regioes: RegiaoMapa[] }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const arrastando = useRef(false)
  const inicioArraste = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  const contagens = regioes.map((r) => r.contagem)
  const min = contagens.length > 0 ? Math.min(...contagens) : 0
  const max = contagens.length > 0 ? Math.max(...contagens) : 0

  const pinos = regioes
    .map((r) => {
      const posicao = encontrarPosicaoRegiao(r.nome)
      if (!posicao) return null
      return { ...r, ...posicao, tamanho: calcularTamanhoBalao(r.contagem, min, max) }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  function handleMouseDown(e: React.MouseEvent) {
    arrastando.current = true
    inicioArraste.current = { x: e.clientX, y: e.clientY, tx, ty }
    if (boxRef.current) boxRef.current.style.cursor = 'grabbing'
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!arrastando.current) return
    setTx(inicioArraste.current.tx + (e.clientX - inicioArraste.current.x))
    setTy(inicioArraste.current.ty + (e.clientY - inicioArraste.current.y))
  }

  function pararArraste() {
    arrastando.current = false
    if (boxRef.current) boxRef.current.style.cursor = 'grab'
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const fator = e.deltaY < 0 ? 1.1 : 1 / 1.1
    setScale((s) => Math.min(4, Math.max(0.5, s * fator)))
  }

  function zoom(fator: number) {
    setScale((s) => Math.min(4, Math.max(0.5, s * fator)))
  }

  function resetar() {
    setScale(1)
    setTx(0)
    setTy(0)
  }

  return (
    <div>
      <div
        ref={boxRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={pararArraste}
        onMouseLeave={pararArraste}
        onWheel={handleWheel}
        className="relative w-full rounded-xl border border-gray-200 bg-gray-50 overflow-hidden cursor-grab"
        style={{ height: 340 }}
      >
        <div
          className="absolute inset-0"
          style={{ transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        >
          <svg viewBox="0 0 100 85" className="absolute inset-0 w-full h-full" aria-hidden>
            <path d={CONTORNO_DF} fill="#dbe6f0" stroke="#9fb3c8" strokeWidth={1} />
          </svg>
          {pinos.map((p) => {
            const conteudo = (
              <div className="flex items-center gap-1.5">
                <div
                  className="shrink-0 shadow-sm"
                  style={{
                    width: p.tamanho,
                    height: p.tamanho,
                    borderRadius: '50% 50% 50% 0',
                    backgroundColor: '#2563eb',
                    transform: 'rotate(-45deg)',
                  }}
                />
                <div className="bg-white rounded-md px-2 py-0.5 shadow-sm whitespace-nowrap">
                  <span className="text-xs font-semibold text-blue-700">{p.nome}</span>
                  <span className="text-xs text-blue-700 ml-1">{p.contagem}</span>
                </div>
              </div>
            )
            return (
              <div key={p.id} className="absolute" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                {p.href ? <a href={p.href}>{conteudo}</a> : conteudo}
              </div>
            )
          })}
        </div>

        <div className="absolute right-2 bottom-2 flex flex-col gap-1 z-10">
          <button
            type="button"
            onClick={() => zoom(1.2)}
            className="w-7 h-7 rounded-md border border-gray-300 bg-white font-bold"
            aria-label="Aumentar zoom"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoom(1 / 1.2)}
            className="w-7 h-7 rounded-md border border-gray-300 bg-white font-bold"
            aria-label="Diminuir zoom"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetar}
            className="w-7 h-7 rounded-md border border-gray-300 bg-white text-sm"
            aria-label="Ver mapa inteiro"
            title="Ver mapa inteiro"
          >
            ⤢
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Arraste para mover, use a roda do mouse ou os botões +/− para zoom.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos

- [ ] **Step 3: Commit**

```bash
git add src/components/MapaRegioesDF.tsx
git commit -m "feat: componente MapaRegioesDF com pan/zoom e balões proporcionais"
```

(Sem teste automatizado — componente visual/interativo, mesmo padrão já usado por `GraficoPizza`/`GraficoDemandas` no projeto, verificado manualmente na Task 5.)

---

### Task 3: Fatias clicáveis em `GraficoPizza`

**Files:**
- Modify: `src/components/GraficoPizza.tsx` (arquivo inteiro será reescrito — 46 linhas hoje)

**Interfaces:**
- Mantém a assinatura pública idêntica: `export type FatiaPizza = { chave, label, valor, cor, href? }` e `export function GraficoPizza({ titulo, fatias }: { titulo: string; fatias: FatiaPizza[] })`. Nenhum dos 6 call sites existentes (`DashboardConteudo.tsx` ×5 dentro do mesmo arquivo, mais qualquer outro uso) precisa mudar.

- [ ] **Step 1: Ler o arquivo atual para referência**

O arquivo atual (`src/components/GraficoPizza.tsx`) usa um único `<div>` com `background: conic-gradient(...)` pro círculo — sem sub-elemento por fatia, portanto sem como linkar uma fatia específica. A legenda ao lado (`<ul>`) já usa `<a href>` condicional por item — isso **não muda**.

- [ ] **Step 2: Substituir o círculo por SVG com um `<path>` por fatia**

```tsx
// src/components/GraficoPizza.tsx
export type FatiaPizza = {
  chave: string
  label: string
  valor: number
  cor: string
  href?: string
}

const RAIO = 48
const CENTRO = 50

function pontoNoCirculo(anguloGraus: number) {
  const rad = (anguloGraus * Math.PI) / 180
  return {
    x: CENTRO + RAIO * Math.sin(rad),
    y: CENTRO - RAIO * Math.cos(rad),
  }
}

export function GraficoPizza({ titulo, fatias }: { titulo: string; fatias: FatiaPizza[] }) {
  const total = fatias.reduce((acc, f) => acc + f.valor, 0)
  let acumulado = 0
  const arcos = fatias.map((f) => {
    const inicio = total > 0 ? (acumulado / total) * 360 : 0
    acumulado += f.valor
    const fim = total > 0 ? (acumulado / total) * 360 : 0
    return { ...f, inicio, fim }
  })

  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-3">{titulo}</h2>
      {total === 0 ? (
        <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
      ) : (
        <div className="flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
            {arcos.map((a) => {
              // Fatia única cobrindo 100% — um arco com início/fim idênticos é
              // degenerado (SVG não desenha), então usamos um círculo completo.
              const circuloCompleto = a.fim - a.inicio >= 359.99
              const forma = circuloCompleto ? (
                <circle cx={CENTRO} cy={CENTRO} r={RAIO} fill={a.cor} />
              ) : (
                (() => {
                  const p1 = pontoNoCirculo(a.inicio)
                  const p2 = pontoNoCirculo(a.fim)
                  const largeArc = a.fim - a.inicio > 180 ? 1 : 0
                  const path = `M${CENTRO},${CENTRO} L${p1.x},${p1.y} A${RAIO},${RAIO} 0 ${largeArc} 1 ${p2.x},${p2.y} Z`
                  return <path d={path} fill={a.cor} />
                })()
              )
              return a.href ? (
                <a key={a.chave} href={a.href} className="cursor-pointer">
                  {forma}
                </a>
              ) : (
                <g key={a.chave}>{forma}</g>
              )
            })}
          </svg>
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

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos

- [ ] **Step 4: Rodar a suíte inteira (garante que nada mais quebrou)**

Run: `npx vitest run --exclude '**/.worktrees/**' --exclude '**/.claude/worktrees/**'`
Expected: mesmo baseline de sempre (138 passando, ou 136 + 2 falhas pré-existentes de `email.test.ts` se `RESEND_API_KEY` não estiver no ambiente local)

- [ ] **Step 5: Commit**

```bash
git add src/components/GraficoPizza.tsx
git commit -m "feat: fatias do GraficoPizza viram SVG clicavel (alem da legenda)"
```

---

### Task 4: Integrar o mapa no Dashboard

**Files:**
- Modify: `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx:205-219`

**Interfaces:**
- Consome: `MapaRegioesDF` (Task 2) e o array `regioesComHref` já existente na linha 177-180 do próprio arquivo (`{ id, nome, contagem, href }[]`, mesmo shape de `RegiaoMapa`).

Nota: os 5 `<GraficoPizza />` (linhas 222-226) **já ficam depois** da seção "Pessoas por região" na ordem atual do JSX — não é necessário mover nada, só colocar o mapa dentro da própria seção de região.

- [ ] **Step 1: Importar o componente**

No topo de `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`, junto aos outros imports de componente:

```tsx
import MapaRegioesDF from '@/components/MapaRegioesDF'
```

- [ ] **Step 2: Colocar o mapa ao lado da lista de região**

Substituir o bloco (linhas 205-219):

```tsx
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
```

por:

```tsx
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por região</h2>
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="grid grid-cols-2 gap-3 lg:w-64 lg:shrink-0 w-full">
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
          <div className="flex-1 min-w-0 w-full">
            <MapaRegioesDF regioes={regioesComHref} />
          </div>
        </div>
      </section>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/dashboard/DashboardConteudo.tsx"
git commit -m "feat: integra MapaRegioesDF na secao Pessoas por regiao do dashboard"
```

---

### Task 5: Verificação manual + push

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Subir o servidor local**

Run: `npm run dev` (ou a porta já usada no projeto, ex. `next dev -p 3100`)

- [ ] **Step 2: Verificar contra um gabinete real com dado variado**

Abrir `/<slug>/admin/dashboard` de um gabinete com pessoas em pelo menos 2 regiões diferentes (ex. `amigos-do-izalci`, mencionado nesta sessão) e confirmar:
- Mapa aparece ao lado da lista de região, balões nas regiões cujo nome bate com a tabela do DF.
- Balões ausentes pras regiões sem match (checar console do navegador — sem erro).
- Arrastar o mapa move a visualização; roda do mouse e os botões +/− fazem zoom; botão "⤢" volta ao estado inicial.
- Clicar num balão abre a Central de Filtros com o filtro de região certo (mesma URL que clicar no card da lista abriria).
- As 5 pizzas continuam logo abaixo da seção mapa+lista.
- Clicar numa fatia colorida de cada pizza (não só na legenda) abre o filtro certo.
- Repetir a checagem de fatia clicável e ordem das seções em `/<slug>/mobilizador/dashboard` (mesmo componente compartilhado).

- [ ] **Step 3: Verificar o caso de fatia única (100%)**

Encontrar (ou simular via filtro) um cenário onde uma pizza tenha só uma categoria com dado (ex. todas as pessoas do mesmo sexo). Confirmar que o círculo aparece cheio (não em branco) — cobre o caso degenerado tratado no Step 2 da Task 3.

- [ ] **Step 4: Rodar a suíte completa uma última vez**

Run: `npx tsc --noEmit && npx vitest run --exclude '**/.worktrees/**' --exclude '**/.claude/worktrees/**'`
Expected: sem erros de tipo; testes no mesmo baseline conhecido.

- [ ] **Step 5: Push**

```bash
git push origin develop
```

Aguardar o pipeline de CI/staging (`gh run list -R renatodf/rede-mobiliza --branch develop --limit 1`) confirmar sucesso antes de considerar a feature pronta pra promoção (`deploy-prod.sh`, fora deste plano — decisão do usuário quando promover).
