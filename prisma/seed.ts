import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter } as never)

const nomes = [
  'Ana Clara Souza', 'Bruno Ferreira', 'Camila Oliveira', 'Daniel Santos',
  'Eduarda Lima', 'Felipe Costa', 'Gabriela Martins', 'Henrique Alves',
  'Isabela Rocha', 'João Pedro Nunes', 'Karen Ribeiro', 'Lucas Pereira',
  'Mariana Gomes', 'Nicolas Barbosa', 'Olivia Carvalho', 'Paulo Mendes',
  'Quezia Araújo', 'Rafael Dias', 'Sabrina Lopes', 'Thiago Nascimento',
  'Ursula Freitas', 'Vitor Hugo Silva', 'Wanessa Cardoso', 'Xavier Moura',
  'Yasmin Teixeira', 'Zuleide Vieira', 'Alexandre Cunha', 'Beatriz Ramos',
  'Caio Fernandes', 'Débora Pinto',
]

function fone(i: number) {
  const ddds = ['61', '62', '71', '81', '85']
  const ddd = ddds[i % ddds.length]
  const n = 910000000 + (i * 7919 + 31337) % 89999999
  const s = String(n)
  return `(${ddd}) 9 ${s.slice(1, 5)}-${s.slice(5, 9)}`
}

async function main() {
  const gabinete = await (prisma as any).gabinete.findFirst()
  if (!gabinete) {
    console.error('Nenhum gabinete encontrado.')
    return
  }
  console.log(`Gabinete: ${gabinete.nome} (slug: ${gabinete.slug})`)

  // Regiões
  let regioes = await (prisma as any).regiao.findMany({ where: { gabineteId: gabinete.id } })
  if (regioes.length === 0) {
    regioes = await Promise.all([
      'Asa Norte', 'Asa Sul', 'Taguatinga', 'Ceilândia', 'Samambaia',
      'Águas Claras', 'Gama', 'Sobradinho', 'Planaltina', 'Guará',
    ].map((nome: string) => (prisma as any).regiao.create({ data: { gabineteId: gabinete.id, nome } })))
    console.log(`✓ ${regioes.length} regiões criadas`)
  } else {
    console.log(`✓ ${regioes.length} regiões já existem`)
  }

  // Profissões
  let profissoes = await (prisma as any).profissao.findMany({ where: { gabineteId: gabinete.id } })
  if (profissoes.length === 0) {
    profissoes = await Promise.all([
      'Servidor Público', 'Professor(a)', 'Médico(a)', 'Advogado(a)',
      'Comerciante', 'Autônomo(a)', 'Estudante', 'Aposentado(a)', 'Engenheiro(a)',
    ].map((nome: string) => (prisma as any).profissao.create({ data: { gabineteId: gabinete.id, nome } })))
    console.log(`✓ ${profissoes.length} profissões criadas`)
  } else {
    console.log(`✓ ${profissoes.length} profissões já existem`)
  }

  // Áreas de demanda
  let areas = await (prisma as any).areaDemanda.findMany({ where: { gabineteId: gabinete.id } })
  if (areas.length === 0) {
    areas = await Promise.all([
      'Saúde', 'Educação', 'Assistência Social', 'Infraestrutura', 'Segurança Pública',
    ].map((nome: string) => (prisma as any).areaDemanda.create({ data: { gabineteId: gabinete.id, nome } })))
    console.log(`✓ ${areas.length} áreas de demanda criadas`)
  } else {
    console.log(`✓ ${areas.length} áreas já existem`)
  }

  // Pessoas existentes
  const fonesExistentes = new Set(
    (await (prisma as any).pessoa.findMany({ where: { gabineteId: gabinete.id }, select: { whatsapp: true } }))
      .map((p: any) => p.whatsapp)
  )

  // Colaboradores/mobilizadores (equipe interna)
  const equipeDados = [
    { nome: nomes[0], i: 0 }, { nome: nomes[1], i: 1 }, { nome: nomes[2], i: 2 },
    { nome: nomes[3], i: 3 }, { nome: nomes[4], i: 4 },
  ]
  const equipe: any[] = []
  for (const { nome, i } of equipeDados) {
    const f = fone(i)
    if (fonesExistentes.has(f)) continue
    const p = await (prisma as any).pessoa.create({
      data: {
        gabineteId: gabinete.id, nome, whatsapp: f,
        email: `${nome.split(' ')[0].toLowerCase()}@exemplo.com`,
        regiaoId: regioes[i % regioes.length].id,
        profissaoId: profissoes[i % profissoes.length].id,
        isColaborador: true, isMobilizador: true,
        origem: 'manual',
        genero: i % 2 === 0 ? 'masculino' : 'feminino',
      },
    })
    equipe.push(p)
    fonesExistentes.add(f)
  }
  if (equipe.length > 0) console.log(`✓ ${equipe.length} colaboradores criados`)

  const equipeFull = await (prisma as any).pessoa.findMany({
    where: { gabineteId: gabinete.id, isColaborador: true, isMobilizador: true },
  })

  // Mobilizadores nível 1 (rede dos colaboradores)
  const mob1: any[] = []
  for (let i = 5; i < 18; i++) {
    const f = fone(i + 50)
    if (fonesExistentes.has(f)) continue
    const p = await (prisma as any).pessoa.create({
      data: {
        gabineteId: gabinete.id, nome: nomes[i % nomes.length], whatsapp: f,
        regiaoId: regioes[i % regioes.length].id,
        profissaoId: profissoes[i % profissoes.length].id,
        isMobilizador: i < 12, isColaborador: false,
        origem: 'convite',
        genero: i % 2 === 0 ? 'masculino' : 'feminino',
      },
    })
    mob1.push(p)
    fonesExistentes.add(f)
  }
  if (mob1.length > 0) console.log(`✓ ${mob1.length} pessoas nível 1 criadas`)

  // Pessoas nível 2 (rede dos mobilizadores)
  const mob2: any[] = []
  for (let i = 18; i < 30; i++) {
    const f = fone(i + 200)
    if (fonesExistentes.has(f)) continue
    const p = await (prisma as any).pessoa.create({
      data: {
        gabineteId: gabinete.id, nome: nomes[i % nomes.length], whatsapp: f,
        regiaoId: regioes[i % regioes.length].id,
        profissaoId: profissoes[i % profissoes.length].id,
        isMobilizador: false, isColaborador: false,
        origem: 'convite',
        genero: i % 2 === 0 ? 'masculino' : 'feminino',
      },
    })
    mob2.push(p)
    fonesExistentes.add(f)
  }
  if (mob2.length > 0) console.log(`✓ ${mob2.length} pessoas nível 2 criadas`)

  // Vínculos de rede
  let vinculosCriados = 0

  // mob1 → equipe
  for (let i = 0; i < mob1.length; i++) {
    const indicador = equipeFull[i % equipeFull.length]
    try {
      await (prisma as any).vinculoRede.create({
        data: { gabineteId: gabinete.id, pessoaId: mob1[i].id, indicadoPorId: indicador.id, nivel: 1 },
      })
      vinculosCriados++
    } catch { /* duplicata */ }
  }

  // mob2 → mobilizadores de mob1 que têm isMobilizador=true
  const mob1Mobilizadores = mob1.filter((p: any) => p.isMobilizador)
  for (let i = 0; i < mob2.length; i++) {
    if (mob1Mobilizadores.length === 0) break
    const indicador = mob1Mobilizadores[i % mob1Mobilizadores.length]
    try {
      await (prisma as any).vinculoRede.create({
        data: { gabineteId: gabinete.id, pessoaId: mob2[i].id, indicadoPorId: indicador.id, nivel: 2 },
      })
      vinculosCriados++
    } catch { /* duplicata */ }
  }

  if (vinculosCriados > 0) console.log(`✓ ${vinculosCriados} vínculos de rede criados`)

  // Demandas
  const demandasExistentes = await (prisma as any).demanda.count({ where: { gabineteId: gabinete.id } })
  if (demandasExistentes === 0 && equipeFull.length > 0) {
    const todasPessoas = await (prisma as any).pessoa.findMany({
      where: { gabineteId: gabinete.id, deletedAt: null },
    })
    const modelos = [
      { titulo: 'Buraco na via pública — Setor Comercial', desc: 'Buraco de grande porte causando risco para pedestres e veículos na via principal.', area: 'Infraestrutura', status: 'aberta', diasFuturos: 3 },
      { titulo: 'Solicitação de vaga em creche pública', desc: 'Mãe solo precisa de vaga em creche municipal para filho de 2 anos. Sem renda para creche particular.', area: 'Educação', status: 'aberta', diasFuturos: 5 },
      { titulo: 'Dificuldade de agendamento pelo SUS', desc: 'Paciente aguarda há 4 meses consulta com cardiologista. Situação urgente.', area: 'Saúde', status: 'em_andamento', diasFuturos: 1 },
      { titulo: 'Postes sem iluminação na quadra 14', desc: 'Trecho de 200m sem luz há mais de 3 semanas. Moradores relatam insegurança.', area: 'Infraestrutura', status: 'em_andamento', diasFuturos: -1 },
      { titulo: 'Família em situação de vulnerabilidade social', desc: 'Família de 5 pessoas desempregada há 6 meses. Solicita encaminhamento ao CRAS.', area: 'Assistência Social', status: 'resolvida', diasFuturos: -3 },
    ]
    for (let i = 0; i < modelos.length; i++) {
      const m = modelos[i]
      const area = areas.find((a: any) => a.nome === m.area) ?? areas[0]
      const resp = equipeFull[i % equipeFull.length]
      const solic = todasPessoas[i % todasPessoas.length]
      await (prisma as any).demanda.create({
        data: {
          gabineteId: gabinete.id,
          titulo: m.titulo, descricao: m.desc,
          solicitanteId: solic.id, responsavelId: resp.id,
          areaId: area.id, criadoPorId: resp.id,
          status: m.status,
          prazoDesfecho: new Date(Date.now() + m.diasFuturos * 86400000),
          historico: {
            create: { tipo: 'criacao', descricao: 'Demanda criada via seed', autorId: resp.id },
          },
        },
      })
    }
    console.log(`✓ ${modelos.length} demandas criadas`)
  } else {
    console.log(`✓ ${demandasExistentes} demandas já existem`)
  }

  // Totais finais
  const [tp, tv, td] = await Promise.all([
    (prisma as any).pessoa.count({ where: { gabineteId: gabinete.id, deletedAt: null } }),
    (prisma as any).vinculoRede.count({ where: { gabineteId: gabinete.id, deletedAt: null } }),
    (prisma as any).demanda.count({ where: { gabineteId: gabinete.id } }),
  ])
  console.log(`\n✅ Seed concluído — Pessoas: ${tp} | Vínculos: ${tv} | Demandas: ${td}`)
  console.log(`   Acesse: /${gabinete.slug}/admin/pessoas`)
}

main().catch(console.error).finally(() => (prisma as any).$disconnect())
