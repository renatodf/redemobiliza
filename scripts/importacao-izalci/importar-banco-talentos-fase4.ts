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
