# Mapa Real de Pessoas Cadastradas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o mapa SVG estático do DF no Dashboard por um mapa geográfico real (Leaflet + tiles OpenStreetMap), com um pin por Região cadastrada que tenha coordenada geocodificada e pelo menos uma pessoa vinculada — cobrindo qualquer cidade do Brasil, não só o Distrito Federal.

**Architecture:** `Regiao` ganha `uf`/`latitude`/`longitude`. As actions `criarRegiao`/`editarRegiao` (esta última nova) geocodificam automaticamente via Nominatim (OpenStreetMap) sempre que nome/UF mudam, e cacheiam a coordenada no banco — o mapa nunca chama serviço externo em tempo de render. O componente de mapa (`MapaCadastros`, client-only via `next/dynamic`) renderiza um `<Marker>` do `react-leaflet` por Região com coordenada e contagem > 0, reaproveitando o `href` que a lista lateral já usa hoje.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5 (strict) + Prisma 7.8 + Vitest. Novas dependências: `leaflet`, `react-leaflet`, `@types/leaflet` (dev).

## Global Constraints

- Todo texto de UI em português do Brasil, seguindo o vocabulário já usado no projeto ("Cidades", "Região", "UF").
- `uf` é opcional no schema Prisma (sem `NOT NULL`), mas obrigatório na validação das actions `criarRegiao`/`editarRegiao` — Regiões antigas sem UF continuam existindo sem quebrar.
- Nunca lançar exceção quando a geocodificação falhar — a Região sempre é salva, com ou sem coordenada.
- Nenhuma chamada ao Nominatim em tempo de render do Dashboard — só nas actions de criar/editar Região.
- `nome` de Região é texto livre controlado pelo admin (não confiável) — nunca interpolar em HTML bruto (`L.divIcon` html); só valores numéricos (contagem, tamanho do balão) entram na string HTML do ícone. Nome de exibição usa `<Tooltip>` do react-leaflet (conteúdo React, escapado automaticamente).
- Seguir o padrão de tenant-scoping já usado em todas as actions do projeto: updates sempre filtrados por `gabineteId` vindo da sessão (`assertAdminAccess`), nunca de parâmetro confiado sem checagem.

## Desvio em relação ao spec: testes de `criarRegiao`/`editarRegiao`

O spec (seção "Testes") propunha `criar-regiao.test.ts` (modificado) e `editar-regiao.test.ts`
(novo) com mock de Prisma. Investigação durante o planejamento encontrou que **nenhuma action
`'use server'` deste projeto tem teste automatizado** — toda a suíte de testes cobre só funções
puras (`src/lib/**/*.test.ts`); actions que dependem de `assertAdminAccess`/sessão/Prisma são
verificadas manualmente contra dado real, em todas as features anteriores (ver
`.superpowers/sdd/progress.md`). Criar a infraestrutura de mock necessária (sessão Supabase,
`getGabineteBySlug`, `revalidatePath`) só para estas duas actions seria inconsistente com o
padrão estabelecido do projeto. Este plano segue a convenção existente: `criarRegiao`/
`editarRegiao` são cobertas pela verificação manual da Task 11, não por teste automatizado.

---

### Task 1: Descartar mudanças não commitadas do mapa antigo do DF

O workspace tem mudanças não commitadas em 4 arquivos (uma tentativa anterior de desenhar os 33 contornos reais das Regiões Administrativas do DF) que ficam obsoletas com este plano — o mapa deste plano não usa contornos fixos de RA nenhum. Este plano parte do último commit (`HEAD`), não do estado atual do working tree.

**Files:**
- Descartar (via `git checkout`): `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`, `src/components/MapaRegioesDF.tsx`, `src/lib/__tests__/regioes-df-mapa.test.ts`, `src/lib/regioes-df-mapa.ts`

- [ ] **Step 1: Confirmar quais arquivos têm mudança não commitada**

Run: `git status --short`
Expected: as 4 linhas abaixo aparecem como `M` (modified), sem mais nada relevante além de `.claude/` e outros arquivos não relacionados a este plano:
```
 M src/app/[slug]/admin/dashboard/DashboardConteudo.tsx
 M src/components/MapaRegioesDF.tsx
 M src/lib/__tests__/regioes-df-mapa.test.ts
 M src/lib/regioes-df-mapa.ts
```

- [ ] **Step 2: Descartar as 4 mudanças, voltando ao estado do último commit**

Run:
```bash
git checkout -- "src/app/[slug]/admin/dashboard/DashboardConteudo.tsx" src/components/MapaRegioesDF.tsx src/lib/__tests__/regioes-df-mapa.test.ts src/lib/regioes-df-mapa.ts
```

- [ ] **Step 3: Confirmar que os 4 arquivos voltaram ao estado commitado**

Run: `git status --short`
Expected: nenhum dos 4 arquivos aparece mais na lista de modificados.

Sem commit nesta task — ela só descarta trabalho não commitado, não produz nenhuma mudança nova pra commitar.

---

### Task 2: Schema Prisma — `uf`/`latitude`/`longitude` em `Regiao`

**Files:**
- Modify: `prisma/schema.prisma` (model `Regiao`, atualmente nas linhas 64-73)
- Create: `prisma/migrations/20260714000000_add_regiao_geo/migration.sql`

**Interfaces:**
- Produces: campos `uf: string | null`, `latitude: number | null`, `longitude: number | null` no model `Regiao` do Prisma Client gerado (`@prisma/client`) — usados por todas as tasks seguintes.

- [ ] **Step 1: Adicionar os 3 campos novos ao model `Regiao`**

Em `prisma/schema.prisma`, o model `Regiao` hoje é:

```prisma
model Regiao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
  pessoas  Pessoa[]
}
```

Altere para:

```prisma
model Regiao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  uf         String?
  latitude   Float?
  longitude  Float?
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
  pessoas  Pessoa[]
}
```

- [ ] **Step 2: Criar a migration manualmente**

Crie o diretório e o arquivo:

```bash
mkdir -p "prisma/migrations/20260714000000_add_regiao_geo"
```

Conteúdo de `prisma/migrations/20260714000000_add_regiao_geo/migration.sql`:

```sql
ALTER TABLE "Regiao" ADD COLUMN IF NOT EXISTS "uf" TEXT;
ALTER TABLE "Regiao" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Regiao" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
```

- [ ] **Step 3: Aplicar a migration e regenerar o Prisma Client**

Run: `npx prisma migrate dev --name add_regiao_geo`
Expected: `Your database is now in sync with your schema.` e o client é regenerado automaticamente.

Se o comando falhar citando drift de schema (problema pré-existente já documentado neste projeto — migrations anteriores tiveram o mesmo problema), use o fallback já usado antes:

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

Em qualquer um dos dois casos, rode também (garante o client atualizado mesmo se o passo anterior já regenerou):

Run: `npx prisma generate`
Expected: `Generated Prisma Client` sem erro.

- [ ] **Step 4: Verificar que o client reconhece os campos novos**

Run: `npx tsc --noEmit`
Expected: sem erro (nenhum código ainda usa os campos novos, então isso só confirma que o schema/client compilam).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/20260714000000_add_regiao_geo"
git commit -m "feat: adiciona uf/latitude/longitude ao model Regiao"
```

---

### Task 3: Lista de estados brasileiros (`estados-br.ts`)

**Files:**
- Create: `src/lib/estados-br.ts`
- Test: `src/lib/estados-br.test.ts`

**Interfaces:**
- Produces: `ESTADOS_BR: { sigla: string; nome: string }[]` (27 itens) — usado pelas actions `criarRegiao`/`editarRegiao` (validação) e pelos formulários da tela de Cidades (Task 8).

- [ ] **Step 1: Escrever o teste**

Crie `src/lib/estados-br.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ESTADOS_BR } from './estados-br'

describe('ESTADOS_BR', () => {
  it('tem as 27 unidades federativas do Brasil', () => {
    expect(ESTADOS_BR).toHaveLength(27)
  })

  it('todas as siglas são únicas e têm 2 letras maiúsculas', () => {
    const siglas = ESTADOS_BR.map((e) => e.sigla)
    expect(new Set(siglas).size).toBe(27)
    for (const sigla of siglas) {
      expect(sigla).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('inclui o Distrito Federal', () => {
    expect(ESTADOS_BR.find((e) => e.sigla === 'DF')).toEqual({ sigla: 'DF', nome: 'Distrito Federal' })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/estados-br.test.ts`
Expected: FAIL — `Cannot find module './estados-br'`.

- [ ] **Step 3: Implementar `estados-br.ts`**

Crie `src/lib/estados-br.ts`:

```ts
export type EstadoBr = { sigla: string; nome: string }

export const ESTADOS_BR: EstadoBr[] = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
]
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/estados-br.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/estados-br.ts src/lib/estados-br.test.ts
git commit -m "feat: adiciona lista estática dos 27 estados brasileiros"
```

---

### Task 4: Geocodificação de Região via Nominatim (`geocodificar-regiao.ts`)

**Files:**
- Create: `src/lib/geocodificar-regiao.ts`
- Test: `src/lib/__tests__/geocodificar-regiao.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (função pura + `fetch` global).
- Produces: `geocodificarRegiao(nome: string, uf: string): Promise<{ latitude: number; longitude: number } | null>` — usada pelas actions `criarRegiao`/`editarRegiao` (Tasks 6 e 7).

- [ ] **Step 1: Escrever os testes**

Crie `src/lib/__tests__/geocodificar-regiao.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodificarRegiao } from '../geocodificar-regiao'

describe('geocodificarRegiao', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna latitude/longitude quando o Nominatim encontra resultado', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '-15.7942', lon: '-47.8822' }],
    } as Response)

    const resultado = await geocodificarRegiao('Ceilândia', 'DF')

    expect(resultado).toEqual({ latitude: -15.7942, longitude: -47.8822 })
  })

  it('retorna null quando o Nominatim não encontra nenhum resultado', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response)

    const resultado = await geocodificarRegiao('Cidade Inventada Xyz', 'DF')

    expect(resultado).toBeNull()
  })

  it('retorna null quando a resposta HTTP não é ok', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => [] } as Response)

    const resultado = await geocodificarRegiao('Ceilândia', 'DF')

    expect(resultado).toBeNull()
  })

  it('retorna null quando o fetch lança erro de rede, sem lançar exceção', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    await expect(geocodificarRegiao('Ceilândia', 'DF')).resolves.toBeNull()
  })

  it('monta a query com nome, UF e "Brasil"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] } as Response)
    vi.stubGlobal('fetch', fetchMock)

    await geocodificarRegiao('Águas Lindas de Goiás', 'GO')

    const urlChamada = fetchMock.mock.calls[0][0] as string
    expect(urlChamada).toContain(encodeURIComponent('Águas Lindas de Goiás, GO, Brasil'))
  })

  it('envia um header User-Agent identificando a aplicação', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] } as Response)
    vi.stubGlobal('fetch', fetchMock)

    await geocodificarRegiao('Ceilândia', 'DF')

    const opcoes = fetchMock.mock.calls[0][1] as RequestInit
    expect((opcoes.headers as Record<string, string>)['User-Agent']).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/geocodificar-regiao.test.ts`
Expected: FAIL — `Cannot find module '../geocodificar-regiao'`.

- [ ] **Step 3: Implementar `geocodificar-regiao.ts`**

Crie `src/lib/geocodificar-regiao.ts`:

```ts
import 'server-only'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const TIMEOUT_MS = 5000

type ResultadoNominatim = { lat: string; lon: string }

export async function geocodificarRegiao(
  nome: string,
  uf: string
): Promise<{ latitude: number; longitude: number } | null> {
  const query = `${nome}, ${uf}, Brasil`
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const resposta = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RedeMobiliza/1.0 (geocodificacao de regiao via painel admin)' },
    })
    if (!resposta.ok) return null

    const dados = (await resposta.json()) as ResultadoNominatim[]
    if (dados.length === 0) return null

    const latitude = Number(dados[0].lat)
    const longitude = Number(dados[0].lon)
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null

    return { latitude, longitude }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/geocodificar-regiao.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geocodificar-regiao.ts src/lib/__tests__/geocodificar-regiao.test.ts
git commit -m "feat: geocodificacao de Regiao via Nominatim (OpenStreetMap)"
```

---

### Task 5: `mapa-pessoas.ts` (migração de `calcularTamanhoBalao`) e remoção do lib antigo do DF

**Files:**
- Create: `src/lib/mapa-pessoas.ts`
- Create: `src/lib/__tests__/mapa-pessoas.test.ts`
- Delete: `src/lib/regioes-df-mapa.ts`
- Delete: `src/lib/__tests__/regioes-df-mapa.test.ts`

**Interfaces:**
- Produces: `calcularTamanhoBalao(contagem: number, min: number, max: number, tamanhoMin?: number, tamanhoMax?: number): number` — usada pelo componente de mapa (Task 9).

- [ ] **Step 1: Escrever o teste (migrado sem mudança de comportamento)**

Crie `src/lib/__tests__/mapa-pessoas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcularTamanhoBalao } from '../mapa-pessoas'

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

  it('retorna tamanho mínimo quando contagem está abaixo do intervalo min/max', () => {
    expect(calcularTamanhoBalao(1, 10, 100)).toBe(17)
  })

  it('retorna tamanho máximo quando contagem está acima do intervalo min/max', () => {
    expect(calcularTamanhoBalao(150, 10, 100)).toBe(34)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/__tests__/mapa-pessoas.test.ts`
Expected: FAIL — `Cannot find module '../mapa-pessoas'`.

- [ ] **Step 3: Implementar `mapa-pessoas.ts`**

Crie `src/lib/mapa-pessoas.ts`:

```ts
export function calcularTamanhoBalao(
  contagem: number,
  min: number,
  max: number,
  tamanhoMin = 17,
  tamanhoMax = 34
): number {
  if (max <= min) return (tamanhoMin + tamanhoMax) / 2
  const proporcao = (contagem - min) / (max - min)
  const tamanho = tamanhoMin + proporcao * (tamanhoMax - tamanhoMin)
  return Math.max(tamanhoMin, Math.min(tamanhoMax, tamanho))
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/__tests__/mapa-pessoas.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Remover o lib antigo do DF (contornos/posições fixas, substituído por completo)**

Run:
```bash
git rm src/lib/regioes-df-mapa.ts src/lib/__tests__/regioes-df-mapa.test.ts
```

- [ ] **Step 6: Rodar a suíte inteira e confirmar que nada mais referencia o arquivo removido**

Run: `npx vitest run`
Expected: só falham os 2 testes pré-existentes de `email.test.ts` (falta de `RESEND_API_KEY` local, não relacionado a este plano) — nenhuma falha por import quebrado de `regioes-df-mapa`.

Se algo além de `MapaRegioesDF.tsx`/`DashboardConteudo.tsx` (que ainda serão tratados nas Tasks 9-10) importar de `regioes-df-mapa`, o `vitest run` vai acusar erro de import — isso não é esperado, mas se acontecer, é sinal de que algum arquivo não mapeado neste plano depende do lib antigo; investigue antes de prosseguir.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mapa-pessoas.ts src/lib/__tests__/mapa-pessoas.test.ts
git commit -m "feat: mapa-pessoas.ts substitui regioes-df-mapa.ts (remove contornos fixos do DF)"
```

---

### Task 6: `criarRegiao` — UF obrigatório + geocodificação, e remoção da rota órfã `/admin/regioes`

Investigação prévia: existe uma rota duplicada e órfã (`/[slug]/admin/regioes/page.tsx`) que faz exatamente o que a tela de Cidades (`/[slug]/admin/configuracoes/cidades`) já faz, mas não está linkada em nenhum menu do sistema (confirmado por busca no código — só a Sidebar linka `/admin/configuracoes`, nunca `/admin/regioes`). Ela chama a mesma action `criarRegiao` sem campo de UF. Como esta task torna `uf` obrigatório em `criarRegiao`, essa rota órfã passaria a quebrar (lançar exceção) em qualquer submissão — em vez de deixar isso quebrado, ela é removida nesta task.

**Files:**
- Modify: `src/actions/admin/criar-regiao.ts`
- Modify: `src/actions/admin/desativar-regiao.ts` (mesmo bug de `revalidatePath`, corrigido de passagem — ver Step 4)
- Delete: `src/app/[slug]/admin/regioes/page.tsx` (rota órfã, sem link em nenhum menu)

**Interfaces:**
- Consumes: `geocodificarRegiao` (Task 4), `ESTADOS_BR` (Task 3).
- Produces: `criarRegiao(formData: FormData): Promise<void>` — mesma assinatura de antes, agora exige `formData.get('uf')`.

- [ ] **Step 1: Confirmar que a rota órfã não é referenciada em nenhum lugar do app**

Run: `grep -rn "admin/regioes'" src --include="*.tsx" --include="*.ts" | grep -v "regioes/page.tsx\|criar-regiao.ts\|desativar-regiao.ts"`
Expected: nenhuma linha — confirma que não há link/navegação pra essa rota em nenhum componente.

- [ ] **Step 2: Remover a rota órfã**

Run: `git rm -r "src/app/[slug]/admin/regioes"`

- [ ] **Step 3: Modificar `criarRegiao` para exigir UF e geocodificar**

`src/actions/admin/criar-regiao.ts` hoje é:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function criarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.regiao.create({
    data: { nome, gabineteId: gabinete.id, ativa: true },
  })

  revalidatePath(`/${slug}/admin/regioes`)
}
```

Substitua pelo conteúdo completo:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { geocodificarRegiao } from '@/lib/geocodificar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'

export async function criarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const uf = formData.get('uf') as string
  if (!nome) throw new Error('Nome é obrigatório')
  if (!ESTADOS_BR.some((e) => e.sigla === uf)) throw new Error('UF inválida')

  const { gabinete } = await assertAdminAccess(slug)

  const regiao = await prisma.regiao.create({
    data: { nome, uf, gabineteId: gabinete.id, ativa: true },
  })

  const coordenada = await geocodificarRegiao(nome, uf)
  if (coordenada) {
    await prisma.regiao.update({
      where: { id: regiao.id },
      data: { latitude: coordenada.latitude, longitude: coordenada.longitude },
    })
  }

  revalidatePath(`/${slug}/admin/configuracoes/cidades`)
  revalidatePath(`/${slug}/admin/dashboard`)
}
```

Nota: o `revalidatePath('/${slug}/admin/regioes')` original revalidava a rota órfã removida no Step 2 — trocado pelas duas rotas que de fato mostram esse dado hoje (a tela de Cidades e o Dashboard, que lista Regiões no mapa e na seção "Pessoas por região").

- [ ] **Step 4: Corrigir o mesmo bug de `revalidatePath` em `desativarRegiao` (achado ao investigar a rota órfã)**

`desativarRegiao` tem o mesmo problema que `criarRegiao` tinha antes do Step 3: revalida a rota órfã removida no Step 2, não a tela de Cidades que o admin realmente usa. Sem esse fix, clicar em "Editar" (Task 8) atualiza a lista na hora, mas clicar em "Desativar" ao lado não — inconsistência perceptível na mesma tela.

Em `src/actions/admin/desativar-regiao.ts`, troque:

```ts
  revalidatePath(`/${slug}/admin/regioes`)
```

por:

```ts
  revalidatePath(`/${slug}/admin/configuracoes/cidades`)
  revalidatePath(`/${slug}/admin/dashboard`)
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro relacionado a `criar-regiao.ts`/`desativar-regiao.ts` (outros arquivos ainda serão ajustados nas próximas tasks — se `MapaRegioesDF.tsx`/`DashboardConteudo.tsx` acusarem erro de import quebrado nesse ponto, isso é esperado e será corrigido na Task 9-10, não é regressão desta task).

- [ ] **Step 6: Commit**

```bash
git add src/actions/admin/criar-regiao.ts src/actions/admin/desativar-regiao.ts
git commit -m "feat: criarRegiao exige UF e geocodifica automaticamente; remove rota orfa /admin/regioes"
```

(A remoção da rota órfã já foi staged pelo `git rm -r` no Step 2 — este commit inclui as três mudanças juntas.)

---

### Task 7: `editarRegiao` — nova action

**Files:**
- Create: `src/actions/admin/editar-regiao.ts`

**Interfaces:**
- Consumes: `geocodificarRegiao` (Task 4), `ESTADOS_BR` (Task 3), `assertAdminAccess` (existente, `src/lib/assert-admin-access.ts`).
- Produces: `editarRegiao(formData: FormData): Promise<void>` — usada pelo `EditarCidadeDialog` (Task 8). Espera `formData` com `slug`, `regiaoId`, `nome`, `uf`.

- [ ] **Step 1: Implementar `editar-regiao.ts`**

Crie `src/actions/admin/editar-regiao.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { geocodificarRegiao } from '@/lib/geocodificar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'

export async function editarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const regiaoId = formData.get('regiaoId') as string
  const nome = (formData.get('nome') as string).trim()
  const uf = formData.get('uf') as string
  if (!nome) throw new Error('Nome é obrigatório')
  if (!ESTADOS_BR.some((e) => e.sigla === uf)) throw new Error('UF inválida')

  const { gabinete } = await assertAdminAccess(slug)

  const atual = await prisma.regiao.findFirst({
    where: { id: regiaoId, gabineteId: gabinete.id },
    select: { nome: true, uf: true },
  })
  if (!atual) throw new Error('Região não encontrada')

  const mudouLocalizacao = atual.nome !== nome || atual.uf !== uf

  if (!mudouLocalizacao) {
    await prisma.regiao.update({ where: { id: regiaoId }, data: { nome, uf } })
    revalidatePath(`/${slug}/admin/configuracoes/cidades`)
    revalidatePath(`/${slug}/admin/dashboard`)
    return
  }

  const coordenada = await geocodificarRegiao(nome, uf)
  await prisma.regiao.update({
    where: { id: regiaoId },
    data: {
      nome,
      uf,
      latitude: coordenada?.latitude ?? null,
      longitude: coordenada?.longitude ?? null,
    },
  })

  revalidatePath(`/${slug}/admin/configuracoes/cidades`)
  revalidatePath(`/${slug}/admin/dashboard`)
}
```

Note: `findFirst` filtrado por `id` **e** `gabineteId` antes de qualquer update é o mesmo padrão de defesa em profundidade contra IDOR já usado em outras actions do projeto (ex: `alterar-prazo-demanda.ts`) — um `regiaoId` de outro gabinete simplesmente não é encontrado, e a action lança erro sem revelar se o id existe em outro tenant.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro relacionado a `editar-regiao.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin/editar-regiao.ts
git commit -m "feat: adiciona action editarRegiao (nome/UF, re-geocodifica quando mudam)"
```

---

### Task 8: Tela de Cidades — UF no formulário, indicador de status e edição

**Files:**
- Create: `src/app/[slug]/admin/configuracoes/cidades/EditarCidadeDialog.tsx`
- Modify: `src/app/[slug]/admin/configuracoes/cidades/page.tsx`

**Interfaces:**
- Consumes: `editarRegiao` (Task 7), `ESTADOS_BR` (Task 3), `Modal` (existente, `src/components/admin/Modal.tsx`), `corTextoContraste` (existente, `src/lib/cor-contraste.ts`).

- [ ] **Step 1: Criar `EditarCidadeDialog.tsx`**

Crie `src/app/[slug]/admin/configuracoes/cidades/EditarCidadeDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Modal from '@/components/admin/Modal'
import { editarRegiao } from '@/actions/admin/editar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'
import { corTextoContraste } from '@/lib/cor-contraste'

export default function EditarCidadeDialog({
  slug,
  regiaoId,
  nomeAtual,
  ufAtual,
  corPrimaria,
}: {
  slug: string
  regiaoId: string
  nomeAtual: string
  ufAtual: string | null
  corPrimaria: string
}) {
  const [open, setOpen] = useState(false)
  const corTexto = corTextoContraste(corPrimaria)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-blue-600 text-xs hover:underline">
        Editar
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Editar cidade">
        <form action={editarRegiao} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="regiaoId" value={regiaoId} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome</label>
            <input
              name="nome"
              required
              defaultValue={nomeAtual}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">UF</label>
            <select
              name="uf"
              required
              defaultValue={ufAtual ?? ''}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="" disabled>Selecionar...</option>
              {ESTADOS_BR.map((e) => (
                <option key={e.sigla} value={e.sigla}>{e.nome}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            style={{ backgroundColor: corPrimaria, color: corTexto }}
            className="w-full px-4 py-2 rounded-md text-sm font-medium"
          >
            Salvar
          </button>
        </form>
      </Modal>
    </>
  )
}
```

- [ ] **Step 2: Modificar a tela de Cidades**

`src/app/[slug]/admin/configuracoes/cidades/page.tsx` hoje é:

```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { criarRegiao } from '@/actions/admin/criar-regiao'
import { desativarRegiao } from '@/actions/admin/desativar-regiao'

export default async function CidadesConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const regioes = await prisma.regiao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Cidades</h2>
      <form action={criarRegiao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova cidade"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {regioes.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{r.nome}</span>
            <form action={desativarRegiao}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="regiaoId" value={r.id} />
              <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
            </form>
          </li>
        ))}
        {regioes.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma cidade cadastrada</li>
        )}
      </ul>
    </div>
  )
}
```

Substitua pelo conteúdo completo:

```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { criarRegiao } from '@/actions/admin/criar-regiao'
import { desativarRegiao } from '@/actions/admin/desativar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'
import EditarCidadeDialog from './EditarCidadeDialog'

export default async function CidadesConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const regioes = await prisma.regiao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, uf: true, latitude: true, longitude: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Cidades</h2>
      <form action={criarRegiao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova cidade"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <select name="uf" required defaultValue="" className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="" disabled>UF...</option>
          {ESTADOS_BR.map((e) => (
            <option key={e.sigla} value={e.sigla}>{e.sigla}</option>
          ))}
        </select>
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {regioes.map((r) => {
          const temCoordenada = r.latitude != null && r.longitude != null
          return (
            <li key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${temCoordenada ? 'bg-green-500' : 'bg-gray-300'}`}
                  title={temCoordenada ? 'No mapa' : 'Sem localização'}
                />
                <span className="text-sm truncate">
                  {r.nome}
                  {r.uf ? ` (${r.uf})` : ''}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <EditarCidadeDialog
                  slug={params.slug}
                  regiaoId={r.id}
                  nomeAtual={r.nome}
                  ufAtual={r.uf}
                  corPrimaria={gabinete.corPrimaria}
                />
                <form action={desativarRegiao}>
                  <input type="hidden" name="slug" value={params.slug} />
                  <input type="hidden" name="regiaoId" value={r.id} />
                  <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
                </form>
              </div>
            </li>
          )
        })}
        {regioes.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma cidade cadastrada</li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro relacionado a `cidades/page.tsx` ou `EditarCidadeDialog.tsx`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[slug]/admin/configuracoes/cidades/page.tsx" "src/app/[slug]/admin/configuracoes/cidades/EditarCidadeDialog.tsx"
git commit -m "feat: tela de Cidades ganha UF, indicador de localizacao e edicao"
```

---

### Task 9: Componente de mapa real (`MapaCadastros`) com Leaflet

**Files:**
- Modify: `package.json` (novas dependências)
- Create: `src/components/MapaCadastros.tsx`
- Create: `src/components/MapaCadastrosLoader.tsx`
- Delete: `src/components/MapaRegioesDF.tsx`

**Interfaces:**
- Consumes: `calcularTamanhoBalao` (Task 5, `@/lib/mapa-pessoas`).
- Produces: `RegiaoMapa` (tipo, exportado de `MapaCadastros.tsx`: `{ id: string; nome: string; contagem: number; href: string; latitude: number | null; longitude: number | null }`), e o componente `MapaCadastros` (default export de `MapaCadastrosLoader.tsx`, é o que o resto do app deve importar) — usados por `DashboardConteudo.tsx` (Task 10).

- [ ] **Step 1: Instalar as dependências**

Run: `npm install leaflet react-leaflet`
Run: `npm install -D @types/leaflet`
Expected: `package.json` ganha `leaflet` e `react-leaflet` em `dependencies`, `@types/leaflet` em `devDependencies`.

- [ ] **Step 2: Criar `MapaCadastros.tsx`**

Crie `src/components/MapaCadastros.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { calcularTamanhoBalao } from '@/lib/mapa-pessoas'

export type RegiaoMapa = {
  id: string
  nome: string
  contagem: number
  href: string
  latitude: number | null
  longitude: number | null
}

const CENTRO_BRASIL: [number, number] = [-14.2, -51.9]
const ZOOM_FALLBACK = 4

// Só valores numéricos (tamanho, contagem) entram nesta string HTML — `nome` é
// texto livre digitado pelo admin e nunca deve ser interpolado em HTML bruto
// (o `html` do L.divIcon vira innerHTML de verdade). O nome aparece via
// <Tooltip>, que é conteúdo React normal (escapado automaticamente).
function criarIcone(tamanho: number, contagem: number): L.DivIcon {
  const fonte = Math.max(7, tamanho * 0.38)
  return L.divIcon({
    className: '',
    html: `<div style="width:${tamanho}px;height:${tamanho}px;border-radius:50% 50% 50% 0;background:#2563eb;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.3)"><span style="transform:rotate(45deg);color:#fff;font-weight:600;font-size:${fonte}px;line-height:1">${contagem}</span></div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho],
  })
}

function AjustarViewport({ pontos }: { pontos: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (pontos.length === 0) return
    map.fitBounds(L.latLngBounds(pontos), { padding: [30, 30], maxZoom: 12 })
  }, [map, pontos])
  return null
}

export default function MapaCadastros({ regioes }: { regioes: RegiaoMapa[] }) {
  const pinos = regioes.filter(
    (r): r is RegiaoMapa & { latitude: number; longitude: number } =>
      r.latitude != null && r.longitude != null && r.contagem > 0
  )

  const contagens = pinos.map((p) => p.contagem)
  const min = contagens.length > 0 ? Math.min(...contagens) : 0
  const max = contagens.length > 0 ? Math.max(...contagens) : 0
  const pontos: [number, number][] = pinos.map((p) => [p.latitude, p.longitude])

  return (
    <div>
      <MapContainer
        center={CENTRO_BRASIL}
        zoom={ZOOM_FALLBACK}
        style={{ height: 340, width: '100%' }}
        className="rounded-xl border border-gray-200 overflow-hidden"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <AjustarViewport pontos={pontos} />
        {pinos.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={criarIcone(calcularTamanhoBalao(p.contagem, min, max), p.contagem)}
            eventHandlers={{
              click: () => {
                window.location.href = p.href
              },
            }}
          >
            <Tooltip direction="top">{p.nome}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <p className="text-xs text-gray-500 mt-2">
        Arraste para mover, use a roda do mouse ou pinça para zoom.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Criar `MapaCadastrosLoader.tsx` (necessário porque Leaflet acessa `window` — precisa de `ssr: false`, que só pode ser chamado a partir de um Client Component)**

Crie `src/components/MapaCadastrosLoader.tsx`:

```tsx
'use client'

import dynamic from 'next/dynamic'

const MapaCadastros = dynamic(() => import('./MapaCadastros'), { ssr: false })

export default MapaCadastros
```

- [ ] **Step 4: Remover o componente antigo do DF**

Run: `git rm src/components/MapaRegioesDF.tsx`

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: erros esperados apontando pra `DashboardConteudo.tsx` (ainda importa `MapaRegioesDF`, removido no Step 4) — isso é esperado, corrigido na Task 10. Nenhum erro deve vir de `MapaCadastros.tsx`/`MapaCadastrosLoader.tsx` em si.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/MapaCadastros.tsx src/components/MapaCadastrosLoader.tsx
git commit -m "feat: MapaCadastros (Leaflet + OpenStreetMap) substitui MapaRegioesDF"
```

(A remoção do componente antigo já foi staged pelo `git rm` no Step 4 — este commit inclui as duas mudanças juntas.)

---

### Task 10: Integração no Dashboard (admin e mobilizador)

**Files:**
- Modify: `src/app/[slug]/admin/dashboard/page.tsx` (query em torno da linha 116-125)
- Modify: `src/app/[slug]/mobilizador/dashboard/page.tsx` (query em torno da linha 120-129)
- Modify: `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx` (linhas 4, 88, 226)

**Interfaces:**
- Consumes: `MapaCadastros` (default export de `@/components/MapaCadastrosLoader`, Task 9), tipo `RegiaoMapa` (de `@/components/MapaCadastros`, Task 9).

- [ ] **Step 1: `admin/dashboard/page.tsx` — incluir uf/latitude/longitude na query e na prop**

Em `src/app/[slug]/admin/dashboard/page.tsx`, a chamada (linhas 116-125) é:

```ts
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
```

Altere o `select` pra:

```ts
    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id },
      select: {
        id: true,
        nome: true,
        ativa: true,
        uf: true,
        latitude: true,
        longitude: true,
        _count: { select: { pessoas: { where: wherePessoas } } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),
```

E a linha (por volta da 190) que monta a prop `regioes`:

```ts
      regioes={regioesRaw.map((r) => ({ id: r.id, nome: r.nome, ativa: r.ativa, contagem: r._count.pessoas }))}
```

Altere para:

```ts
      regioes={regioesRaw.map((r) => ({
        id: r.id,
        nome: r.nome,
        ativa: r.ativa,
        uf: r.uf,
        latitude: r.latitude,
        longitude: r.longitude,
        contagem: r._count.pessoas,
      }))}
```

- [ ] **Step 2: `mobilizador/dashboard/page.tsx` — mesma mudança**

Em `src/app/[slug]/mobilizador/dashboard/page.tsx`, repita exatamente o Step 1 (a query está nas linhas 120-129, a prop `regioes` por volta da linha 195 — mesmo formato, mesmo `wherePessoas`).

- [ ] **Step 3: `DashboardConteudo.tsx` — trocar o import e o tipo da prop**

Linha 4, troque:

```ts
import MapaRegioesDF from '@/components/MapaRegioesDF'
```

por:

```ts
import MapaCadastros from '@/components/MapaCadastrosLoader'
import type { RegiaoMapa } from '@/components/MapaCadastros'
```

Linha 88, troque:

```ts
  regioes: { id: string; nome: string; ativa: boolean; contagem: number }[]
```

por:

```ts
  regioes: { id: string; nome: string; ativa: boolean; contagem: number; uf: string | null; latitude: number | null; longitude: number | null }[]
```

Linha 226, troque:

```tsx
            <MapaRegioesDF regioes={regioesComHref} />
```

por:

```tsx
            <MapaCadastros regioes={regioesComHref} />
```

(O import `type { RegiaoMapa }` fica sem uso direto nesta task — é só pra deixar o tipo disponível caso um type annotation explícito seja necessário; se o `tsc` acusar `'RegiaoMapa' is declared but never used`, remova essa linha de import — `regioesComHref` já é estruturalmente compatível com `RegiaoMapa[]` sem anotação explícita.)

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Verificar que o build de produção funciona (pega erros de SSR do Leaflet que o `tsc` sozinho não pega)**

Run: `npm run build`
Expected: build conclui sem erro. Se aparecer erro citando `window is not defined` ou `ssr: false is not allowed with next/dynamic in Server Components`, confirme que `DashboardConteudo.tsx` importa de `@/components/MapaCadastrosLoader` (Client Component que faz o `dynamic(..., { ssr: false })`) e não de `@/components/MapaCadastros` diretamente.

- [ ] **Step 6: Rodar a suíte de testes inteira**

Run: `npx vitest run`
Expected: só as 2 falhas pré-existentes de `email.test.ts` (falta de `RESEND_API_KEY` local) — nenhuma outra falha.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[slug]/admin/dashboard/page.tsx" "src/app/[slug]/mobilizador/dashboard/page.tsx" "src/app/[slug]/admin/dashboard/DashboardConteudo.tsx"
git commit -m "feat: Dashboard usa MapaCadastros (Leaflet) no lugar do mapa SVG do DF"
```

---

### Task 11: Verificação manual (requer navegador + gabinete real)

Esta task não é delegável a um subagente isolado — precisa de sessão de navegador autenticada contra um gabinete real, seguindo o mesmo padrão já usado em todas as features anteriores deste projeto (ver `docs/superpowers/plans/2026-07-13-mapa-regioes-dashboard.md`, Task 5, e o restante do histórico em `.superpowers/sdd/progress.md`).

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Subir o app localmente**

Run: `npm run dev`

- [ ] **Step 2: Criar uma Região nova com nome de cidade real + UF (ex: "Ceilândia" / DF)**

Acesse `/[slug]/admin/configuracoes/cidades`, cadastre. Confirme que a bolinha de status fica verde ("No mapa") — se ficar cinza, confira o console do servidor por erro na chamada ao Nominatim.

- [ ] **Step 3: Vincular pelo menos uma pessoa a essa Região e abrir o Dashboard**

Confirme que aparece um pin no mapa na posição geográfica correta, com o número de pessoas dentro do balão, e que passar o mouse mostra o nome da cidade (tooltip).

- [ ] **Step 4: Clicar no pin**

Confirme que abre a Central de Filtros já filtrada por aquela Região (mesmo destino que clicar na lista lateral).

- [ ] **Step 5: Editar uma Região já existente (sem UF) pra adicionar UF**

Use o botão "Editar" na tela de Cidades. Confirme que a bolinha de status muda de cinza pra verde e que o pin passa a aparecer no Dashboard após vincular alguém a ela.

- [ ] **Step 6: Testar uma Região com nome que a geocodificação não acha**

Cadastre uma Região com um nome inventado (ex: "Cidade Que Não Existe Xyzabc"). Confirme que salva sem erro (sem tela de erro do Next.js) e mostra "Sem localização" na tela de Cidades.

- [ ] **Step 7: Testar uma cidade da RIDE fora do DF (ex: "Águas Lindas de Goiás" / GO, ou "Formosa" / GO)**

Confirme que o pin aparece na posição geográfica correta, fora do contorno do DF — este é o requisito central deste plano (o mapa antigo nunca conseguia mostrar isso).

- [ ] **Step 8: Gabinete sem nenhuma Região geocodada (se disponível um gabinete de teste vazio)**

Confirme que o mapa cai no fallback centrado no Brasil, sem pin nenhum, sem quebrar o layout.

Sem commit nesta task — é só verificação. Se algum passo falhar, volte pra task correspondente, corrija, e repita a verificação a partir daí.
