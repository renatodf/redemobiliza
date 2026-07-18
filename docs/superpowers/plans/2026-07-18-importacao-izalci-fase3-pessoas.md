# Importação Izalci — Fase 3: Pessoas + Telefones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar as ~127.398 `Pessoa` elegíveis (de 142.489 candidatas) do tenant Izalci do MongoDB pro gabinete IZALCI, com `TelefoneExtra`, `PessoaSegmento` e `ObservacaoPessoa` (role legado) associados, vinculando aos catálogos já criados na Fase 2.

**Architecture:** Um script TypeScript único (`scripts/importacao-izalci/importar-pessoas-fase3.ts`) lê `people.bson.gz`/`phones.bson.gz`/`tags.bson.gz` diretamente (decodificação BSON própria em Node, sem Python desta vez), resolve catálogos consultando o Postgres já populado pela Fase 2, e insere em lotes via `createManyAndReturn`. A lógica de negócio (escolha de telefone, exclusão de dummy, decodificação de gênero/religião, montagem dos dados de uma pessoa) fica isolada em funções puras testadas com Vitest — o script principal só orquestra I/O.

**Tech Stack:** TypeScript via `npx tsx`, pacote `bson` (novo, devDependency, só usado em `scripts/`), Prisma 7.8 (`adapter-pg`), Vitest.

## Global Constraints

- Tenant Izalci: `"60b7934c0cc64a0004717e9d"` (comparar como string do hex do ObjectId, já que o pacote `bson` decodifica `_id`/`tenant_id` como instâncias de `ObjectId` — usar `.toHexString()` ou `.toString()` para comparar).
- Fonte: `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/{people,phones,tags}.bson.gz`.
- **Nenhum arquivo com dado pessoal real é committado no git** — diferente da Fase 2. Se o script escrever um relatório de execução em arquivo, o caminho fica fora do repositório (ex.: no diretório de scratchpad da sessão, nunca em `scripts/importacao-izalci/`).
- Reaproveitar `normalizeWhatsApp` de `src/lib/whatsapp.ts` (não reescrever) — assinatura `(input: string) => string | null`, normaliza pra formato `55DDDNNNNNNNNN`, retorna `null` se inválido.
- `Luar Faria`: `_id` `"6063a6ccc3e599000464eaa7"`.
- Fusões de catálogo já aplicadas na Fase 2 (precisam ser reaplicadas aqui pra resolver o nome de tag de uma pessoa pro nome que existe de fato no Postgres — copiadas literalmente de `scripts/importacao-izalci/extrair_catalogos.py`):
  ```typescript
  const SEGMENT_MERGES: Record<string, string> = {
    'ABEDUQ - CHEQUE-EDUCAÇÃO': 'ABEDUQ',
    'B. UNIVERSITARIA': 'BOLSA UNIVERSITÁRIA',
    'CRC-DF': 'CRC-DF - CONSELHO REGIONAL DE CONTABILIDADE',
    'TELECENTROS - DF DIGITAL': 'DF DIGITAL',
    'Acao social': 'Ação social',
    'Ação social .': 'Ação social',
  }
  const CITY_MERGES: Record<string, string> = {
    'Sol Nascente/Pôr do Sol': 'Sol Nascente - Pôr do Sol',
    'Guará / Lúcio Costa': 'Guará',
  }
  const NEIGHBORHOOD_MERGES: Record<string, string> = {
    'Valparaíso de Goias': 'Valparaíso de Goiás',
  }
  ```
- `genero`/`religiao`/`escolaridade` em `Pessoa` são campos de texto livre (`String?`), **não** relação com catálogo — só `regiaoId`/`profissaoId` (FK) e `Segmento` (via `PessoaSegmento`) precisam de id resolvido no Postgres.
- Decodificação de gênero/religião (spec-mãe, valores fixos):
  ```typescript
  const GENERO_POR_TAG_ID: Record<string, string> = {
    '5c82c37a24a225000460301f': 'feminino',
    '5c82c37a24a2250004603016': 'masculino',
  }
  const RELIGIAO_POR_TAG_ID: Record<string, string> = {
    '5c82c2c724a2250004602f24': 'CATÓLICA APOSTÓLICA ROMANA',
  }
  ```
- Campos obrigatórios do `Pessoa.create`: `nome`, `whatsapp`, `gabineteId`. Todo o resto é opcional.
- Sem teste automatizado pra código que toca Mongo/Postgres real (padrão já estabelecido nas Fases 1-2) — mas a lógica de negócio pura desta fase (escolha de telefone, exclusão de dummy, decodificação, montagem de dados de pessoa) é extraível sem I/O e **ganha teste Vitest de verdade**, seguindo TDD.

---

### Task 1: Biblioteca de funções puras (TDD)

**Files:**
- Create: `scripts/importacao-izalci/lib-pessoas-fase3.ts`
- Test: `scripts/importacao-izalci/lib-pessoas-fase3.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `escolherTelefones(telefones: TelefoneMongo[]): TelefonesEscolhidos`, `ehPessoaDummyDoLuar(pessoa: {createdById: string | null; email: string | null; nome: string}): boolean`, `decodificarGenero(genderId: string | null): string | null`, `decodificarReligiao(religionId: string | null): string | null`, `normalizarNome(s: string): string`, `registrarWhatsappUnico(usados: Set<string>, numero: string): boolean`, `resolverNomeCatalogo(labelBruto: string, merges: Record<string,string>): string`. Tipos `TelefoneMongo`, `TelefonesEscolhidos` exportados — a Task 2 usa essas assinaturas exatas.

- [ ] **Step 1: Escrever os testes que hoje falham**

Criar `scripts/importacao-izalci/lib-pessoas-fase3.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  escolherTelefones,
  ehPessoaDummyDoLuar,
  decodificarGenero,
  decodificarReligiao,
  normalizarNome,
  registrarWhatsappUnico,
  resolverNomeCatalogo,
  type TelefoneMongo,
} from './lib-pessoas-fase3'

describe('escolherTelefones', () => {
  it('sem telefones retorna tudo null/vazio', () => {
    expect(escolherTelefones([])).toEqual({ whatsapp: null, telefoneFixo: null, extras: [] })
  })

  it('um celular único vira whatsapp', () => {
    const telefones: TelefoneMongo[] = [{ id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '61987654321' }]
    expect(escolherTelefones(telefones)).toEqual({ whatsapp: '5561987654321', telefoneFixo: null, extras: [] })
  })

  it('prefere celular sobre fixo mesmo se o fixo for mais recente', () => {
    const telefones: TelefoneMongo[] = [
      { id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '61987654321' },
      { id: '000000000000000000000002', tipo: 'landline', numeroCru: '6133224455' },
    ]
    const r = escolherTelefones(telefones)
    expect(r.whatsapp).toBe('5561987654321')
    expect(r.telefoneFixo).toBe('556133224455')
  })

  it('entre múltiplos celulares usa o mais recente (maior _id)', () => {
    const telefones: TelefoneMongo[] = [
      { id: '000000000000000000000002', tipo: 'cellphone', numeroCru: '61911112222' },
      { id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '61987654321' },
    ]
    // fora de ordem de inserção no array — a função deve ordenar por id, não confiar na ordem recebida
    expect(escolherTelefones(telefones).whatsapp).toBe('5561911112222')
  })

  it('só fixo (sem celular) vira whatsapp também', () => {
    const telefones: TelefoneMongo[] = [{ id: '000000000000000000000001', tipo: 'landline', numeroCru: '6133224455' }]
    expect(escolherTelefones(telefones)).toEqual({ whatsapp: '556133224455', telefoneFixo: '556133224455', extras: [] })
  })

  it('números inválidos são descartados', () => {
    const telefones: TelefoneMongo[] = [
      { id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '123' },
      { id: '000000000000000000000002', tipo: 'cellphone', numeroCru: '61987654321' },
    ]
    expect(escolherTelefones(telefones).whatsapp).toBe('5561987654321')
  })

  it('todos inválidos retorna whatsapp null', () => {
    const telefones: TelefoneMongo[] = [{ id: '000000000000000000000001', tipo: 'cellphone', numeroCru: 'abc' }]
    expect(escolherTelefones(telefones).whatsapp).toBeNull()
  })

  it('números extras vão pra extras, sem duplicar o whatsapp/telefoneFixo escolhidos', () => {
    const telefones: TelefoneMongo[] = [
      { id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '61911112222' },
      { id: '000000000000000000000002', tipo: 'cellphone', numeroCru: '61987654321' },
      { id: '000000000000000000000003', tipo: 'landline', numeroCru: '6133224455' },
    ]
    const r = escolherTelefones(telefones)
    expect(r.whatsapp).toBe('5561987654321')
    expect(r.telefoneFixo).toBe('556133224455')
    expect(r.extras).toEqual(['5561911112222'])
  })
})

describe('ehPessoaDummyDoLuar', () => {
  const LUAR = '6063a6ccc3e599000464eaa7'

  it('não é do Luar: false mesmo com nome suspeito', () => {
    expect(ehPessoaDummyDoLuar({ createdById: 'outro-id', email: null, nome: 'Luar teste' })).toBe(false)
  })

  it('é do Luar mas nome/email normais: false', () => {
    expect(ehPessoaDummyDoLuar({ createdById: LUAR, email: 'maria@gmail.com', nome: 'Maria Silva' })).toBe(false)
  })

  it('é do Luar com "teste" no nome: true', () => {
    expect(ehPessoaDummyDoLuar({ createdById: LUAR, email: null, nome: 'Luar 2 Faria teste' })).toBe(true)
  })

  it('é do Luar com "legislapp" no email: true', () => {
    expect(ehPessoaDummyDoLuar({ createdById: LUAR, email: 'x@legislapp.com.br', nome: 'Alguém' })).toBe(true)
  })

  it('é do Luar com "luar" no nome: true', () => {
    expect(ehPessoaDummyDoLuar({ createdById: LUAR, email: null, nome: 'Luar 3 Faria doido' })).toBe(true)
  })
})

describe('decodificarGenero', () => {
  it('id feminino conhecido', () => {
    expect(decodificarGenero('5c82c37a24a225000460301f')).toBe('feminino')
  })
  it('id masculino conhecido', () => {
    expect(decodificarGenero('5c82c37a24a2250004603016')).toBe('masculino')
  })
  it('id desconhecido retorna null', () => {
    expect(decodificarGenero('000000000000000000000000')).toBeNull()
  })
  it('null retorna null', () => {
    expect(decodificarGenero(null)).toBeNull()
  })
})

describe('decodificarReligiao', () => {
  it('id conhecido', () => {
    expect(decodificarReligiao('5c82c2c724a2250004602f24')).toBe('CATÓLICA APOSTÓLICA ROMANA')
  })
  it('id desconhecido retorna null', () => {
    expect(decodificarReligiao('000000000000000000000000')).toBeNull()
  })
})

describe('normalizarNome', () => {
  it('remove acento e caixa', () => {
    expect(normalizarNome('Luziânia')).toBe('luziania')
    expect(normalizarNome('LUZIANIA')).toBe('luziania')
  })
  it('mantém espaços internos, remove das pontas', () => {
    expect(normalizarNome('  Água Fria de Goiás  ')).toBe('agua fria de goias')
  })
})

describe('registrarWhatsappUnico', () => {
  it('primeiro registro retorna true', () => {
    const usados = new Set<string>()
    expect(registrarWhatsappUnico(usados, '5561987654321')).toBe(true)
    expect(usados.has('5561987654321')).toBe(true)
  })
  it('segundo registro do mesmo número retorna false', () => {
    const usados = new Set<string>(['5561987654321'])
    expect(registrarWhatsappUnico(usados, '5561987654321')).toBe(false)
  })
})

describe('resolverNomeCatalogo', () => {
  it('sem fusão, retorna o próprio label', () => {
    expect(resolverNomeCatalogo('Taguatinga', {})).toBe('Taguatinga')
  })
  it('com fusão, retorna o nome canônico', () => {
    expect(resolverNomeCatalogo('Acao social', { 'Acao social': 'Ação social' })).toBe('Ação social')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd /Users/renato/Documents/meubd && npx vitest run scripts/importacao-izalci/lib-pessoas-fase3.test.ts`
Expected: FAIL — `Cannot find module './lib-pessoas-fase3'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `lib-pessoas-fase3.ts`**

Criar `scripts/importacao-izalci/lib-pessoas-fase3.ts`:

```typescript
import { normalizeWhatsApp } from '../../src/lib/whatsapp'

export type TelefoneMongo = {
  id: string
  tipo: 'cellphone' | 'landline'
  numeroCru: string
}

export type TelefonesEscolhidos = {
  whatsapp: string | null
  telefoneFixo: string | null
  extras: string[]
}

export function escolherTelefones(telefones: TelefoneMongo[]): TelefonesEscolhidos {
  const ordenados = [...telefones].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const normalizados = ordenados
    .map((t) => ({ ...t, normalizado: normalizeWhatsApp(t.numeroCru) }))
    .filter((t): t is TelefoneMongo & { normalizado: string } => t.normalizado !== null)

  const celulares = normalizados.filter((t) => t.tipo === 'cellphone')
  const fixos = normalizados.filter((t) => t.tipo === 'landline')

  const whatsapp =
    celulares.length > 0
      ? celulares[celulares.length - 1].normalizado
      : fixos.length > 0
        ? fixos[fixos.length - 1].normalizado
        : null

  const telefoneFixo = fixos.length > 0 ? fixos[fixos.length - 1].normalizado : null

  const usados = new Set([whatsapp, telefoneFixo].filter((v): v is string => v !== null))
  const extrasSet = new Set<string>()
  for (const t of normalizados) {
    if (!usados.has(t.normalizado)) extrasSet.add(t.normalizado)
  }

  return { whatsapp, telefoneFixo, extras: [...extrasSet] }
}

const LUAR_ID = '6063a6ccc3e599000464eaa7'

export function ehPessoaDummyDoLuar(pessoa: { createdById: string | null; email: string | null; nome: string }): boolean {
  if (pessoa.createdById !== LUAR_ID) return false
  const emailLower = (pessoa.email ?? '').toLowerCase()
  const nomeLower = pessoa.nome.toLowerCase()
  return (
    emailLower.includes('legislapp') ||
    emailLower.includes('teste') ||
    nomeLower.includes('teste') ||
    nomeLower.includes('luar')
  )
}

const GENERO_POR_TAG_ID: Record<string, string> = {
  '5c82c37a24a225000460301f': 'feminino',
  '5c82c37a24a2250004603016': 'masculino',
}

const RELIGIAO_POR_TAG_ID: Record<string, string> = {
  '5c82c2c724a2250004602f24': 'CATÓLICA APOSTÓLICA ROMANA',
}

export function decodificarGenero(genderId: string | null): string | null {
  return genderId ? (GENERO_POR_TAG_ID[genderId] ?? null) : null
}

export function decodificarReligiao(religionId: string | null): string | null {
  return religionId ? (RELIGIAO_POR_TAG_ID[religionId] ?? null) : null
}

export function normalizarNome(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export function registrarWhatsappUnico(usados: Set<string>, numero: string): boolean {
  if (usados.has(numero)) return false
  usados.add(numero)
  return true
}

export function resolverNomeCatalogo(labelBruto: string, merges: Record<string, string>): string {
  return merges[labelBruto] ?? labelBruto
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd /Users/renato/Documents/meubd && npx vitest run scripts/importacao-izalci/lib-pessoas-fase3.test.ts`
Expected: todos os testes passando (25 testes).

- [ ] **Step 5: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/renato/Documents/meubd
git add scripts/importacao-izalci/lib-pessoas-fase3.ts scripts/importacao-izalci/lib-pessoas-fase3.test.ts
git commit -m "$(cat <<'EOF'
feat: funções puras da Fase 3 (pessoas) da importação Izalci

escolherTelefones (celular > fixo, mais recente por _id, fixo-único
também vira whatsapp), ehPessoaDummyDoLuar, decodificarGenero/Religiao,
normalizarNome, registrarWhatsappUnico, resolverNomeCatalogo — toda a
lógica de negócio sem I/O desta fase, testada com Vitest (TDD).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Script de importação (BSON + Mongo + Postgres)

**Files:**
- Create: `scripts/importacao-izalci/importar-pessoas-fase3.ts`
- Modify: `package.json` (adicionar `bson` como devDependency)

**Interfaces:**
- Consumes: `escolherTelefones`, `ehPessoaDummyDoLuar`, `decodificarGenero`, `decodificarReligiao`, `normalizarNome`, `registrarWhatsappUnico`, `resolverNomeCatalogo` de `./lib-pessoas-fase3` (Task 1), com as assinaturas exatas definidas lá.
- Produces: nada consumido por outra task — a Task 3 só executa este script.

- [ ] **Step 1: Instalar o pacote `bson`**

```bash
cd /Users/renato/Documents/meubd
npm install --save-dev bson
```

Expected: `package.json` ganha `bson` em `devDependencies`, sem erro.

- [ ] **Step 2: Criar o script**

Criar `scripts/importacao-izalci/importar-pessoas-fase3.ts`:

```typescript
/**
 * Script pontual: importa Pessoa + TelefoneExtra + PessoaSegmento +
 * ObservacaoPessoa (role legado) da coleção people do MongoDB do Izalci
 * pra um gabinete do Rede Mobiliza.
 *
 * Uso: npx tsx scripts/importacao-izalci/importar-pessoas-fase3.ts <slug> [--limit=N]
 */
import * as fs from 'fs'
import * as zlib from 'zlib'
import * as path from 'path'
import * as os from 'os'
import { deserialize, ObjectId } from 'bson'
import { PrismaClient } from '../../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import {
  escolherTelefones,
  ehPessoaDummyDoLuar,
  decodificarGenero,
  decodificarReligiao,
  normalizarNome,
  registrarWhatsappUnico,
  resolverNomeCatalogo,
  type TelefoneMongo,
} from './lib-pessoas-fase3'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter } as never)

const BACKUP_DIR = '/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod'
const TENANT_IZALCI = '60b7934c0cc64a0004717e9d'
const LOTE = 1000

const SEGMENT_MERGES: Record<string, string> = {
  'ABEDUQ - CHEQUE-EDUCAÇÃO': 'ABEDUQ',
  'B. UNIVERSITARIA': 'BOLSA UNIVERSITÁRIA',
  'CRC-DF': 'CRC-DF - CONSELHO REGIONAL DE CONTABILIDADE',
  'TELECENTROS - DF DIGITAL': 'DF DIGITAL',
  'Acao social': 'Ação social',
  'Ação social .': 'Ação social',
}
const CITY_MERGES: Record<string, string> = {
  'Sol Nascente/Pôr do Sol': 'Sol Nascente - Pôr do Sol',
  'Guará / Lúcio Costa': 'Guará',
}
const NEIGHBORHOOD_MERGES: Record<string, string> = {
  'Valparaíso de Goias': 'Valparaíso de Goiás',
}

function* iterarDocumentosBson(caminhoGz: string): Generator<Record<string, unknown>> {
  const buffer = zlib.gunzipSync(fs.readFileSync(caminhoGz))
  let offset = 0
  while (offset < buffer.length) {
    const tamanho = buffer.readInt32LE(offset)
    const docBuffer = buffer.subarray(offset, offset + tamanho)
    yield deserialize(docBuffer) as Record<string, unknown>
    offset += tamanho
  }
}

function idParaString(v: unknown): string | null {
  if (v instanceof ObjectId) return v.toHexString()
  if (typeof v === 'string') return v
  return null
}

type TagInfo = { type: string; label: string }

function carregarTags(): Map<string, TagInfo> {
  const mapa = new Map<string, TagInfo>()
  for (const doc of iterarDocumentosBson(path.join(BACKUP_DIR, 'tags.bson.gz'))) {
    if (idParaString(doc.tenant_id) !== TENANT_IZALCI) continue
    const id = idParaString(doc._id)
    if (!id) continue
    mapa.set(id, { type: String(doc.type ?? ''), label: String(doc.label ?? '') })
  }
  return mapa
}

function carregarTelefonesPorPessoa(): Map<string, TelefoneMongo[]> {
  const mapa = new Map<string, TelefoneMongo[]>()
  for (const doc of iterarDocumentosBson(path.join(BACKUP_DIR, 'phones.bson.gz'))) {
    const personId = idParaString(doc.person_id)
    const id = idParaString(doc._id)
    if (!personId || !id) continue
    const tipo = doc.type === 'cellphone' ? 'cellphone' : 'landline'
    const lista = mapa.get(personId) ?? []
    lista.push({ id, tipo, numeroCru: String(doc.number ?? '') })
    mapa.set(personId, lista)
  }
  return mapa
}

async function carregarCatalogoRegiao(gabineteId: string): Promise<Map<string, string>> {
  const regioes = await prisma.regiao.findMany({ where: { gabineteId, ativa: true }, select: { id: true, nome: true } })
  const mapa = new Map<string, string>()
  for (const r of regioes) mapa.set(normalizarNome(r.nome), r.id)
  return mapa
}

async function carregarCatalogoProfissao(gabineteId: string): Promise<Map<string, string>> {
  const profissoes = await prisma.profissao.findMany({ where: { gabineteId, ativa: true }, select: { id: true, nome: true } })
  const mapa = new Map<string, string>()
  for (const p of profissoes) mapa.set(normalizarNome(p.nome), p.id)
  return mapa
}

async function carregarCatalogoSegmento(gabineteId: string): Promise<Map<string, string>> {
  const segmentos = await prisma.segmento.findMany({ where: { gabineteId, status: 'ativo' }, select: { id: true, nome: true } })
  const mapa = new Map<string, string>()
  for (const s of segmentos) mapa.set(normalizarNome(s.nome), s.id)
  return mapa
}

function tagIdsDaPessoa(doc: Record<string, unknown>): string[] {
  const bruto = doc.tag_ids
  if (!Array.isArray(bruto)) return []
  return bruto.map(idParaString).filter((v): v is string => v !== null)
}

function primeiraTagDoTipo(tagIds: string[], tags: Map<string, TagInfo>, tipo: string): TagInfo | null {
  for (const id of tagIds) {
    const info = tags.get(id)
    if (info && info.type === tipo) return info
  }
  return null
}

function todasTagsDoTipo(tagIds: string[], tags: Map<string, TagInfo>, tipo: string): TagInfo[] {
  return tagIds.map((id) => tags.get(id)).filter((t): t is TagInfo => !!t && t.type === tipo)
}

type DadosPessoa = {
  nome: string
  whatsapp: string
  email: string | null
  cpf: string | null
  nascimento: Date | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  regiaoId: string | null
  profissaoId: string | null
  genero: string | null
  religiao: string | null
  escolaridade: string | null
  zonaEleitoral: string | null
  secaoEleitoral: string | null
  deletedAt: Date | null
  origem: string
  segmentoIds: string[]
  role: string | null
}

function montarDadosPessoa(
  doc: Record<string, unknown>,
  tags: Map<string, TagInfo>,
  regiaoPorNome: Map<string, string>,
  profissaoPorNome: Map<string, string>,
  segmentoPorNome: Map<string, string>
): DadosPessoa {
  const tagIds = tagIdsDaPessoa(doc)

  const tagBairro = primeiraTagDoTipo(tagIds, tags, 'Neighborhood')
  const tagCidade = primeiraTagDoTipo(tagIds, tags, 'City')
  const labelRegiao =
    tagBairro?.label ??
    (typeof doc.neighborhood_label === 'string' ? doc.neighborhood_label : null) ??
    tagCidade?.label ??
    (typeof doc.city_label === 'string' ? doc.city_label : null)
  const regiaoId = labelRegiao
    ? (regiaoPorNome.get(normalizarNome(resolverNomeCatalogo(labelRegiao, { ...CITY_MERGES, ...NEIGHBORHOOD_MERGES }))) ?? null)
    : null

  const tagProfissao = primeiraTagDoTipo(tagIds, tags, 'Profession')
  const profissaoId = tagProfissao ? (profissaoPorNome.get(normalizarNome(tagProfissao.label)) ?? null) : null

  const tagEscolaridade = primeiraTagDoTipo(tagIds, tags, 'Schooling')

  const segmentoIds = todasTagsDoTipo(tagIds, tags, 'Segment')
    .map((t) => segmentoPorNome.get(normalizarNome(resolverNomeCatalogo(t.label, SEGMENT_MERGES))))
    .filter((id): id is string => !!id)

  const nome = `${String(doc.name ?? '').trim()} ${String(doc.surname ?? '').trim()}`.trim()

  return {
    nome,
    whatsapp: '', // preenchido depois de resolver telefone, no chamador
    email: typeof doc.email === 'string' && doc.email ? doc.email : null,
    cpf: typeof doc.cpf === 'string' && doc.cpf ? doc.cpf : null,
    nascimento: doc.birth_date instanceof Date ? doc.birth_date : null,
    cep: typeof doc.cep === 'string' && doc.cep ? doc.cep : null,
    logradouro: typeof doc.street_name === 'string' && doc.street_name ? doc.street_name : null,
    numero: typeof doc.address_number === 'string' && doc.address_number ? doc.address_number : null,
    complemento: typeof doc.address_complement === 'string' && doc.address_complement ? doc.address_complement : null,
    bairro: typeof doc.neighborhood_label === 'string' && doc.neighborhood_label ? doc.neighborhood_label : null,
    regiaoId,
    profissaoId,
    genero: decodificarGenero(idParaString(doc.gender_id)),
    religiao: decodificarReligiao(idParaString(doc.religion_id)),
    escolaridade: tagEscolaridade?.label ?? null,
    zonaEleitoral: typeof doc.electoral_zone === 'string' && doc.electoral_zone ? doc.electoral_zone : null,
    secaoEleitoral: typeof doc.electoral_section === 'string' && doc.electoral_section ? doc.electoral_section : null,
    deletedAt: doc.deleted === true ? (doc.updated_at instanceof Date ? doc.updated_at : new Date()) : null,
    origem: 'Importado do sistema anterior (MongoDB)',
    segmentoIds,
    role: typeof doc.role === 'string' && doc.role && doc.role !== 'none' ? doc.role : null,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const gabineteSlug = args[0]
  const limiteArg = args.find((a) => a.startsWith('--limit='))
  const limite = limiteArg ? Number(limiteArg.split('=')[1]) : null

  if (!gabineteSlug) {
    console.error('Uso: npx tsx scripts/importacao-izalci/importar-pessoas-fase3.ts <slug-do-gabinete> [--limit=N]')
    process.exit(1)
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { slug: gabineteSlug } })
  if (!gabinete) {
    console.error(`Gabinete com slug "${gabineteSlug}" não encontrado.`)
    process.exit(1)
  }
  console.log(`✓ Gabinete: ${gabinete.nome} (${gabinete.id})`)

  console.log('Carregando tags...')
  const tags = carregarTags()
  console.log(`✓ ${tags.size} tags carregadas`)

  console.log('Carregando telefones...')
  const telefonesPorPessoa = carregarTelefonesPorPessoa()
  console.log(`✓ telefones de ${telefonesPorPessoa.size} pessoas carregados`)

  console.log('Carregando catálogos do Postgres...')
  const regiaoPorNome = await carregarCatalogoRegiao(gabinete.id)
  const profissaoPorNome = await carregarCatalogoProfissao(gabinete.id)
  const segmentoPorNome = await carregarCatalogoSegmento(gabinete.id)
  console.log(`✓ Regiao=${regiaoPorNome.size} Profissao=${profissaoPorNome.size} Segmento=${segmentoPorNome.size}`)

  // Idempotência: pré-carrega os whatsapp já importados neste gabinete (de uma
  // execução anterior, ex. o lote pequeno de teste) — sem isso, rodar o script
  // de novo tentaria recriar a mesma pessoa e quebraria no índice único do
  // banco no meio do lote, corrompendo o mapeamento posicional de
  // createManyAndReturn (ver Task 3, achado da sessão de planejamento).
  const existentes = await prisma.pessoa.findMany({
    where: { gabineteId: gabinete.id, deletedAt: null },
    select: { whatsapp: true },
  })
  const whatsappsUsados = new Set<string>(existentes.map((p) => p.whatsapp))
  console.log(`✓ ${whatsappsUsados.size} whatsapp já existentes neste gabinete (pré-carregados pra evitar duplicata)`)

  const pulados: { id: string; nome: string; motivo: string }[] = []

  type PessoaParaCriar = DadosPessoa & { mongoId: string; telefoneFixo: string | null; extras: string[] }
  let lote: PessoaParaCriar[] = []
  let processadas = 0
  let criadas = 0

  async function processarLote() {
    if (lote.length === 0) return

    const criadas_ = await prisma.pessoa.createManyAndReturn({
      data: lote.map((p) => ({
        gabineteId: gabinete.id,
        nome: p.nome,
        whatsapp: p.whatsapp,
        telefoneFixo: p.telefoneFixo,
        email: p.email,
        cpf: p.cpf,
        nascimento: p.nascimento,
        cep: p.cep,
        logradouro: p.logradouro,
        numero: p.numero,
        complemento: p.complemento,
        bairro: p.bairro,
        regiaoId: p.regiaoId,
        profissaoId: p.profissaoId,
        genero: p.genero,
        religiao: p.religiao,
        escolaridade: p.escolaridade,
        zonaEleitoral: p.zonaEleitoral,
        secaoEleitoral: p.secaoEleitoral,
        deletedAt: p.deletedAt,
        origem: p.origem,
      })),
      select: { id: true, whatsapp: true },
    })

    // createManyAndReturn preserva a ordem de entrada — mapear de volta pro mongoId pela posição
    const pessoaSegmentoData: { pessoaId: string; segmentoId: string }[] = []
    const observacaoData: { gabineteId: string; pessoaId: string; autorUserId: string; autorNome: string; texto: string }[] = []
    const telefoneExtraData: { gabineteId: string; pessoaId: string; numero: string; tipo: string | null }[] = []

    for (let i = 0; i < lote.length; i++) {
      const origem = lote[i]
      const criada = criadas_[i]
      for (const segmentoId of origem.segmentoIds) {
        pessoaSegmentoData.push({ pessoaId: criada.id, segmentoId })
      }
      if (origem.role) {
        observacaoData.push({
          gabineteId: gabinete.id,
          pessoaId: criada.id,
          autorUserId: 'sistema-importacao-izalci',
          autorNome: 'Importação Izalci (sistema anterior)',
          texto: `Papel no sistema anterior: ${origem.role}`,
        })
      }
      for (const numero of origem.extras) {
        telefoneExtraData.push({ gabineteId: gabinete.id, pessoaId: criada.id, numero, tipo: null })
      }
    }

    if (pessoaSegmentoData.length > 0) {
      await prisma.pessoaSegmento.createMany({ data: pessoaSegmentoData })
    }
    if (observacaoData.length > 0) {
      await prisma.observacaoPessoa.createMany({ data: observacaoData })
    }
    if (telefoneExtraData.length > 0) {
      await prisma.telefoneExtra.createMany({ data: telefoneExtraData })
    }

    criadas += lote.length
    lote = []
  }

  for (const doc of iterarDocumentosBson(path.join(BACKUP_DIR, 'people.bson.gz'))) {
    if (idParaString(doc.tenant_id) !== TENANT_IZALCI) continue

    processadas++
    if (limite && processadas > limite) break

    const mongoId = idParaString(doc._id) ?? ''
    const nomeCompleto = `${String(doc.name ?? '').trim()} ${String(doc.surname ?? '').trim()}`.trim()
    const createdById = idParaString(doc.created_by_id)

    if (ehPessoaDummyDoLuar({ createdById, email: typeof doc.email === 'string' ? doc.email : null, nome: nomeCompleto })) {
      pulados.push({ id: mongoId, nome: nomeCompleto, motivo: 'dummy do Luar' })
      continue
    }

    const telefones = telefonesPorPessoa.get(mongoId) ?? []
    const { whatsapp, telefoneFixo, extras } = escolherTelefones(telefones)

    if (!whatsapp) {
      pulados.push({ id: mongoId, nome: nomeCompleto, motivo: 'sem telefone válido' })
      continue
    }
    if (!registrarWhatsappUnico(whatsappsUsados, whatsapp)) {
      pulados.push({ id: mongoId, nome: nomeCompleto, motivo: `whatsapp duplicado (${whatsapp})` })
      continue
    }

    const dados = montarDadosPessoa(doc, tags, regiaoPorNome, profissaoPorNome, segmentoPorNome)
    dados.whatsapp = whatsapp

    lote.push({ ...dados, mongoId, telefoneFixo, extras })

    if (lote.length >= LOTE) {
      await processarLote()
      console.log(`  ... ${criadas} pessoas criadas (${processadas} processadas)`)
    }
  }
  await processarLote()

  console.log(`\n✓ Processadas: ${processadas}`)
  console.log(`✓ Criadas: ${criadas}`)
  console.log(`✓ Puladas: ${pulados.length}`)

  const relatorioPath = path.join(os.tmpdir(), `importacao-izalci-fase3-pulados-${gabineteSlug}-${Date.now()}.json`)
  fs.writeFileSync(relatorioPath, JSON.stringify(pulados, null, 2))
  console.log(`✓ Relatório de puladas (fora do repositório): ${relatorioPath}`)

  console.log('\n✅ Importação de Pessoas da Fase 3 concluída.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 3: Checar tipos**

```bash
cd /Users/renato/Documents/meubd
npx tsc --noEmit
```

Expected: sem erros. Se `createManyAndReturn` não existir no client gerado (erro de tipo `Property 'createManyAndReturn' does not exist`), trocar por `createMany` seguido de uma query `findMany` filtrando pelos `whatsapp`s do lote (que são únicos) pra recuperar os ids gerados, na mesma ordem.

- [ ] **Step 4: Commit**

```bash
cd /Users/renato/Documents/meubd
git add package.json package-lock.json scripts/importacao-izalci/importar-pessoas-fase3.ts
git commit -m "$(cat <<'EOF'
feat: script de importação de Pessoas da Fase 3 (Izalci)

Lê people/phones/tags.bson.gz diretamente (decodificação BSON própria,
pacote bson novo como devDependency), resolve Regiao/Profissao/Segmento
já criados na Fase 2, aplica as regras de telefone/exclusão/dedup da
Task 1, e insere em lotes de 1000 via createManyAndReturn. Relatório de
pessoas puladas fica fora do repositório (dado pessoal real).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Nota pós-execução (Task 3 já rodou de verdade)

A Task 3 rodou contra staging e produção e encontrou 2 bugs reais que a revisão de código das Tasks 1-2 não pegou — nenhum dos dois estava previsto neste plano original:

1. **`birth_date` sentinela** (ano 0000, usado no sistema legado pra "sem data de nascimento" — 84 pessoas do tenant com anos implausíveis) quebrava o `INSERT` inteiro no Postgres. Corrigido com `validarNascimento()` nova em `lib-pessoas-fase3.ts` (testada), commit `a2df5ce`.
2. **`P2002` em `PessoaSegmento`** quando duas tags de Segmento de uma pessoa resolviam pro mesmo `segmentoId` pós-fusão da Fase 2 (ex. `ABEDUQ` + `ABEDUQ - CHEQUE-EDUCAÇÃO`). Corrigido deduplicando `segmentoIds`, commit `7b04b9d`.
3. Achado da revisão final (não-bloqueante, corrigido como follow-up): `updated_at`→`deletedAt` tinha a mesma exposição a data sentinela do bug 1, sem nunca ter disparado no run real — corrigido preventivamente, commit `89715df`.

Staging precisou de limpeza manual (`DELETE` de `Pessoa`/`PessoaSegmento`/`TelefoneExtra`/`ObservacaoPessoa` do gabinete de teste) entre as tentativas com bug e a execução final limpa — produção nunca rodou a versão com bug, só a já corrigida.

**Resultado final (idêntico em staging e produção)**: `Pessoa`=122.725 (de 142.489 processadas, 19.764 puladas — dummies do Luar, sem telefone válido, ou whatsapp duplicado), com `regiaoId`=85.726, com `profissaoId`=8.406, com ≥1 `Segmento`=69.243, `ObservacaoPessoa`(role legado)=260, com ≥1 `TelefoneExtra`=4.470, soft-deletadas=121.

---

### Task 3: Rollout — lote pequeno em staging, staging completo, produção

**Files:**
- Nenhum arquivo novo — só execução do script da Task 2 contra bancos reais.

**Interfaces:**
- Consumes: `scripts/importacao-izalci/importar-pessoas-fase3.ts` (Task 2).
- Produces: nada — última task da Fase 3.

- [ ] **Step 1: Lote pequeno em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
npx tsx scripts/importacao-izalci/importar-pessoas-fase3.ts staging-teste --limit=500
```

Expected: termina em `✅ Importação de Pessoas da Fase 3 concluída.`, sem `Error`. Anote o caminho do relatório de puladas impresso.

- [ ] **Step 2: Verificar o lote pequeno em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const { rows: [g] } = await client.query('SELECT id FROM \"Gabinete\" WHERE slug = \$1', ['staging-teste'])
  const { rows: [{ count: totalPessoas }] } = await client.query('SELECT COUNT(*) FROM \"Pessoa\" WHERE \"gabineteId\" = \$1 AND origem = \$2', [g.id, 'Importado do sistema anterior (MongoDB)'])
  const { rows: [{ count: comRegiao }] } = await client.query('SELECT COUNT(*) FROM \"Pessoa\" WHERE \"gabineteId\" = \$1 AND origem = \$2 AND \"regiaoId\" IS NOT NULL', [g.id, 'Importado do sistema anterior (MongoDB)'])
  const { rows: [{ count: comSegmento }] } = await client.query('SELECT COUNT(DISTINCT ps.\"pessoaId\") FROM \"PessoaSegmento\" ps JOIN \"Pessoa\" p ON p.id = ps.\"pessoaId\" WHERE p.\"gabineteId\" = \$1', [g.id])
  const { rows: [{ count: comObservacao }] } = await client.query('SELECT COUNT(*) FROM \"ObservacaoPessoa\" WHERE \"gabineteId\" = \$1', [g.id])
  console.log('Pessoas importadas:', totalPessoas)
  console.log('Com regiaoId:', comRegiao)
  console.log('Com pelo menos 1 Segmento:', comSegmento)
  console.log('ObservacaoPessoa (role legado):', comObservacao)
  await client.end()
})
"
```

Expected: `Pessoas importadas` próximo de 500 (pode ser menor se o lote de 500 processados incluiu dummies/sem-telefone/duplicatas puladas). `Com regiaoId` e `Com pelo menos 1 Segmento` maiores que zero (a maioria das pessoas tem tag de bairro/cidade e ao menos 1 segmento, per achados da sessão de brainstorming — 77.638 de 142.489 têm ao menos 1 segmento no tenant inteiro).

- [ ] **Step 3: Lote completo em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
npx tsx scripts/importacao-izalci/importar-pessoas-fase3.ts staging-teste
```

Expected: termina em `✅ Importação de Pessoas da Fase 3 concluída.`. `Processadas` fica perto de 142.489 (o script sempre itera o tenant inteiro, independente de quantas pessoas já existem). As ~500 pessoas já criadas no Step 1 aparecem de novo no relatório de puladas desta execução, com motivo `whatsapp duplicado` — **isso é esperado, não é erro**: o script pré-carrega os whatsapp já existentes no gabinete antes de rodar (ver Task 2), então reconhece essas 500 como já importadas e não tenta recriá-las. `Criadas` cobre o restante das ~127.398 elegíveis (127.398 menos as ~500 já criadas no Step 1, ajustado pelas puladas reais de cada categoria).

- [ ] **Step 4: Verificar o lote completo em staging**

Rodar a mesma query do Step 2, trocando as expectativas: `Pessoas importadas` deve ficar perto de 127.398 (considerando as puladas por dummy/sem-telefone/duplicata já contabilizadas no relatório).

- [ ] **Step 5: Lote completo em produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
npx tsx scripts/importacao-izalci/importar-pessoas-fase3.ts izalci
```

Expected: mesma saída de sucesso do Step 3, rodando contra o gabinete IZALCI real.

- [ ] **Step 6: Verificar o resultado em produção**

Rodar a mesma query de verificação do Step 2, trocando o slug pra `izalci` e o `DIRECT_URL`/env pra `.env.local`. Expected: números próximos aos de staging (Step 4), confirmando paridade entre os dois ambientes.

- [ ] **Step 7: Reportar ao usuário**

Sem commit adicional (Task 3 só executa o script já commitado na Task 2). Confirmar ao usuário: contagem final de pessoas importadas em produção, quantas foram puladas e por quê (resumo do relatório, não o arquivo inteiro — ele fica fora do repositório e não deve ser colado na conversa por conter dado pessoal), e que a Fase 3 está pronta para a Fase 4 (Banco de Talentos) e Fase 5 (rede de indicação).
