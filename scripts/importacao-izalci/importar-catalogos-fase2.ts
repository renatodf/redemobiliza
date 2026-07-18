/**
 * Script pontual: importa os catálogos da Fase 2 (Regiao/Profissao/Segmento/
 * AreaColocacao) a partir de scripts/importacao-izalci/catalogos-fase2.json
 * para um gabinete específico.
 *
 * Uso: npx tsx scripts/importacao-izalci/importar-catalogos-fase2.ts <slug-do-gabinete>
 */
import { PrismaClient } from '../../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { toSlug } from '../../src/lib/slug'

dotenv.config({ path: '.env.local' })

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const GEOCODE_TIMEOUT_MS = 5000

async function geocodificarRegiao(nome: string, uf: string): Promise<{ latitude: number; longitude: number } | null> {
  const query = `${nome}, ${uf}, Brasil`
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS)

  try {
    const resposta = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RedeMobiliza/1.0 (importacao de catalogos Izalci via script)' },
    })
    if (!resposta.ok) return null

    const dados = (await resposta.json()) as { lat: string; lon: string }[]
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

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter } as never)

type Bairro = { nome: string; cidadeMae: string | null; metodoResolucao: string | null }
type Catalogos = {
  profissoes: string[]
  areasColocacao: string[]
  segmentos: string[]
  cidades: string[]
  bairros: Bairro[]
}

// UF de cada cidade final (pós-fusão). As 34 primeiras são do DF (confirmado
// pelo usuário em sessão de revisão manual das 77 tags City originais). As
// 41 seguintes são de fora do DF — mapeadas por conhecimento geográfico
// geral; as marcadas "baixa confiança" merecem checagem antes de rodar
// contra produção (nomes ambíguos ou pouco comuns). 'Entorno do DF' não é
// um município real — fica sem UF de propósito, geocodificação vai falhar
// pra ela e não é bloqueante (mesmo tratamento de erro do resto do script).
const UF_POR_CIDADE: Record<string, string> = {
  // DF (34)
  'Arniqueira': 'DF', 'Brasília': 'DF', 'Brazlândia': 'DF', 'Candangolândia': 'DF',
  'Ceilândia': 'DF', 'Cruzeiro': 'DF', 'Fercal': 'DF', 'Gama': 'DF', 'Guará': 'DF',
  'Itapoã': 'DF', 'Jardim Botânico': 'DF', 'Lago Norte': 'DF', 'Lago Sul': 'DF',
  'Núcleo Bandeirante': 'DF', 'Paranoá': 'DF', 'Park Way': 'DF', 'Planaltina': 'DF',
  'Plano Piloto': 'DF', 'Recanto das Emas': 'DF', 'Riacho Fundo': 'DF', 'Riacho Fundo II': 'DF',
  'Samambaia': 'DF', 'Santa Maria': 'DF', 'SCIA': 'DF', 'SIA': 'DF', 'Sobradinho': 'DF',
  'Sobradinho II': 'DF', 'Sol Nascente - Pôr do Sol': 'DF', 'Sudoeste/Octogonal': 'DF',
  'São Sebastião': 'DF', 'Taguatinga': 'DF', 'Varjão': 'DF', 'Vicente Pires': 'DF', 'Águas Claras': 'DF',
  // fora do DF (39 — 'Entorno do DF' fica de fora de propósito, ver comentário acima)
  'Anápolis': 'GO', 'Aracaju': 'SE', 'Barretos': 'SP', 'Barueri': 'SP', 'Catalão': 'GO',
  'Ceres': 'GO', 'Cidade Ocidental': 'GO', 'Cocalzinho de Goiás': 'GO', 'Cristalina': 'GO',
  'Curitiba': 'PR', 'CÉU AZUL': 'PR', 'Flores de Goiás': 'GO', 'Formosa': 'GO', 'Goiânia': 'GO',
  'Irecê': 'BA', 'João Pessoa': 'PB', 'Luziânia': 'GO', 'Mauá': 'SP', 'Navegantes': 'SC',
  'Nova Lima': 'MG', 'Nova Xavantina': 'MT', 'Novo Gama': 'GO', 'Padre Bernardo': 'GO',
  'Palmas': 'TO', 'Planaltina Goiás': 'GO', 'Porto Alegre': 'RS', 'Recife': 'PE',
  'Ribeirão Preto': 'SP', 'Rio de Janeiro': 'RJ', 'Santo Antônio do Descoberto': 'GO',
  "São João D'Aliança": 'GO', 'São Paulo': 'SP', 'União da Vitória': 'PR',
  'Valparaíso de Goiás': 'GO', 'Vitória da Conquista': 'BA', 'Água Fria de Goiás': 'GO',
  'Águas Lindas de Goiás': 'GO',
  // baixa confiança — nomes ambíguos, checar antes de rodar contra produção
  'São Jerônimo': 'RS',
  'Jardim Ingá': 'GO',
  'Riachinho': 'MG',
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizarNome(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

async function geocodificarEAplicar(regiaoId: string, nome: string, uf: string) {
  const coordenada = await geocodificarRegiao(nome, uf)
  await sleep(1000)
  if (coordenada) {
    await prisma.regiao.update({
      where: { id: regiaoId },
      data: { latitude: coordenada.latitude, longitude: coordenada.longitude },
    })
  } else {
    console.warn(`  ⚠ geocodificação falhou para "${nome}, ${uf}"`)
  }
}

async function upsertRegiao(
  nome: string,
  gabineteId: string,
  uf: string | null,
  regiaoPaiId: string | null
): Promise<string> {
  const existente = await prisma.regiao.findFirst({
    where: { gabineteId, nome: { equals: nome, mode: 'insensitive' }, ativa: true },
  })

  if (existente) {
    const dataFaltando: { uf?: string; regiaoPaiId?: string } = {}
    if (!existente.uf && uf) dataFaltando.uf = uf
    if (!existente.regiaoPaiId && regiaoPaiId) dataFaltando.regiaoPaiId = regiaoPaiId
    if (Object.keys(dataFaltando).length > 0) {
      await prisma.regiao.update({ where: { id: existente.id }, data: dataFaltando })
    }
    if (existente.latitude == null && uf) {
      await geocodificarEAplicar(existente.id, nome, uf)
    }
    return existente.id
  }

  const regiao = await prisma.regiao.create({ data: { nome, uf, gabineteId, ativa: true, regiaoPaiId } })
  if (uf) await geocodificarEAplicar(regiao.id, nome, uf)
  return regiao.id
}

async function main() {
  const gabineteSlug = process.argv[2]
  if (!gabineteSlug) {
    console.error('Uso: npx tsx scripts/importacao-izalci/importar-catalogos-fase2.ts <slug-do-gabinete>')
    process.exit(1)
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { slug: gabineteSlug } })
  if (!gabinete) {
    console.error(`Gabinete com slug "${gabineteSlug}" não encontrado.`)
    process.exit(1)
  }
  console.log(`✓ Gabinete encontrado: ${gabinete.nome} (${gabinete.id})`)

  const jsonPath = path.join(__dirname, 'catalogos-fase2.json')
  const catalogos: Catalogos = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

  let profissoesCriadas = 0
  for (const nome of catalogos.profissoes) {
    const existente = await prisma.profissao.findFirst({
      where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' }, ativa: true },
    })
    if (existente) continue
    await prisma.profissao.create({ data: { nome, gabineteId: gabinete.id, ativa: true } })
    profissoesCriadas++
  }
  console.log(`✓ Profissao: ${profissoesCriadas} criadas (de ${catalogos.profissoes.length} no JSON)`)

  let segmentosCriados = 0
  for (const nome of catalogos.segmentos) {
    const slug = toSlug(nome)
    const existente = await prisma.segmento.findFirst({ where: { gabineteId: gabinete.id, slug, status: 'ativo' } })
    if (existente) continue
    await prisma.segmento.create({
      data: { nome, slug, gabineteId: gabinete.id, tipo: 'geral', status: 'ativo' },
    })
    segmentosCriados++
  }
  console.log(`✓ Segmento: ${segmentosCriados} criados (de ${catalogos.segmentos.length} no JSON)`)

  let areasCriadas = 0
  for (const nome of catalogos.areasColocacao) {
    const existente = await prisma.areaColocacao.findFirst({ where: { gabineteId: gabinete.id, nome } })
    if (existente) continue
    await prisma.areaColocacao.create({ data: { nome, gabineteId: gabinete.id, status: 'ativa' } })
    areasCriadas++
  }
  console.log(`✓ AreaColocacao: ${areasCriadas} criadas (de ${catalogos.areasColocacao.length} no JSON)`)

  const cidadeIdPorNome = new Map<string, string>()
  for (const nome of catalogos.cidades) {
    const uf = UF_POR_CIDADE[nome] ?? null
    const id = await upsertRegiao(nome, gabinete.id, uf, null)
    cidadeIdPorNome.set(nome, id)
  }
  console.log(`✓ Regiao (cidades): ${catalogos.cidades.length} processadas`)

  let bairrosProcessados = 0
  for (const bairro of catalogos.bairros) {
    if (bairro.cidadeMae && normalizarNome(bairro.nome) === normalizarNome(bairro.cidadeMae)) {
      // Bairro homônimo da cidade-mãe (ex. "Sobradinho" bairro dentro de
      // "Sobradinho" cidade) — é a mesma Regiao já criada no loop de
      // cidades acima; processar de novo criaria regiaoPaiId apontando
      // pra si mesma (achado real da Task 3, confirmado em staging: 28
      // regiões reais do DF/entorno corrompidas dessa forma).
      continue
    }
    const uf = bairro.cidadeMae ? (UF_POR_CIDADE[bairro.cidadeMae] ?? null) : 'DF'
    const regiaoPaiId = bairro.cidadeMae ? cidadeIdPorNome.get(bairro.cidadeMae) ?? null : null
    await upsertRegiao(bairro.nome, gabinete.id, uf, regiaoPaiId)
    bairrosProcessados++
  }
  console.log(`✓ Regiao (bairros): ${bairrosProcessados} processados (de ${catalogos.bairros.length} no JSON, ${catalogos.bairros.length - bairrosProcessados} pulados por serem homônimos da própria cidade-mãe)`)

  console.log('\n✅ Importação de catálogos da Fase 2 concluída.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
