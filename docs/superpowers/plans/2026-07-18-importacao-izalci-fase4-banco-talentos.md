# Importação Izalci — Fase 4: Banco de Talentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar os 548 `curriculums` do MongoDB do Izalci pra `BancoTalentos` + `BancoTalentosArea` no gabinete IZALCI, religando cada um à `Pessoa` certa (já importada na Fase 3) via WhatsApp recalculado.

**Architecture:** Um script TypeScript único, sem estágio Python (texto livre de `who_indicate`/`observation` pode conter dado pessoal, nunca vai pro git). Decodifica BSON diretamente, resolve `AreaColocacao` já criada na Fase 2 e `Pessoa` já criada na Fase 3 (via `escolherTelefones` reaproveitada da Fase 3), cria os 548 registros um a um (volume pequeno, sem necessidade de lote).

**Tech Stack:** TypeScript via `npx tsx`, pacote `bson` (já instalado na Fase 3), Prisma 7.8 (`adapter-pg`), Vitest.

## Global Constraints

- Tenant Izalci: `"60b7934c0cc64a0004717e9d"` (comparar via `.toHexString()` do `ObjectId`).
- Fonte: `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/{curriculums,tags,phones,people}.bson.gz`.
- **Nenhum arquivo com dado pessoal real é committado** — mesma regra da Fase 3. Relatório de execução fica fora do repositório (`os.tmpdir()`).
- Reaproveitar de `scripts/importacao-izalci/lib-pessoas-fase3.ts` (já existe, não reescrever): `escolherTelefones(telefones: TelefoneMongo[]): TelefonesEscolhidos`, `normalizarNome(s: string): string`, tipo `TelefoneMongo`.
- `tsconfig.json` do projeto não tem `target`/`downlevelIteration` compatível com `for...of` sobre `Generator` nem com spread de `Set` — usar loop manual `for (let r = iter.next(); !r.done; r = iter.next())` e `Array.from(new Set(...))`, mesmo padrão já usado (depois de corrigido) na Fase 3.
- `BancoTalentos.pessoaId` é `@unique` (relação 1:1 com `Pessoa`) — o script precisa checar se a `Pessoa` já tem um `BancoTalentos` antes de criar (idempotência: rodar o script duas vezes contra o mesmo gabinete não deve quebrar, deve pular e reportar).
- `BancoTalentosArea` tem chave composta `@@id([bancoTalentosId, areaColocacaoId])` — os ids de área resolvidos por currículo precisam ser deduplicados antes de criar (mesma classe de bug já encontrada e corrigida na Fase 3 com `PessoaSegmento`, ver `docs/superpowers/plans/2026-07-18-importacao-izalci-fase3-pessoas.md`).
- Sem teste automatizado pra código que toca Mongo/Postgres real — mas a lógica pura (montar `observacao`, resolver e deduplicar `AreaColocacao` ids) ganha teste Vitest de verdade (TDD).

---

### Task 1: Biblioteca de funções puras (TDD)

**Files:**
- Create: `scripts/importacao-izalci/lib-banco-talentos-fase4.ts`
- Test: `scripts/importacao-izalci/lib-banco-talentos-fase4.test.ts`

**Interfaces:**
- Consumes: `normalizarNome` de `./lib-pessoas-fase3` (já existe, Fase 3).
- Produces: `montarObservacao(whoIndicate: string, observation: string): string | null`, `resolverAreaIdsUnicos(roleIds: string[], labelsDeCargo: Map<string, string>, areaIdPorNome: Map<string, string>): string[]` — a Task 2 usa essas assinaturas exatas.

- [ ] **Step 1: Escrever os testes que hoje falham**

Criar `scripts/importacao-izalci/lib-banco-talentos-fase4.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { montarObservacao, resolverAreaIdsUnicos } from './lib-banco-talentos-fase4'

describe('montarObservacao', () => {
  it('ambos vazios retorna null', () => {
    expect(montarObservacao('', '')).toBeNull()
  })

  it('só whoIndicate preenchido', () => {
    expect(montarObservacao('Indicado por João', '')).toBe('Indicado por João')
  })

  it('só observation preenchido', () => {
    expect(montarObservacao('', 'Currículo em análise')).toBe('Currículo em análise')
  })

  it('ambos preenchidos concatenam com separador', () => {
    expect(montarObservacao('Indicado por João', 'Currículo em análise')).toBe('Indicado por João; Currículo em análise')
  })

  it('espaços nas pontas são removidos antes de decidir se está vazio', () => {
    expect(montarObservacao('   ', '  ')).toBeNull()
    expect(montarObservacao('  Indicado  ', '')).toBe('Indicado')
  })
})

describe('resolverAreaIdsUnicos', () => {
  it('sem roleIds retorna vazio', () => {
    expect(resolverAreaIdsUnicos([], new Map(), new Map())).toEqual([])
  })

  it('resolve role -> label -> id da área', () => {
    const labelsDeCargo = new Map([['role1', 'Atendente']])
    const areaIdPorNome = new Map([['atendente', 'area-1']])
    expect(resolverAreaIdsUnicos(['role1'], labelsDeCargo, areaIdPorNome)).toEqual(['area-1'])
  })

  it('role sem label conhecida é ignorada', () => {
    const labelsDeCargo = new Map<string, string>()
    const areaIdPorNome = new Map([['atendente', 'area-1']])
    expect(resolverAreaIdsUnicos(['role-desconhecida'], labelsDeCargo, areaIdPorNome)).toEqual([])
  })

  it('label sem área correspondente no catálogo é ignorada', () => {
    const labelsDeCargo = new Map([['role1', 'Cargo Inexistente']])
    const areaIdPorNome = new Map([['atendente', 'area-1']])
    expect(resolverAreaIdsUnicos(['role1'], labelsDeCargo, areaIdPorNome)).toEqual([])
  })

  it('duas roles diferentes resolvendo pro mesmo id de área são deduplicadas', () => {
    const labelsDeCargo = new Map([
      ['role1', 'Atendente'],
      ['role2', 'ATENDENTE'],
    ])
    const areaIdPorNome = new Map([['atendente', 'area-1']])
    expect(resolverAreaIdsUnicos(['role1', 'role2'], labelsDeCargo, areaIdPorNome)).toEqual(['area-1'])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd /Users/renato/Documents/meubd && npx vitest run scripts/importacao-izalci/lib-banco-talentos-fase4.test.ts`
Expected: FAIL — `Cannot find module './lib-banco-talentos-fase4'`.

- [ ] **Step 3: Implementar `lib-banco-talentos-fase4.ts`**

Criar `scripts/importacao-izalci/lib-banco-talentos-fase4.ts`:

```typescript
import { normalizarNome } from './lib-pessoas-fase3'

export function montarObservacao(whoIndicate: string, observation: string): string | null {
  const partes = [whoIndicate.trim(), observation.trim()].filter((s) => s.length > 0)
  if (partes.length === 0) return null
  return partes.join('; ')
}

export function resolverAreaIdsUnicos(
  roleIds: string[],
  labelsDeCargo: Map<string, string>,
  areaIdPorNome: Map<string, string>
): string[] {
  const resolvidos = roleIds
    .map((id) => labelsDeCargo.get(id))
    .filter((label): label is string => !!label)
    .map((label) => areaIdPorNome.get(normalizarNome(label)))
    .filter((id): id is string => !!id)
  return Array.from(new Set(resolvidos))
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd /Users/renato/Documents/meubd && npx vitest run scripts/importacao-izalci/lib-banco-talentos-fase4.test.ts`
Expected: todos os testes passando (10 testes).

- [ ] **Step 5: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/renato/Documents/meubd
git add scripts/importacao-izalci/lib-banco-talentos-fase4.ts scripts/importacao-izalci/lib-banco-talentos-fase4.test.ts
git commit -m "$(cat <<'EOF'
feat: funções puras da Fase 4 (Banco de Talentos) da importação Izalci

montarObservacao (concatena who_indicate + observation com separador,
null se ambos vazios) e resolverAreaIdsUnicos (resolve role -> label ->
AreaColocacao, deduplicando — mesma classe de bug de PessoaSegmento já
corrigida na Fase 3), testados com Vitest (TDD).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Script de importação (BSON + Mongo + Postgres)

**Files:**
- Create: `scripts/importacao-izalci/importar-banco-talentos-fase4.ts`

**Interfaces:**
- Consumes: `montarObservacao`, `resolverAreaIdsUnicos` de `./lib-banco-talentos-fase4` (Task 1); `escolherTelefones`, `normalizarNome`, tipo `TelefoneMongo` de `./lib-pessoas-fase3` (Fase 3, já existe).
- Produces: nada consumido por outra task — a Task 3 só executa este script.

- [ ] **Step 1: Criar o script**

Criar `scripts/importacao-izalci/importar-banco-talentos-fase4.ts`:

```typescript
/**
 * Script pontual: importa BancoTalentos + BancoTalentosArea da coleção
 * curriculums do MongoDB do Izalci pra um gabinete do Rede Mobiliza,
 * religando pessoaId pelo whatsapp recalculado (a Fase 3 não preservou
 * nenhum id do Mongo em Pessoa).
 *
 * Uso: npx tsx scripts/importacao-izalci/importar-banco-talentos-fase4.ts <slug>
 */
import * as fs from 'fs'
import * as zlib from 'zlib'
import * as path from 'path'
import * as os from 'os'
import { deserialize, ObjectId } from 'bson'
import { PrismaClient } from '../../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import { escolherTelefones, normalizarNome, type TelefoneMongo } from './lib-pessoas-fase3'
import { montarObservacao, resolverAreaIdsUnicos } from './lib-banco-talentos-fase4'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter } as never)

const BACKUP_DIR = '/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod'
const TENANT_IZALCI = '60b7934c0cc64a0004717e9d'

function* iterarDocumentosBsonGen(caminhoGz: string): Generator<Record<string, unknown>> {
  const buffer = zlib.gunzipSync(fs.readFileSync(caminhoGz))
  let offset = 0
  while (offset < buffer.length) {
    const tamanho = buffer.readInt32LE(offset)
    const docBuffer = buffer.subarray(offset, offset + tamanho)
    yield deserialize(docBuffer) as Record<string, unknown>
    offset += tamanho
  }
}

function paraCadaDocumento(caminhoGz: string, callback: (doc: Record<string, unknown>) => void): void {
  const iter = iterarDocumentosBsonGen(caminhoGz)
  for (let r = iter.next(); !r.done; r = iter.next()) {
    callback(r.value)
  }
}

function idParaString(v: unknown): string | null {
  if (v instanceof ObjectId) return v.toHexString()
  if (typeof v === 'string') return v
  return null
}

type Curriculum = {
  id: string
  personId: string
  whoIndicate: string
  observation: string
  priority: number
  hasDisability: boolean
  foundJob: boolean
  employmentRoleIds: string[]
}

function carregarCurriculums(): Curriculum[] {
  const lista: Curriculum[] = []
  paraCadaDocumento(path.join(BACKUP_DIR, 'curriculums.bson.gz'), (doc) => {
    const id = idParaString(doc._id)
    const personId = idParaString(doc.person_id)
    if (!id || !personId) return
    const roleIdsBrutos = Array.isArray(doc.employment_role_ids) ? doc.employment_role_ids : []
    const roleIds = roleIdsBrutos.map(idParaString).filter((v): v is string => v !== null)
    lista.push({
      id,
      personId,
      whoIndicate: typeof doc.who_indicate === 'string' ? doc.who_indicate : '',
      observation: typeof doc.observation === 'string' ? doc.observation : '',
      priority: typeof doc.priority === 'number' ? doc.priority : 3,
      hasDisability: doc.has_disability === true,
      foundJob: doc.found_job === true,
      employmentRoleIds: roleIds,
    })
  })
  return lista
}

function carregarLabelsDeTags(idsRelevantes: Set<string>): Map<string, string> {
  const mapa = new Map<string, string>()
  paraCadaDocumento(path.join(BACKUP_DIR, 'tags.bson.gz'), (doc) => {
    if (idParaString(doc.tenant_id) !== TENANT_IZALCI) return
    const id = idParaString(doc._id)
    if (!id || !idsRelevantes.has(id)) return
    mapa.set(id, String(doc.label ?? ''))
  })
  return mapa
}

function carregarTelefonesPorPessoa(idsRelevantes: Set<string>): Map<string, TelefoneMongo[]> {
  const mapa = new Map<string, TelefoneMongo[]>()
  paraCadaDocumento(path.join(BACKUP_DIR, 'phones.bson.gz'), (doc) => {
    const personId = idParaString(doc.person_id)
    const id = idParaString(doc._id)
    if (!personId || !id || !idsRelevantes.has(personId)) return
    const tipo = doc.type === 'cellphone' ? 'cellphone' : 'landline'
    const lista = mapa.get(personId) ?? []
    lista.push({ id, tipo, numeroCru: String(doc.number ?? '') })
    mapa.set(personId, lista)
  })
  return mapa
}

function calcularWhatsappPorPessoa(idsRelevantes: Set<string>, telefonesPorPessoa: Map<string, TelefoneMongo[]>): Map<string, string> {
  const mapa = new Map<string, string>()
  paraCadaDocumento(path.join(BACKUP_DIR, 'people.bson.gz'), (doc) => {
    const id = idParaString(doc._id)
    if (!id || !idsRelevantes.has(id)) return
    const telefones = telefonesPorPessoa.get(id) ?? []
    const { whatsapp } = escolherTelefones(telefones)
    if (whatsapp) mapa.set(id, whatsapp)
  })
  return mapa
}

async function main() {
  const gabineteSlug = process.argv[2]
  if (!gabineteSlug) {
    console.error('Uso: npx tsx scripts/importacao-izalci/importar-banco-talentos-fase4.ts <slug-do-gabinete>')
    process.exit(1)
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { slug: gabineteSlug } })
  if (!gabinete) {
    console.error(`Gabinete com slug "${gabineteSlug}" não encontrado.`)
    process.exit(1)
  }
  const gabineteId = gabinete.id
  console.log(`✓ Gabinete: ${gabinete.nome} (${gabineteId})`)

  const curriculums = carregarCurriculums()
  console.log(`✓ ${curriculums.length} curriculums carregados do backup`)

  const personIds = new Set(curriculums.map((c) => c.personId))
  const roleIds = new Set(curriculums.flatMap((c) => c.employmentRoleIds))

  const telefonesPorPessoa = carregarTelefonesPorPessoa(personIds)
  const whatsappPorPessoa = calcularWhatsappPorPessoa(personIds, telefonesPorPessoa)
  console.log(`✓ ${whatsappPorPessoa.size} de ${personIds.size} pessoas têm whatsapp calculável`)

  const labelsDeCargo = carregarLabelsDeTags(roleIds)
  console.log(`✓ ${labelsDeCargo.size} tags de EmploymentRole resolvidas`)

  const areasColocacao = await prisma.areaColocacao.findMany({
    where: { gabineteId },
    select: { id: true, nome: true },
  })
  const areaIdPorNome = new Map(areasColocacao.map((a) => [normalizarNome(a.nome), a.id]))
  console.log(`✓ ${areaIdPorNome.size} AreaColocacao carregadas do Postgres`)

  const naoVinculados: { curriculumId: string; personId: string; motivo: string }[] = []
  let criados = 0

  for (const curriculum of curriculums) {
    const whatsapp = whatsappPorPessoa.get(curriculum.personId)
    if (!whatsapp) {
      naoVinculados.push({ curriculumId: curriculum.id, personId: curriculum.personId, motivo: 'pessoa sem whatsapp válido (não importada na Fase 3)' })
      continue
    }

    const pessoa = await prisma.pessoa.findFirst({
      where: { gabineteId, whatsapp, deletedAt: null },
      select: { id: true },
    })
    if (!pessoa) {
      naoVinculados.push({ curriculumId: curriculum.id, personId: curriculum.personId, motivo: `nenhuma Pessoa ativa com whatsapp ${whatsapp}` })
      continue
    }

    const existente = await prisma.bancoTalentos.findUnique({ where: { pessoaId: pessoa.id } })
    if (existente) {
      naoVinculados.push({ curriculumId: curriculum.id, personId: curriculum.personId, motivo: `Pessoa ${pessoa.id} já tem BancoTalentos` })
      continue
    }

    const areaIds = resolverAreaIdsUnicos(curriculum.employmentRoleIds, labelsDeCargo, areaIdPorNome)

    const bancoTalentos = await prisma.bancoTalentos.create({
      data: {
        pessoaId: pessoa.id,
        prioridade: curriculum.priority,
        isPcd: curriculum.hasDisability,
        colocado: curriculum.foundJob,
        observacao: montarObservacao(curriculum.whoIndicate, curriculum.observation),
      },
    })

    if (areaIds.length > 0) {
      await prisma.bancoTalentosArea.createMany({
        data: areaIds.map((areaColocacaoId) => ({ bancoTalentosId: bancoTalentos.id, areaColocacaoId })),
      })
    }

    criados++
  }

  console.log(`\n✓ Criados: ${criados}`)
  console.log(`✓ Não vinculados: ${naoVinculados.length}`)

  const relatorioPath = path.join(os.tmpdir(), `importacao-izalci-fase4-nao-vinculados-${gabineteSlug}-${Date.now()}.json`)
  fs.writeFileSync(relatorioPath, JSON.stringify(naoVinculados, null, 2))
  console.log(`✓ Relatório de não vinculados (fora do repositório): ${relatorioPath}`)

  console.log('\n✅ Importação de Banco de Talentos da Fase 4 concluída.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Checar tipos**

```bash
cd /Users/renato/Documents/meubd
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd /Users/renato/Documents/meubd
git add scripts/importacao-izalci/importar-banco-talentos-fase4.ts
git commit -m "$(cat <<'EOF'
feat: script de importação de Banco de Talentos da Fase 4 (Izalci)

Lê curriculums/tags/phones/people.bson.gz diretamente, religa cada
currículo à Pessoa certa recalculando o whatsapp (reaproveitando
escolherTelefones da Fase 3, já que Pessoa não guarda nenhum id do
Mongo), resolve AreaColocacao já criada na Fase 2, e cria BancoTalentos
+ BancoTalentosArea um a um (548 registros, sem necessidade de lote).
Idempotente: pula e reporta Pessoa que já tem BancoTalentos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rollout — staging, depois produção

**Files:**
- Nenhum arquivo novo — só execução do script da Task 2 contra bancos reais.

**Interfaces:**
- Consumes: `scripts/importacao-izalci/importar-banco-talentos-fase4.ts` (Task 2).
- Produces: nada — última task da Fase 4.

- [ ] **Step 1: Rodar contra staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
npx tsx scripts/importacao-izalci/importar-banco-talentos-fase4.ts staging-teste
```

Expected: termina em `✅ Importação de Banco de Talentos da Fase 4 concluída.`, sem `Error`. `Criados` deve ficar perto de 543 (548 curriculums menos os ~5 sem pessoa com whatsapp válido, confirmado na investigação do spec — pode variar um pouco se alguma dessas ~5 pessoas ainda assim tiver sido importada por outro motivo, ou se alguma das 543 esperadas colidir com outra causa de "não vinculado").

- [ ] **Step 2: Verificar staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const { rows: [g] } = await client.query('SELECT id FROM \"Gabinete\" WHERE slug = \$1', ['staging-teste'])
  const { rows: [{ count: totalBT }] } = await client.query('SELECT COUNT(*) FROM \"BancoTalentos\" bt JOIN \"Pessoa\" p ON p.id = bt.\"pessoaId\" WHERE p.\"gabineteId\" = \$1', [g.id])
  const { rows: [{ count: comArea }] } = await client.query('SELECT COUNT(DISTINCT bta.\"bancoTalentosId\") FROM \"BancoTalentosArea\" bta JOIN \"BancoTalentos\" bt ON bt.id = bta.\"bancoTalentosId\" JOIN \"Pessoa\" p ON p.id = bt.\"pessoaId\" WHERE p.\"gabineteId\" = \$1', [g.id])
  const { rows: [{ count: pcd }] } = await client.query('SELECT COUNT(*) FROM \"BancoTalentos\" bt JOIN \"Pessoa\" p ON p.id = bt.\"pessoaId\" WHERE p.\"gabineteId\" = \$1 AND bt.\"isPcd\" = true', [g.id])
  console.log('BancoTalentos:', totalBT)
  console.log('Com pelo menos 1 AreaColocacao:', comArea)
  console.log('isPcd = true:', pcd)
  await client.end()
})
"
```

Expected: `BancoTalentos` perto de 543. Os outros dois números só precisam ser plausíveis (maiores que zero, sem erro de query) — não há um valor exato esperado no spec pra eles.

- [ ] **Step 3: Rodar contra produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
npx tsx scripts/importacao-izalci/importar-banco-talentos-fase4.ts izalci
```

Expected: mesma saída de sucesso do Step 1, rodando contra o gabinete IZALCI real.

- [ ] **Step 4: Verificar produção**

Rodar a mesma query do Step 2, trocando o slug pra `izalci` e o ambiente pra `.env.local`. Expected: número de `BancoTalentos` igual ao de staging (Step 2) — confirma paridade entre os dois ambientes, mesmo padrão de verificação das fases anteriores.

- [ ] **Step 5: Reportar ao usuário**

Sem commit adicional (Task 3 só executa o script já commitado na Task 2). Confirmar ao usuário: contagem final de `BancoTalentos` criados em produção, quantos currículos não foram vinculados e por quê (resumo do relatório, não o arquivo inteiro), e que a Fase 4 está pronta — falta só a Fase 5 (rede de indicação) pra completar a importação inteira.
