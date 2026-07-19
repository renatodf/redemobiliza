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
  const whatsappPorMongoId = new Map(canonicas.map((c) => [c.mongoId, c.whatsapp]))

  const indicadorPorMongoId = new Map<string, string | null>()
  for (const c of canonicas) {
    indicadorPorMongoId.set(c.mongoId, resolverMongoIdIndicador(c.createdById, mongoIdsCanonicos))
  }

  const pessoasPostgres = await prisma.pessoa.findMany({
    where: { gabineteId, deletedAt: null },
    select: { id: true, whatsapp: true },
  })
  const pessoaIdPorWhatsapp = new Map(pessoasPostgres.map((p) => [p.whatsapp, p.id]))
  console.log(`✓ ${pessoaIdPorWhatsapp.size} Pessoa carregadas do Postgres`)

  // nivel precisa refletir a cadeia já resolvida no Postgres, não só o grafo
  // cru do Mongo — um indicador canônico mas sem Pessoa ativa correspondente
  // (ex: soft-deleted por colisão de whatsapp na Fase 3) não pode contar como
  // pai real na hora de calcular nivel, senão um VinculoRede com
  // indicadoPorId = null (raiz) sairia com nivel > 0, quebrando a invariante
  // "raiz tem nivel = 0".
  const indicadorRealizadoPorMongoId = new Map<string, string | null>()
  for (const c of canonicas) {
    const indicadorMongoId = indicadorPorMongoId.get(c.mongoId) ?? null
    if (indicadorMongoId === null) {
      indicadorRealizadoPorMongoId.set(c.mongoId, null)
      continue
    }
    const whatsappIndicador = whatsappPorMongoId.get(indicadorMongoId)
    const temPessoaAtiva = whatsappIndicador ? pessoaIdPorWhatsapp.has(whatsappIndicador) : false
    indicadorRealizadoPorMongoId.set(c.mongoId, temPessoaAtiva ? indicadorMongoId : null)
  }

  const niveis = calcularNiveis(indicadorRealizadoPorMongoId)

  const vinculosExistentes = await prisma.vinculoRede.findMany({
    where: { gabineteId, deletedAt: null },
    select: { pessoaId: true },
  })
  const pessoaIdsComVinculo = new Set(vinculosExistentes.map((v) => v.pessoaId))
  console.log(`✓ ${pessoaIdsComVinculo.size} Pessoa já têm VinculoRede ativa (idempotência)`)

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
