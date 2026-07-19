# Importação Izalci — Fase 6: Recuperação de Arquivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperar os arquivos reais de currículo (`BancoTalentos.curriculoUrl`) e foto (`Pessoa.fotoUrl`) do tenant Izalci a partir do GridFS "cache" do MongoDB Atlas ao vivo, subir pro Supabase Storage e religar aos registros já importados.

**Architecture:** Um único script (`recuperar-arquivos-fase6.ts`) cobrindo fotos e currículos juntos, já que ambos dependem do mesmo passo de reconstrução do mapa `whatsapp → mongoId canônico` (mesmo algoritmo da Fase 5). Conecta ao MongoDB Atlas ao vivo (driver `mongodb`, GridFS) só pra baixar o binário de cada arquivo; toda a metadata (`people`, `phones`, `curriculums`) continua vindo do backup estático já usado nas Fases 1-5. Fotos maiores que 5MB são comprimidas com `sharp` antes do upload.

**Tech Stack:** TypeScript via `npx tsx`, pacotes `mongodb` (driver ao vivo), `sharp` (compressão de imagem), `file-type` (detecção de tipo por assinatura de bytes), `bson` (já instalado, decodifica o backup estático), Prisma 7.8 (`adapter-pg`), Supabase Storage, Vitest.

## Global Constraints

- Tenant Izalci: `"60b7934c0cc64a0004717e9d"` (comparar via `.toHexString()` do `ObjectId` do pacote `bson`).
- Fonte estática: `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/{people,phones,curriculums}.bson.gz` — mesma de sempre, sem mudança.
- Fonte ao vivo: MongoDB Atlas, banco `meubancodedadosprod`, bucket GridFS `temp` (coleções `temp.files`/`temp.chunks`) — connection string em `process.env.MONGO_ATLAS_URI_LEGADO`, **nunca em nenhum arquivo commitado** (só em `.env.local`/`.env.staging`, já gitignored).
- Reaproveitar de `scripts/importacao-izalci/lib-pessoas-fase3.ts` (não reescrever): `escolherTelefones(telefones: TelefoneMongo[]): TelefonesEscolhidos`, `ehPessoaDummyDoLuar(pessoa: { createdById: string | null; email: string | null; nome: string }): boolean`, `registrarWhatsappUnico(usados: Set<string>, numero: string): boolean`, tipo `TelefoneMongo`.
- Reprocessar `people.bson.gz` na **mesma ordem e com os mesmos filtros** de `importar-pessoas-fase3.ts`/`importar-rede-fase5.ts` (tenant Izalci, excluir dummy do Luar, `escolherTelefones`, `registrarWhatsappUnico`) — mesma técnica de reconstrução do mapa `whatsapp → mongoId canônico` das Fases 5.
- `tsconfig.json` do projeto não tem `downlevelIteration` — usar loop manual `for (let r = iter.next(); !r.done; r = iter.next())` sobre `Generator`, mesmo padrão das fases anteriores. Iterar sempre sobre arrays (`canonicas`, `curriculums`), nunca diretamente sobre `Map`/`Set`.
- Bucket do Supabase Storage: `gabinete-assets`. Caminho de foto: `{gabineteId}/pessoas/{pessoaId}/foto.{ext}` (mesmo padrão de `src/actions/admin/upload-foto-pessoa.ts`). Caminho de currículo: `{gabineteId}/pessoas/{pessoaId}/curriculo.{ext}` (mesmo padrão de `src/actions/admin/salvar-banco-talentos.ts`).
- `Pessoa.fotoUrl` recebe `{publicUrl}?v={Date.now()}` (cache-busting, igual ao upload manual). `BancoTalentos.curriculoUrl` recebe o `publicUrl` puro, sem sufixo.
- Extensões de foto permitidas (mesmo mapa de `src/lib/validar-imagem-upload.ts`): `jpg` (`image/jpeg`), `png` (`image/png`), `webp` (`image/webp`), `gif` (`image/gif`).
- Extensões de currículo permitidas (mesmo mapa de `src/actions/admin/salvar-banco-talentos.ts`): `pdf` (`application/pdf`), `doc` (`application/msword`), `docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`), `jpg` (`image/jpeg`), `png` (`image/png`).
- Foto com tamanho original maior que `5 * 1024 * 1024` bytes é comprimida: redimensionar pro maior lado ter no máximo 1600px (`fit: 'inside', withoutEnlargement: true`), reencodar como JPEG qualidade 82. Currículos nunca são comprimidos.
- Idempotência: pular `Pessoa`/`BancoTalentos` que já tenham `fotoUrl`/`curriculoUrl` preenchido.
- Sem teste automatizado pra código que toca Mongo/Postgres/Supabase Storage real — mas as funções puras (montar caminho de storage, decidir compressão pelo tamanho) ganham teste Vitest de verdade (TDD).
- **Passo final do rollout (Task 3), obrigatório**: revogar o acesso temporário ao Atlas (remover liberação de rede `0.0.0.0/0`, apagar ou trocar a senha do usuário `meubancodedados`).

---

### Task 1: Biblioteca de funções puras (TDD)

**Files:**
- Create: `scripts/importacao-izalci/lib-arquivos-fase6.ts`
- Test: `scripts/importacao-izalci/lib-arquivos-fase6.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `montarCaminhoFoto(gabineteId: string, pessoaId: string, ext: string): string`, `montarCaminhoCurriculo(gabineteId: string, pessoaId: string, ext: string): string`, `precisaComprimir(tamanhoBytes: number, limiteBytes: number): boolean` — a Task 2 usa esses nomes e assinaturas exatas.

- [ ] **Step 1: Escrever os testes que hoje falham**

Criar `scripts/importacao-izalci/lib-arquivos-fase6.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { montarCaminhoFoto, montarCaminhoCurriculo, precisaComprimir } from './lib-arquivos-fase6'

describe('montarCaminhoFoto', () => {
  it('monta o caminho no mesmo padrão usado por uploadFotoPessoa', () => {
    expect(montarCaminhoFoto('gabinete-1', 'pessoa-1', 'jpg')).toBe('gabinete-1/pessoas/pessoa-1/foto.jpg')
  })

  it('usa a extensão passada, sem normalizar', () => {
    expect(montarCaminhoFoto('gabinete-1', 'pessoa-1', 'png')).toBe('gabinete-1/pessoas/pessoa-1/foto.png')
  })
})

describe('montarCaminhoCurriculo', () => {
  it('monta o caminho no mesmo padrão usado por salvarBancoTalentos', () => {
    expect(montarCaminhoCurriculo('gabinete-1', 'pessoa-1', 'pdf')).toBe('gabinete-1/pessoas/pessoa-1/curriculo.pdf')
  })

  it('usa a extensão passada, sem normalizar', () => {
    expect(montarCaminhoCurriculo('gabinete-1', 'pessoa-1', 'docx')).toBe('gabinete-1/pessoas/pessoa-1/curriculo.docx')
  })
})

describe('precisaComprimir', () => {
  it('abaixo do limite não precisa comprimir', () => {
    expect(precisaComprimir(1000, 5000)).toBe(false)
  })

  it('exatamente no limite não precisa comprimir', () => {
    expect(precisaComprimir(5000, 5000)).toBe(false)
  })

  it('acima do limite precisa comprimir', () => {
    expect(precisaComprimir(5001, 5000)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd /Users/renato/Documents/meubd && npx vitest run scripts/importacao-izalci/lib-arquivos-fase6.test.ts`
Expected: FAIL — `Cannot find module './lib-arquivos-fase6'`.

- [ ] **Step 3: Implementar `lib-arquivos-fase6.ts`**

Criar `scripts/importacao-izalci/lib-arquivos-fase6.ts`:

```typescript
export function montarCaminhoFoto(gabineteId: string, pessoaId: string, ext: string): string {
  return `${gabineteId}/pessoas/${pessoaId}/foto.${ext}`
}

export function montarCaminhoCurriculo(gabineteId: string, pessoaId: string, ext: string): string {
  return `${gabineteId}/pessoas/${pessoaId}/curriculo.${ext}`
}

export function precisaComprimir(tamanhoBytes: number, limiteBytes: number): boolean {
  return tamanhoBytes > limiteBytes
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd /Users/renato/Documents/meubd && npx vitest run scripts/importacao-izalci/lib-arquivos-fase6.test.ts`
Expected: todos os testes passando (7 testes).

- [ ] **Step 5: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/renato/Documents/meubd
git add scripts/importacao-izalci/lib-arquivos-fase6.ts scripts/importacao-izalci/lib-arquivos-fase6.test.ts
git commit -m "$(cat <<'EOF'
feat: funções puras da Fase 6 (recuperação de arquivos) da importação Izalci

montarCaminhoFoto/montarCaminhoCurriculo (mesmo padrão de caminho já
usado pelo app em upload-foto-pessoa.ts/salvar-banco-talentos.ts) e
precisaComprimir (decide compressão de foto pelo tamanho), testados
com Vitest (TDD).
EOF
)"
```

---

### Task 2: Script de recuperação de arquivos

**Files:**
- Create: `scripts/importacao-izalci/recuperar-arquivos-fase6.ts`

**Interfaces:**
- Consumes: `montarCaminhoFoto`, `montarCaminhoCurriculo`, `precisaComprimir` de `./lib-arquivos-fase6` (Task 1); `escolherTelefones`, `ehPessoaDummyDoLuar`, `registrarWhatsappUnico`, tipo `TelefoneMongo` de `./lib-pessoas-fase3` (já existem); `getSupabaseAdmin` de `../../src/lib/supabase/admin` (já existe).
- Produces: nada consumido por tasks posteriores (Task 3 só executa este script).

- [ ] **Step 1: Instalar as novas dependências**

```bash
cd /Users/renato/Documents/meubd
npm install --save-dev mongodb sharp file-type
```

- [ ] **Step 2: Escrever o script**

Criar `scripts/importacao-izalci/recuperar-arquivos-fase6.ts`:

```typescript
/**
 * Script pontual: recupera os arquivos reais de currículo e foto do tenant
 * Izalci, armazenados no GridFS "cache" do MongoDB Atlas ao vivo (coleções
 * temp.files/temp.chunks — fora do backup estático usado nas Fases 1-5),
 * sobe pro Supabase Storage e religa Pessoa.fotoUrl / BancoTalentos.curriculoUrl.
 *
 * Uso: npx tsx scripts/importacao-izalci/recuperar-arquivos-fase6.ts <slug>
 */
import * as fs from 'fs'
import * as zlib from 'zlib'
import * as path from 'path'
import * as os from 'os'
import { deserialize, ObjectId as BsonObjectId } from 'bson'
import { MongoClient, GridFSBucket, ObjectId } from 'mongodb'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'
import { PrismaClient } from '../../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import { getSupabaseAdmin } from '../../src/lib/supabase/admin'
import { escolherTelefones, ehPessoaDummyDoLuar, registrarWhatsappUnico, type TelefoneMongo } from './lib-pessoas-fase3'
import { montarCaminhoFoto, montarCaminhoCurriculo, precisaComprimir } from './lib-arquivos-fase6'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter } as never)

const BACKUP_DIR = '/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod'
const TENANT_IZALCI = '60b7934c0cc64a0004717e9d'
const LIMITE_FOTO_BYTES = 5 * 1024 * 1024
const LADO_MAXIMO_FOTO_COMPRIMIDA = 1600
const QUALIDADE_JPEG_COMPRIMIDA = 82

const EXTENSOES_FOTO_PERMITIDAS: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}
const EXTENSOES_CURRICULO_PERMITIDAS: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  png: 'image/png',
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
  if (v instanceof BsonObjectId) return v.toHexString()
  if (typeof v === 'string') return v
  return null
}

function extrairGridfsId(campoJson: unknown): string | null {
  if (typeof campoJson !== 'string' || !campoJson) return null
  try {
    const j = JSON.parse(campoJson) as { id?: string }
    if (!j.id) return null
    return j.id.includes('.') ? j.id.slice(0, j.id.lastIndexOf('.')) : j.id
  } catch {
    return null
  }
}

function extrairNomeArquivo(campoJson: unknown): string | null {
  if (typeof campoJson !== 'string' || !campoJson) return null
  try {
    const j = JSON.parse(campoJson) as { metadata?: { filename?: string } }
    return j.metadata?.filename ?? null
  } catch {
    return null
  }
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
  photoData: string | null
}

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

    canonicas.push({
      mongoId,
      whatsapp,
      photoData: typeof doc.photo_data === 'string' ? doc.photo_data : null,
    })
  }

  return canonicas
}

type Curriculo = {
  personId: string
  fileData: string
}

function carregarCurriculums(): Curriculo[] {
  const lista: Curriculo[] = []
  const iter = iterarDocumentosBson(path.join(BACKUP_DIR, 'curriculums.bson.gz'))
  for (let r = iter.next(); !r.done; r = iter.next()) {
    const doc = r.value
    const personId = idParaString(doc.person_id)
    const fileData = typeof doc.curriculum_file_data === 'string' ? doc.curriculum_file_data : null
    if (!personId || !fileData) continue
    lista.push({ personId, fileData })
  }
  return lista
}

function baixarArquivoGridFS(bucket: GridFSBucket, id: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = bucket.openDownloadStream(new ObjectId(id))
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

async function detectarExtensao(
  buffer: Buffer,
  nomeArquivoOriginal: string | null,
  extensoesPermitidas: Record<string, string>
): Promise<string | null> {
  const detectado = await fileTypeFromBuffer(buffer)
  if (detectado && detectado.ext in extensoesPermitidas) return detectado.ext

  if (nomeArquivoOriginal) {
    const extDoNome = nomeArquivoOriginal.includes('.')
      ? nomeArquivoOriginal.slice(nomeArquivoOriginal.lastIndexOf('.') + 1).toLowerCase()
      : ''
    if (extDoNome in extensoesPermitidas) return extDoNome
  }

  return null
}

async function processarFoto(buffer: Buffer, ext: string): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  if (!precisaComprimir(buffer.length, LIMITE_FOTO_BYTES)) {
    return { buffer, ext, contentType: EXTENSOES_FOTO_PERMITIDAS[ext] }
  }
  const comprimido = await sharp(buffer)
    .resize(LADO_MAXIMO_FOTO_COMPRIMIDA, LADO_MAXIMO_FOTO_COMPRIMIDA, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALIDADE_JPEG_COMPRIMIDA })
    .toBuffer()
  return { buffer: comprimido, ext: 'jpg', contentType: 'image/jpeg' }
}

async function main() {
  const gabineteSlug = process.argv[2]
  if (!gabineteSlug) {
    console.error('Uso: npx tsx scripts/importacao-izalci/recuperar-arquivos-fase6.ts <slug-do-gabinete>')
    process.exit(1)
  }

  const mongoAtlasUri = process.env.MONGO_ATLAS_URI_LEGADO
  if (!mongoAtlasUri) {
    console.error('Variável de ambiente MONGO_ATLAS_URI_LEGADO não definida em .env.local')
    process.exit(1)
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { slug: gabineteSlug } })
  if (!gabinete) {
    console.error(`Gabinete com slug "${gabineteSlug}" não encontrado.`)
    process.exit(1)
  }
  const gabineteId = gabinete.id
  console.log(`✓ Gabinete: ${gabinete.nome} (${gabineteId})`)

  const mongoClient = new MongoClient(mongoAtlasUri)
  await mongoClient.connect()
  const db = mongoClient.db('meubancodedadosprod')
  const bucket = new GridFSBucket(db, { bucketName: 'temp' })
  console.log('✓ Conectado ao MongoDB Atlas (banco meubancodedadosprod)')

  const telefonesPorPessoa = carregarTelefonesPorPessoa()
  const canonicas = reconstruirPessoasCanonicas(telefonesPorPessoa)
  console.log(`✓ ${canonicas.length} pessoas canônicas reconstruídas do backup (mesmo critério da Fase 3)`)

  const whatsappPorMongoId = new Map(canonicas.map((c) => [c.mongoId, c.whatsapp]))

  const pessoasPostgres = await prisma.pessoa.findMany({
    where: { gabineteId, deletedAt: null },
    select: { id: true, whatsapp: true, fotoUrl: true },
  })
  const pessoaPorWhatsapp = new Map(pessoasPostgres.map((p) => [p.whatsapp, p]))
  console.log(`✓ ${pessoaPorWhatsapp.size} Pessoa carregadas do Postgres`)

  const bancoTalentosPostgres = await prisma.bancoTalentos.findMany({
    where: { pessoa: { gabineteId, deletedAt: null } },
    select: { id: true, pessoaId: true, curriculoUrl: true },
  })
  const bancoTalentosPorPessoaId = new Map(bancoTalentosPostgres.map((b) => [b.pessoaId, b]))
  console.log(`✓ ${bancoTalentosPorPessoaId.size} BancoTalentos carregados do Postgres`)

  const naoResolvidos: { tipo: 'foto' | 'curriculo'; mongoId: string; motivo: string }[] = []
  let fotosCriadas = 0
  let fotosJaTinham = 0
  let curriculosCriados = 0
  let curriculosJaTinham = 0

  console.log('\n--- Fotos ---')
  for (const c of canonicas) {
    if (!c.photoData) continue

    const pessoa = pessoaPorWhatsapp.get(c.whatsapp)
    if (!pessoa) {
      naoResolvidos.push({ tipo: 'foto', mongoId: c.mongoId, motivo: `nenhuma Pessoa no Postgres com whatsapp ${c.whatsapp}` })
      continue
    }
    if (pessoa.fotoUrl) {
      fotosJaTinham++
      continue
    }

    const gridfsId = extrairGridfsId(c.photoData)
    if (!gridfsId) {
      naoResolvidos.push({ tipo: 'foto', mongoId: c.mongoId, motivo: 'photo_data sem id de GridFS válido' })
      continue
    }

    let bufferOriginal: Buffer
    try {
      bufferOriginal = await baixarArquivoGridFS(bucket, gridfsId)
    } catch (e) {
      naoResolvidos.push({ tipo: 'foto', mongoId: c.mongoId, motivo: `falha ao baixar do GridFS: ${(e as Error).message}` })
      continue
    }

    const nomeArquivo = extrairNomeArquivo(c.photoData)
    const extDetectada = await detectarExtensao(bufferOriginal, nomeArquivo, EXTENSOES_FOTO_PERMITIDAS)
    if (!extDetectada) {
      naoResolvidos.push({ tipo: 'foto', mongoId: c.mongoId, motivo: 'tipo de arquivo não suportado (nem JPEG, PNG, WebP ou GIF)' })
      continue
    }

    const { buffer: bufferFinal, ext, contentType } = await processarFoto(bufferOriginal, extDetectada)
    const caminho = montarCaminhoFoto(gabineteId, pessoa.id, ext)

    const { error: erroUpload } = await getSupabaseAdmin().storage
      .from('gabinete-assets')
      .upload(caminho, bufferFinal, { upsert: true, contentType })
    if (erroUpload) {
      naoResolvidos.push({ tipo: 'foto', mongoId: c.mongoId, motivo: `falha no upload pro Supabase: ${erroUpload.message}` })
      continue
    }

    const { data: { publicUrl } } = getSupabaseAdmin().storage.from('gabinete-assets').getPublicUrl(caminho)
    await prisma.pessoa.update({ where: { id: pessoa.id }, data: { fotoUrl: `${publicUrl}?v=${Date.now()}` } })
    fotosCriadas++

    if (fotosCriadas % 50 === 0) console.log(`  ... ${fotosCriadas} fotos recuperadas`)
  }

  console.log('\n--- Currículos ---')
  const curriculums = carregarCurriculums()
  console.log(`✓ ${curriculums.length} currículos com arquivo carregados do backup`)

  for (const curriculo of curriculums) {
    const whatsapp = whatsappPorMongoId.get(curriculo.personId)
    if (!whatsapp) {
      naoResolvidos.push({ tipo: 'curriculo', mongoId: curriculo.personId, motivo: 'pessoa não é canônica (não virou Pessoa na Fase 3)' })
      continue
    }

    const pessoa = pessoaPorWhatsapp.get(whatsapp)
    if (!pessoa) {
      naoResolvidos.push({ tipo: 'curriculo', mongoId: curriculo.personId, motivo: `nenhuma Pessoa no Postgres com whatsapp ${whatsapp}` })
      continue
    }

    const bancoTalentos = bancoTalentosPorPessoaId.get(pessoa.id)
    if (!bancoTalentos) {
      naoResolvidos.push({ tipo: 'curriculo', mongoId: curriculo.personId, motivo: `Pessoa ${pessoa.id} não tem BancoTalentos (Fase 4)` })
      continue
    }
    if (bancoTalentos.curriculoUrl) {
      curriculosJaTinham++
      continue
    }

    const gridfsId = extrairGridfsId(curriculo.fileData)
    if (!gridfsId) {
      naoResolvidos.push({ tipo: 'curriculo', mongoId: curriculo.personId, motivo: 'curriculum_file_data sem id de GridFS válido' })
      continue
    }

    let bufferArquivo: Buffer
    try {
      bufferArquivo = await baixarArquivoGridFS(bucket, gridfsId)
    } catch (e) {
      naoResolvidos.push({ tipo: 'curriculo', mongoId: curriculo.personId, motivo: `falha ao baixar do GridFS: ${(e as Error).message}` })
      continue
    }

    const nomeArquivo = extrairNomeArquivo(curriculo.fileData)
    const ext = await detectarExtensao(bufferArquivo, nomeArquivo, EXTENSOES_CURRICULO_PERMITIDAS)
    if (!ext) {
      naoResolvidos.push({ tipo: 'curriculo', mongoId: curriculo.personId, motivo: 'tipo de arquivo não suportado (nem PDF, DOC, DOCX, JPG ou PNG)' })
      continue
    }

    const caminho = montarCaminhoCurriculo(gabineteId, pessoa.id, ext)
    const { error: erroUpload } = await getSupabaseAdmin().storage
      .from('gabinete-assets')
      .upload(caminho, bufferArquivo, { upsert: true, contentType: EXTENSOES_CURRICULO_PERMITIDAS[ext] })
    if (erroUpload) {
      naoResolvidos.push({ tipo: 'curriculo', mongoId: curriculo.personId, motivo: `falha no upload pro Supabase: ${erroUpload.message}` })
      continue
    }

    const { data: { publicUrl } } = getSupabaseAdmin().storage.from('gabinete-assets').getPublicUrl(caminho)
    await prisma.bancoTalentos.update({ where: { id: bancoTalentos.id }, data: { curriculoUrl: publicUrl } })
    curriculosCriados++

    if (curriculosCriados % 50 === 0) console.log(`  ... ${curriculosCriados} currículos recuperados`)
  }

  console.log(`\n✓ Fotos recuperadas: ${fotosCriadas}`)
  console.log(`✓ Fotos que já tinham fotoUrl (idempotência): ${fotosJaTinham}`)
  console.log(`✓ Currículos recuperados: ${curriculosCriados}`)
  console.log(`✓ Currículos que já tinham curriculoUrl (idempotência): ${curriculosJaTinham}`)
  console.log(`✓ Não resolvidos: ${naoResolvidos.length}`)

  const relatorioPath = path.join(os.tmpdir(), `importacao-izalci-fase6-nao-resolvidos-${gabineteSlug}-${Date.now()}.json`)
  fs.writeFileSync(relatorioPath, JSON.stringify(naoResolvidos, null, 2))
  console.log(`✓ Relatório de não resolvidos (fora do repositório): ${relatorioPath}`)

  await mongoClient.close()
  console.log('\n✅ Recuperação de arquivos da Fase 6 concluída.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 3: Checar tipos**

Run: `cd /Users/renato/Documents/meubd && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd /Users/renato/Documents/meubd
git add package.json package-lock.json scripts/importacao-izalci/recuperar-arquivos-fase6.ts
git commit -m "$(cat <<'EOF'
feat: script de recuperação de arquivos da Fase 6 (Izalci)

Reconstrói o conjunto canônico de Pessoa (mesmo critério da Fase 3/5)
pra religar fotos e currículos já existentes no GridFS "cache" do
MongoDB Atlas ao vivo aos registros Pessoa/BancoTalentos já
importados. Detecta tipo de arquivo pelos bytes reais (não confia no
metadado do Mongo), comprime fotos grandes com sharp, sobe pro mesmo
bucket/caminho do Supabase Storage que o app usa hoje. Idempotente.
EOF
)"
```

---

### Task 3: Rollout — staging, produção, e revogação de acesso

**Files:** nenhum (só execução e configuração de ambiente).

**Interfaces:** nenhuma — consome o script já commitado na Task 2.

- [ ] **Step 1: Adicionar a connection string do Atlas nos dois ambientes**

Adicionar a linha abaixo em **`.env.staging`** e em **`.env.local`** (mesmo valor nos dois arquivos — é a mesma fonte de dados legada, só o alvo de escrita muda entre staging e produção):

```
MONGO_ATLAS_URI_LEGADO=<connection string do usuário temporário criado no Atlas>
```

**Nunca** commitar esse valor em nenhum arquivo versionado.

- [ ] **Step 2: Rodar contra staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
npx tsx scripts/importacao-izalci/recuperar-arquivos-fase6.ts staging-teste
```

Expected: script roda até o fim sem erro, imprime o resumo (Fotos recuperadas, Currículos recuperados, Não resolvidos).

- [ ] **Step 3: Verificar staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const { rows: [g] } = await client.query('SELECT id FROM \"Gabinete\" WHERE slug = \$1', ['staging-teste'])
  const { rows: [{ comfoto }] } = await client.query('SELECT COUNT(*) as comfoto FROM \"Pessoa\" WHERE \"gabineteId\" = \$1 AND \"fotoUrl\" IS NOT NULL', [g.id])
  const { rows: [{ comcurriculo }] } = await client.query('SELECT COUNT(*) as comcurriculo FROM \"BancoTalentos\" bt JOIN \"Pessoa\" p ON p.id = bt.\"pessoaId\" WHERE p.\"gabineteId\" = \$1 AND bt.\"curriculoUrl\" IS NOT NULL', [g.id])
  console.log('Pessoa com fotoUrl:', comfoto)
  console.log('BancoTalentos com curriculoUrl:', comcurriculo)
  await client.end()
})
"
```

Expected: `Pessoa com fotoUrl` perto de 800 (o total de fotos do tenant, descontando os não resolvidos). `BancoTalentos com curriculoUrl` perto de 520 (dos 526 já existentes).

- [ ] **Step 4: Rodar contra produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
npx tsx scripts/importacao-izalci/recuperar-arquivos-fase6.ts izalci
```

Expected: mesma saída de sucesso do Step 2, rodando contra o gabinete IZALCI real.

- [ ] **Step 5: Verificar produção**

Rodar a mesma query do Step 3, trocando o slug pra `izalci` e o ambiente pra `.env.local`. Expected: números iguais aos de staging (Step 3) — confirma paridade entre os dois ambientes, mesmo padrão de verificação das fases anteriores.

- [ ] **Step 6: Revogar o acesso temporário ao MongoDB Atlas**

No painel do Atlas:
1. **Security → Network Access**: remover a entrada `0.0.0.0/0` adicionada pra essa tarefa.
2. **Security → Database Access**: apagar o usuário `meubancodedados` (ou, no mínimo, trocar a senha).

Depois de revogado, remover a linha `MONGO_ATLAS_URI_LEGADO` de `.env.staging` e `.env.local` (não é mais necessária, e não deve ficar guardando uma credencial morta).

- [ ] **Step 7: Reportar ao usuário**

Sem commit adicional (Task 3 só executa o script já commitado na Task 2). Confirmar ao usuário: contagem final de fotos e currículos recuperados em produção, quantos não foram possíveis e por quê (resumo do relatório), e a confirmação de que o acesso temporário ao Atlas foi revogado.

## Nota pós-execução

Executado com sucesso contra staging e produção, com **dois bugs reais encontrados e corrigidos durante a execução ao vivo** (diferente da Fase 4/5, mais parecido com a Fase 3):

1. **Falha de compressão sem `try/catch`** (commit `c4f1fad`): `sharp` lançou `VipsJpeg: Invalid SOS parameters for sequential JPEG` numa foto específica, corrompida na fonte — `processarFoto` não tinha tratamento de erro, derrubando o script inteiro após 500+ fotos já recuperadas em staging. Corrigido isolando a falha por registro (mesmo padrão já usado nos outros pontos do script), reportando em não-resolvidos e seguindo o lote.
2. **Download do GridFS sem timeout** (commit `1b78ae4`): o rollout de produção travou ~20 minutos baixando um currículo específico cujos chunks do GridFS estavam incompletos/corrompidos — o stream nunca emitia `'end'` nem `'error'`, deixando a Promise pendurada e travando o processamento sequencial. Corrigido com timeout de 30s que destrói o stream e rejeita, caindo no `try/catch` já existente.

Ambos os bugs foram tratados como falha isolada por registro, sem corromper nenhum estado — cada foto/currículo é salvo individualmente (idempotente), então a reexecução após cada fix retomou exatamente de onde parou, sem duplicar nem perder nada.

**Resultado final, idêntico entre staging e produção** (a diferença de 1 em `fotoUrl` é um registro de teste pré-existente em staging, não relacionado à importação): `Pessoa.fotoUrl` preenchido = 696-697; `BancoTalentos.curriculoUrl` preenchido = 497; não resolvidos = 73 (25 fotos: 15 tipo de arquivo não suportado, 9 sem Pessoa correspondente, 1 falha de compressão; 48 currículos: 46 pessoa não-canônica, 2 sem Pessoa correspondente). Amostra de URLs reais verificada via `curl` — servindo `image/jpeg` e `application/pdf` corretamente, tamanhos plausíveis.

`MONGO_ATLAS_URI_LEGADO` já removida de `.env.local`/`.env.staging` (arquivos locais, não commitados). Revogação do acesso no painel do Atlas (liberação de rede `0.0.0.0/0` e usuário `meubancodedados`) é uma ação manual do usuário no painel — confirmar separadamente que foi feita antes de considerar o acesso temporário totalmente encerrado.
