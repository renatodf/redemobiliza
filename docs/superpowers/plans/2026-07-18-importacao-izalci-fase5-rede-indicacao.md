# Importação Izalci — Fase 5: Rede de Indicação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir `VinculoRede` a partir de `people.created_by_id` do MongoDB do Izalci, ligando cada `Pessoa` já importada (Fase 3) ao seu indicador, ou marcando-a como raiz quando não há indicador utilizável.

**Architecture:** Um script TypeScript único. Refaz exatamente o mesmo passo de seleção de "documento Mongo canônico por whatsapp" que a Fase 3 fez (mesmas funções puras reaproveitadas, mesma ordem de iteração), pra saber qual `created_by_id` cada `Pessoa` já importada realmente tem. Resolve `indicadoPorId` via um mapa `whatsapp → pessoaId` carregado do Postgres, calcula `nivel` por um algoritmo iterativo multi-passe sobre o grafo já resolvido (sem recursão, seguro pra ~122 mil nós), e cria os registros em lote.

**Tech Stack:** TypeScript via `npx tsx`, pacote `bson` (já instalado), Prisma 7.8 (`adapter-pg`), Vitest.

## Global Constraints

- Tenant Izalci: `"60b7934c0cc64a0004717e9d"` (comparar via `.toHexString()` do `ObjectId`).
- IDs de desenvolvedor do sistema antigo (nunca usados como `indicadoPorId`, viram raiz quem foi "criado" por eles): `67605433e30de14b89780451` (Gustavo Vieira Silva), `6063a6ccc3e599000464eaa7` (Luar Faria).
- Fonte: `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/{people,phones}.bson.gz`.
- **Nenhum arquivo com dado pessoal real é committado** — mesma regra das Fases 3-4. Relatório de execução fica fora do repositório (`os.tmpdir()`), sem nome/e-mail — só ids do Mongo e motivo.
- Reaproveitar de `scripts/importacao-izalci/lib-pessoas-fase3.ts` (já existe, não reescrever): `escolherTelefones(telefones: TelefoneMongo[]): TelefonesEscolhidos`, `ehPessoaDummyDoLuar(pessoa: { createdById: string | null; email: string | null; nome: string }): boolean`, `registrarWhatsappUnico(usados: Set<string>, numero: string): boolean`, tipo `TelefoneMongo`.
- Reprocessar `people.bson.gz` na **mesma ordem e com os mesmos filtros** que `importar-pessoas-fase3.ts` usou (tenant Izalci, excluir dummy do Luar, `escolherTelefones`, `registrarWhatsappUnico`) — isso reconstrói de forma determinística qual documento Mongo é a fonte canônica de cada `Pessoa` já importada.
- `tsconfig.json` do projeto não tem `downlevelIteration` — usar loop manual `for (let r = iter.next(); !r.done; r = iter.next())` sobre `Generator`, mesmo padrão já usado (depois de corrigido) nas Fases 3-4.
- `VinculoRede.pessoaId` não é `@unique` no schema, mas a invariante da aplicação é que toda `Pessoa` ativa tem **no máximo uma** `VinculoRede` ativa (`deletedAt IS NULL`) — checar antes de criar, pra idempotência (rodar o script duas vezes contra o mesmo gabinete não deve duplicar).
- Sem teste automatizado pra código que toca Mongo/Postgres real — mas a lógica pura (resolver o mongoId do indicador, calcular `nivel` a partir de um grafo já resolvido) ganha teste Vitest de verdade (TDD).

---

### Task 1: Biblioteca de funções puras (TDD)

**Files:**
- Create: `scripts/importacao-izalci/lib-rede-fase5.ts`
- Test: `scripts/importacao-izalci/lib-rede-fase5.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `DEV_IDS: Set<string>`, `resolverMongoIdIndicador(createdById: string | null, mongoIdsCanonicos: Set<string>): string | null` e `calcularNiveis(indicadorPorMongoId: Map<string, string | null>): Map<string, number>` — a Task 2 usa esses nomes e assinaturas exatas.

- [ ] **Step 1: Escrever os testes que hoje falham**

Criar `scripts/importacao-izalci/lib-rede-fase5.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolverMongoIdIndicador, calcularNiveis } from './lib-rede-fase5'

describe('resolverMongoIdIndicador', () => {
  const canonicos = new Set(['pessoa-a', 'pessoa-b', 'dev-gustavo-nao-deveria-estar-aqui'])

  it('sem created_by_id retorna null (raiz)', () => {
    expect(resolverMongoIdIndicador(null, canonicos)).toBeNull()
  })

  it('created_by_id é o dev Gustavo retorna null (raiz), mesmo se ele for canônico', () => {
    expect(resolverMongoIdIndicador('67605433e30de14b89780451', canonicos)).toBeNull()
  })

  it('created_by_id é o dev Luar retorna null (raiz)', () => {
    expect(resolverMongoIdIndicador('6063a6ccc3e599000464eaa7', canonicos)).toBeNull()
  })

  it('created_by_id não é canônico (indicador não foi importado) retorna null (raiz)', () => {
    expect(resolverMongoIdIndicador('pessoa-nao-importada', canonicos)).toBeNull()
  })

  it('created_by_id válido e canônico retorna o próprio id', () => {
    expect(resolverMongoIdIndicador('pessoa-a', canonicos)).toBe('pessoa-a')
  })
})

describe('calcularNiveis', () => {
  it('mapa vazio retorna mapa vazio', () => {
    expect(calcularNiveis(new Map())).toEqual(new Map())
  })

  it('um nó raiz único tem nível 0', () => {
    const grafo = new Map([['a', null]])
    expect(calcularNiveis(grafo)).toEqual(new Map([['a', 0]]))
  })

  it('cadeia de profundidade 3', () => {
    const grafo = new Map<string, string | null>([
      ['raiz', null],
      ['filho1', 'raiz'],
      ['filho2', 'filho1'],
      ['filho3', 'filho2'],
    ])
    expect(calcularNiveis(grafo)).toEqual(
      new Map([
        ['raiz', 0],
        ['filho1', 1],
        ['filho2', 2],
        ['filho3', 3],
      ])
    )
  })

  it('duas raízes independentes com filhos próprios', () => {
    const grafo = new Map<string, string | null>([
      ['raiz1', null],
      ['raiz2', null],
      ['filho-de-1', 'raiz1'],
      ['filho-de-2', 'raiz2'],
    ])
    expect(calcularNiveis(grafo)).toEqual(
      new Map([
        ['raiz1', 0],
        ['raiz2', 0],
        ['filho-de-1', 1],
        ['filho-de-2', 1],
      ])
    )
  })

  it('nó cujo indicador não está no mapa (nunca deveria acontecer na prática) recebe nível 0 por segurança', () => {
    const grafo = new Map<string, string | null>([['orfao', 'indicador-inexistente']])
    expect(calcularNiveis(grafo)).toEqual(new Map([['orfao', 0]]))
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd /Users/renato/Documents/meubd && npx vitest run scripts/importacao-izalci/lib-rede-fase5.test.ts`
Expected: FAIL — `Cannot find module './lib-rede-fase5'`.

- [ ] **Step 3: Implementar `lib-rede-fase5.ts`**

Criar `scripts/importacao-izalci/lib-rede-fase5.ts`:

```typescript
export const DEV_IDS = new Set(['67605433e30de14b89780451', '6063a6ccc3e599000464eaa7'])

export function resolverMongoIdIndicador(createdById: string | null, mongoIdsCanonicos: Set<string>): string | null {
  if (!createdById) return null
  if (DEV_IDS.has(createdById)) return null
  if (!mongoIdsCanonicos.has(createdById)) return null
  return createdById
}

export function calcularNiveis(indicadorPorMongoId: Map<string, string | null>): Map<string, number> {
  const niveis = new Map<string, number>()
  let restantes = new Set(indicadorPorMongoId.keys())

  let mudou = true
  while (mudou && restantes.size > 0) {
    mudou = false
    for (const mongoId of Array.from(restantes)) {
      const indicador = indicadorPorMongoId.get(mongoId) ?? null
      if (indicador === null) {
        niveis.set(mongoId, 0)
        restantes.delete(mongoId)
        mudou = true
      } else if (niveis.has(indicador)) {
        niveis.set(mongoId, (niveis.get(indicador) as number) + 1)
        restantes.delete(mongoId)
        mudou = true
      }
    }
  }

  // Sobra só acontece se o indicador referenciado não está nas chaves do
  // mapa de entrada — não deveria ocorrer dado como a Task 2 constrói o
  // grafo (todo indicador não-nulo é sempre um mongoId canônico, que por
  // sua vez está entre as chaves), mas nível 0 é o fallback seguro caso
  // aconteça, em vez de deixar a pessoa sem nível nenhum.
  for (const mongoId of restantes) {
    niveis.set(mongoId, 0)
  }

  return niveis
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd /Users/renato/Documents/meubd && npx vitest run scripts/importacao-izalci/lib-rede-fase5.test.ts`
Expected: todos os testes passando (10 testes).

- [ ] **Step 5: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/renato/Documents/meubd
git add scripts/importacao-izalci/lib-rede-fase5.ts scripts/importacao-izalci/lib-rede-fase5.test.ts
git commit -m "$(cat <<'EOF'
feat: funções puras da Fase 5 (rede de indicação) da importação Izalci

resolverMongoIdIndicador (aplica a regra dos 2 devs + indicador não-
importado, ambos viram raiz) e calcularNiveis (profundidade iterativa
multi-passe sobre o grafo já resolvido, sem recursão), testados com
Vitest (TDD).
EOF
)"
```

---

### Task 2: Script de importação da rede de indicação

**Files:**
- Create: `scripts/importacao-izalci/importar-rede-fase5.ts`

**Interfaces:**
- Consumes: `resolverMongoIdIndicador`, `calcularNiveis` de `./lib-rede-fase5` (Task 1); `escolherTelefones`, `ehPessoaDummyDoLuar`, `registrarWhatsappUnico`, tipo `TelefoneMongo` de `./lib-pessoas-fase3` (já existem).
- Produces: nada consumido por tasks posteriores (Task 3 só executa este script).

- [ ] **Step 1: Escrever o script**

Criar `scripts/importacao-izalci/importar-rede-fase5.ts`:

```typescript
/**
 * Script pontual: reconstrói VinculoRede a partir de people.created_by_id
 * do MongoDB do Izalci, religando pelo mesmo mapa de whatsapp canônico
 * que a Fase 3 usou implicitamente (ela não preservou nenhum id do Mongo
 * em Pessoa).
 *
 * Uso: npx tsx scripts/importacao-izalci/importar-rede-fase5.ts <slug>
 */
import * as fs from 'fs'
import * as zlib from 'zlib'
import * as path from 'path'
import * as os from 'os'
import { deserialize, ObjectId } from 'bson'
import { PrismaClient } from '../../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import { escolherTelefones, ehPessoaDummyDoLuar, registrarWhatsappUnico, type TelefoneMongo } from './lib-pessoas-fase3'
import { DEV_IDS, resolverMongoIdIndicador, calcularNiveis } from './lib-rede-fase5'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter } as never)

const BACKUP_DIR = '/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod'
const TENANT_IZALCI = '60b7934c0cc64a0004717e9d'
const LOTE = 1000

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

function carregarTelefonesPorPessoa(): Map<string, TelefoneMongo[]> {
  const mapa = new Map<string, TelefoneMongo[]>()
  const iter = iterarDocumentosBson(path.join(BACKUP_DIR, 'phones.bson.gz'))
  for (let r = iter.next(); !r.done; r = iter.next()) {
    const doc = r.value
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

type PessoaCanonica = {
  mongoId: string
  whatsapp: string
  createdById: string | null
}

/**
 * Refaz exatamente o mesmo passo de seleção que importar-pessoas-fase3.ts
 * fez: mesma ordem de iteração, mesmos filtros, mesma função de escolha de
 * telefone. O resultado é o mesmo conjunto de "vencedores" de whatsapp que
 * virou Pessoa na Fase 3 — sem isso não dá pra saber o created_by_id certo
 * de cada Pessoa já importada, porque a Fase 3 não guardou nenhum id do Mongo.
 */
function reconstruirPessoasCanonicas(telefonesPorPessoa: Map<string, TelefoneMongo[]>): PessoaCanonica[] {
  const canonicas: PessoaCanonica[] = []
  const whatsappsUsados = new Set<string>()

  const iter = iterarDocumentosBson(path.join(BACKUP_DIR, 'people.bson.gz'))
  for (let r = iter.next(); !r.done; r = iter.next()) {
    const doc = r.value
    if (idParaString(doc.tenant_id) !== TENANT_IZALCI) continue

    const mongoId = idParaString(doc._id) ?? ''
    const nomeCompleto = `${String(doc.name ?? '').trim()} ${String(doc.surname ?? '').trim()}`.trim()
    const createdById = idParaString(doc.created_by_id)

    if (ehPessoaDummyDoLuar({ createdById, email: typeof doc.email === 'string' ? doc.email : null, nome: nomeCompleto })) {
      continue
    }

    const telefones = telefonesPorPessoa.get(mongoId) ?? []
    const { whatsapp } = escolherTelefones(telefones)
    if (!whatsapp) continue
    if (!registrarWhatsappUnico(whatsappsUsados, whatsapp)) continue

    canonicas.push({ mongoId, whatsapp, createdById })
  }

  return canonicas
}

async function main() {
  const gabineteSlug = process.argv[2]
  if (!gabineteSlug) {
    console.error('Uso: npx tsx scripts/importacao-izalci/importar-rede-fase5.ts <slug-do-gabinete>')
    process.exit(1)
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { slug: gabineteSlug } })
  if (!gabinete) {
    console.error(`Gabinete com slug "${gabineteSlug}" não encontrado.`)
    process.exit(1)
  }
  const gabineteId = gabinete.id
  console.log(`✓ Gabinete: ${gabinete.nome} (${gabineteId})`)

  const telefonesPorPessoa = carregarTelefonesPorPessoa()
  const canonicas = reconstruirPessoasCanonicas(telefonesPorPessoa)
  console.log(`✓ ${canonicas.length} pessoas canônicas reconstruídas do backup (mesmo critério da Fase 3)`)

  const mongoIdsCanonicos = new Set(canonicas.map((c) => c.mongoId))

  const indicadorPorMongoId = new Map<string, string | null>()
  for (const c of canonicas) {
    indicadorPorMongoId.set(c.mongoId, resolverMongoIdIndicador(c.createdById, mongoIdsCanonicos))
  }

  const niveis = calcularNiveis(indicadorPorMongoId)

  const pessoasPostgres = await prisma.pessoa.findMany({
    where: { gabineteId, deletedAt: null },
    select: { id: true, whatsapp: true },
  })
  const pessoaIdPorWhatsapp = new Map(pessoasPostgres.map((p) => [p.whatsapp, p.id]))
  console.log(`✓ ${pessoaIdPorWhatsapp.size} Pessoa carregadas do Postgres`)

  const vinculosExistentes = await prisma.vinculoRede.findMany({
    where: { gabineteId, deletedAt: null },
    select: { pessoaId: true },
  })
  const pessoaIdsComVinculo = new Set(vinculosExistentes.map((v) => v.pessoaId))
  console.log(`✓ ${pessoaIdsComVinculo.size} Pessoa já têm VinculoRede ativa (idempotência)`)

  const whatsappPorMongoId = new Map(canonicas.map((c) => [c.mongoId, c.whatsapp]))

  type LinhaParaCriar = { gabineteId: string; pessoaId: string; indicadoPorId: string | null; nivel: number }
  const lote: LinhaParaCriar[] = []
  const naoResolvidos: { mongoId: string; motivo: string }[] = []
  let raizPorDev = 0
  let raizSemCreatedBy = 0
  let raizPorIndicadorNaoImportado = 0
  let comIndicador = 0
  let criados = 0
  let jaTinhamVinculo = 0

  async function processarLote() {
    if (lote.length === 0) return
    await prisma.vinculoRede.createMany({ data: lote })
    criados += lote.length
    lote.length = 0
  }

  for (const c of canonicas) {
    const pessoaId = pessoaIdPorWhatsapp.get(c.whatsapp)
    if (!pessoaId) {
      naoResolvidos.push({ mongoId: c.mongoId, motivo: `nenhuma Pessoa no Postgres com whatsapp ${c.whatsapp}` })
      continue
    }

    if (pessoaIdsComVinculo.has(pessoaId)) {
      jaTinhamVinculo++
      continue
    }

    const indicadorMongoId = indicadorPorMongoId.get(c.mongoId) ?? null
    let indicadoPorId: string | null = null

    if (indicadorMongoId === null) {
      if (!c.createdById) raizSemCreatedBy++
      else if (DEV_IDS.has(c.createdById)) raizPorDev++
      else raizPorIndicadorNaoImportado++
      indicadoPorId = null
    } else {
      const whatsappIndicador = whatsappPorMongoId.get(indicadorMongoId)
      const pessoaIdIndicador = whatsappIndicador ? pessoaIdPorWhatsapp.get(whatsappIndicador) : undefined
      if (pessoaIdIndicador) {
        indicadoPorId = pessoaIdIndicador
        comIndicador++
      } else {
        // Indicador é canônico (virou Pessoa candidata) mas por algum motivo
        // não achou correspondente ativo no Postgres — trata como raiz e reporta.
        raizPorIndicadorNaoImportado++
        naoResolvidos.push({ mongoId: c.mongoId, motivo: `indicador ${indicadorMongoId} canônico mas sem Pessoa correspondente no Postgres` })
      }
    }

    lote.push({ gabineteId, pessoaId, indicadoPorId, nivel: niveis.get(c.mongoId) ?? 0 })

    if (lote.length >= LOTE) {
      await processarLote()
      console.log(`  ... ${criados} VinculoRede criados`)
    }
  }
  await processarLote()

  console.log(`\n✓ Criados: ${criados}`)
  console.log(`✓ Já tinham VinculoRede (idempotência): ${jaTinhamVinculo}`)
  console.log(`✓ Com indicador resolvido: ${comIndicador}`)
  console.log(`✓ Raiz por apontar pra dev do sistema antigo: ${raizPorDev}`)
  console.log(`✓ Raiz por não ter created_by_id: ${raizSemCreatedBy}`)
  console.log(`✓ Raiz por indicador não-importado: ${raizPorIndicadorNaoImportado}`)
  console.log(`✓ Não resolvidos (sem Pessoa correspondente no Postgres): ${naoResolvidos.length}`)

  const relatorioPath = path.join(os.tmpdir(), `importacao-izalci-fase5-nao-resolvidos-${gabineteSlug}-${Date.now()}.json`)
  fs.writeFileSync(relatorioPath, JSON.stringify(naoResolvidos, null, 2))
  console.log(`✓ Relatório de não resolvidos (fora do repositório): ${relatorioPath}`)

  console.log('\n✅ Importação da rede de indicação da Fase 5 concluída.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd /Users/renato/Documents/meubd
git add scripts/importacao-izalci/importar-rede-fase5.ts
git commit -m "$(cat <<'EOF'
feat: script de importação da rede de indicação da Fase 5 (Izalci)

Reconstrói o conjunto de Pessoa "canônicas" com o mesmo critério de
seleção de whatsapp da Fase 3 (mesma ordem de iteração, mesmas
funções puras reaproveitadas), resolve indicadoPorId via mapa de
whatsapp do Postgres e calcula nivel pelo grafo já resolvido.
Idempotente: pula Pessoa que já tem VinculoRede ativa.
EOF
)"
```

---

### Task 3: Rollout — staging e produção

**Files:** nenhum (só execução).

**Interfaces:** nenhuma — consome o script já commitado na Task 2.

- [ ] **Step 1: Rodar contra staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
npx tsx scripts/importacao-izalci/importar-rede-fase5.ts staging-teste
```

Expected: script roda até o fim sem erro, imprime o resumo (Criados, Com indicador resolvido, Raiz por dev, Raiz por não ter created_by_id, Raiz por indicador não-importado, Não resolvidos).

- [ ] **Step 2: Verificar staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const { rows: [g] } = await client.query('SELECT id FROM \"Gabinete\" WHERE slug = \$1', ['staging-teste'])
  const { rows: [{ count: totalVR }] } = await client.query('SELECT COUNT(*) FROM \"VinculoRede\" vr JOIN \"Pessoa\" p ON p.id = vr.\"pessoaId\" WHERE p.\"gabineteId\" = \$1', [g.id])
  const { rows: [{ count: raizes }] } = await client.query('SELECT COUNT(*) FROM \"VinculoRede\" vr JOIN \"Pessoa\" p ON p.id = vr.\"pessoaId\" WHERE p.\"gabineteId\" = \$1 AND vr.\"indicadoPorId\" IS NULL', [g.id])
  const { rows: [{ maxnivel }] } = await client.query('SELECT MAX(vr.nivel) as maxnivel FROM \"VinculoRede\" vr JOIN \"Pessoa\" p ON p.id = vr.\"pessoaId\" WHERE p.\"gabineteId\" = \$1', [g.id])
  console.log('VinculoRede:', totalVR)
  console.log('Raízes (indicadoPorId null):', raizes)
  console.log('Nível máximo:', maxnivel)
  await client.end()
})
"
```

Expected: `VinculoRede` próximo de 122.725 (total de `Pessoa` do gabinete), podendo ser um pouco menor — `Pessoa` soft-deleted (deixadas de fora da Fase 3 por colisão de whatsapp, ~121 casos) não recebem `VinculoRede`, mesma regra de "toda Pessoa ativa tem uma VinculoRede" já usada pelo app. `Nível máximo` até 8 (mesmo limite encontrado na investigação da spec). Os outros números só precisam ser plausíveis — não há um valor exato esperado.

- [ ] **Step 3: Rodar contra produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
npx tsx scripts/importacao-izalci/importar-rede-fase5.ts izalci
```

Expected: mesma saída de sucesso do Step 1, rodando contra o gabinete IZALCI real.

- [ ] **Step 4: Verificar produção**

Rodar a mesma query do Step 2, trocando o slug pra `izalci` e o ambiente pra `.env.local`. Expected: número de `VinculoRede` igual ao de staging (Step 2) — confirma paridade entre os dois ambientes, mesmo padrão de verificação das fases anteriores.

- [ ] **Step 5: Reportar ao usuário**

Sem commit adicional (Task 3 só executa o script já commitado na Task 2). Confirmar ao usuário: contagem final de `VinculoRede` criados em produção, quantas pessoas viraram raiz e por quê (resumo do relatório, não o arquivo inteiro), e que a Fase 5 está pronta — **última fase do projeto de importação Izalci completa**.
