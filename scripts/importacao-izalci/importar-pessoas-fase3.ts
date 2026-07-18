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
  validarNascimento,
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
  const iter = iterarDocumentosBson(path.join(BACKUP_DIR, 'tags.bson.gz'))
  for (let r = iter.next(); !r.done; r = iter.next()) {
    const doc = r.value
    if (idParaString(doc.tenant_id) !== TENANT_IZALCI) continue
    const id = idParaString(doc._id)
    if (!id) continue
    mapa.set(id, { type: String(doc.type ?? ''), label: String(doc.label ?? '') })
  }
  return mapa
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

  const segmentoIds = Array.from(new Set(
    todasTagsDoTipo(tagIds, tags, 'Segment')
      .map((t) => segmentoPorNome.get(normalizarNome(resolverNomeCatalogo(t.label, SEGMENT_MERGES))))
      .filter((id): id is string => !!id)
  ))

  const nome = `${String(doc.name ?? '').trim()} ${String(doc.surname ?? '').trim()}`.trim()

  return {
    nome,
    whatsapp: '', // preenchido depois de resolver telefone, no chamador
    email: typeof doc.email === 'string' && doc.email ? doc.email : null,
    cpf: typeof doc.cpf === 'string' && doc.cpf ? doc.cpf : null,
    nascimento: validarNascimento(doc.birth_date),
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
    deletedAt: doc.deleted === true ? (validarNascimento(doc.updated_at) ?? new Date()) : null,
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
  const gabineteId = gabinete.id
  console.log(`✓ Gabinete: ${gabinete.nome} (${gabineteId})`)

  console.log('Carregando tags...')
  const tags = carregarTags()
  console.log(`✓ ${tags.size} tags carregadas`)

  console.log('Carregando telefones...')
  const telefonesPorPessoa = carregarTelefonesPorPessoa()
  console.log(`✓ telefones de ${telefonesPorPessoa.size} pessoas carregados`)

  console.log('Carregando catálogos do Postgres...')
  const regiaoPorNome = await carregarCatalogoRegiao(gabineteId)
  const profissaoPorNome = await carregarCatalogoProfissao(gabineteId)
  const segmentoPorNome = await carregarCatalogoSegmento(gabineteId)
  console.log(`✓ Regiao=${regiaoPorNome.size} Profissao=${profissaoPorNome.size} Segmento=${segmentoPorNome.size}`)

  // Idempotência: pré-carrega os whatsapp já importados neste gabinete (de uma
  // execução anterior, ex. o lote pequeno de teste) — sem isso, rodar o script
  // de novo tentaria recriar a mesma pessoa e quebraria no índice único do
  // banco no meio do lote, corrompendo o mapeamento posicional de
  // createManyAndReturn (ver Task 3, achado da sessão de planejamento).
  const existentes = await prisma.pessoa.findMany({
    where: { gabineteId },
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
        gabineteId,
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
          gabineteId,
          pessoaId: criada.id,
          autorUserId: 'sistema-importacao-izalci',
          autorNome: 'Importação Izalci (sistema anterior)',
          texto: `Papel no sistema anterior: ${origem.role}`,
        })
      }
      for (const numero of origem.extras) {
        telefoneExtraData.push({ gabineteId, pessoaId: criada.id, numero, tipo: null })
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

  const iterPeople = iterarDocumentosBson(path.join(BACKUP_DIR, 'people.bson.gz'))
  for (let rPeople = iterPeople.next(); !rPeople.done; rPeople = iterPeople.next()) {
    const doc = rPeople.value
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
