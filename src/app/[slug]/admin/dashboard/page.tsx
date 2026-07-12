// src/app/[slug]/admin/dashboard/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { buildWherePessoas, type FiltrosPessoasParams } from '@/lib/filtros-pessoas'
import { DashboardConteudo } from './DashboardConteudo'

function calcularIntervalo(periodo: string): { dataInicio: Date; dataFim: Date } {
  const agora = new Date()
  const dataFim = new Date(agora)
  dataFim.setHours(23, 59, 59, 999)

  if (periodo === 'hoje') {
    const dataInicio = new Date(agora)
    dataInicio.setHours(0, 0, 0, 0)
    return { dataInicio, dataFim }
  }
  if (periodo === '7dias') {
    const dataInicio = new Date(agora)
    dataInicio.setDate(dataInicio.getDate() - 7)
    dataInicio.setHours(0, 0, 0, 0)
    return { dataInicio, dataFim }
  }
  const dataInicio = new Date(agora)
  dataInicio.setDate(dataInicio.getDate() - 30)
  dataInicio.setHours(0, 0, 0, 0)
  return { dataInicio, dataFim }
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: Record<string, string | undefined>
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const periodo = searchParams.periodo ?? '30dias'
  const { dataInicio, dataFim } = calcularIntervalo(periodo)

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999)
  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dataInicioStr = inicioMes.toISOString().slice(0, 10)
  const dataFimStr = fimMes.toISOString().slice(0, 10)

  const filtrosPessoas: FiltrosPessoasParams = {
    regiaoId: searchParams.regiaoId,
    genero: searchParams.genero,
    idadeMin: searchParams.idadeMin,
    idadeMax: searchParams.idadeMax,
    segmentoId: searchParams.segmentoId,
    escolaridade: searchParams.escolaridade,
    religiao: searchParams.religiao,
  }
  const wherePessoas = buildWherePessoas(gabinete.id, filtrosPessoas)

  const [
    totalPessoas,
    novasPessoas,
    totalMobilizadores,
    totalEquipe,
    segmentosRaw,
    mobilizadoresAtivos,
    pessoasPorOrigemRaw,
    regioesRaw,
    pessoasPorGeneroRaw,
    demandasMesRaw,
    escolaridadeRaw,
    religiaoRaw,
    nascimentosPessoas,
    totalSemNascimento,
  ] = await Promise.all([
    prisma.pessoa.count({ where: wherePessoas }),

    prisma.pessoa.count({
      where: { ...wherePessoas, criadoEm: { gte: dataInicio, lte: dataFim } },
    }),

    prisma.pessoa.count({ where: { ...wherePessoas, isMobilizador: true } }),

    prisma.pessoa.count({ where: { ...wherePessoas, isColaborador: true } }),

    prisma.segmento.findMany({
      where: { gabineteId: gabinete.id, status: 'ativo' },
      select: {
        nome: true,
        tipo: true,
        _count: { select: { pessoas: { where: { pessoa: wherePessoas } } } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    prisma.pessoa.findMany({
      where: { ...wherePessoas, isMobilizador: true },
      select: {
        id: true,
        nome: true,
        redesComoIndicador: {
          where: { criadoEm: { gte: dataInicio, lte: dataFim } },
          select: { id: true },
        },
      },
    }),

    prisma.pessoa.groupBy({
      by: ['origem'],
      where: wherePessoas,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

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

    prisma.pessoa.groupBy({
      by: ['genero'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.demanda.groupBy({
      by: ['status'],
      where: {
        gabineteId: gabinete.id,
        deletedAt: null,
        criadoEm: { gte: inicioMes, lte: fimMes },
        solicitante: wherePessoas,
      },
      _count: { id: true },
    }),

    prisma.pessoa.groupBy({
      by: ['escolaridade'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.pessoa.groupBy({
      by: ['religiao'],
      where: wherePessoas,
      _count: { id: true },
    }),

    prisma.pessoa.findMany({
      where: { ...wherePessoas, nascimento: { not: null } },
      select: { nascimento: true },
    }),

    prisma.pessoa.count({ where: { ...wherePessoas, nascimento: null } }),
  ])

  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)

  const labelPeriodo: Record<string, string> = {
    hoje: 'Hoje',
    '7dias': 'Últimos 7 dias',
    '30dias': 'Últimos 30 dias',
  }

  return (
    <DashboardConteudo
      slug={params.slug}
      dashboardHref={`/${params.slug}/admin/dashboard`}
      filtrosHref={`/${params.slug}/admin/filtros`}
      demandasHref={`/${params.slug}/admin/demandas`}
      searchParams={searchParams}
      periodo={periodo}
      labelPeriodo={labelPeriodo}
      totalPessoas={totalPessoas}
      novasPessoas={novasPessoas}
      totalMobilizadores={totalMobilizadores}
      totalEquipe={totalEquipe}
      segmentosComContagem={segmentosRaw.map((s) => ({ nome: s.nome, tipo: s.tipo, contagem: s._count.pessoas }))}
      rankingMobilizadores={rankingMobilizadores}
      pessoasPorOrigem={pessoasPorOrigemRaw.map((o) => ({ chave: o.origem, contagem: o._count.id }))}
      regioes={regioesRaw.map((r) => ({ id: r.id, nome: r.nome, ativa: r.ativa, contagem: r._count.pessoas }))}
      contagemGenero={pessoasPorGeneroRaw.map((g) => ({ chave: g.genero, contagem: g._count.id }))}
      contagemDemandas={demandasMesRaw.map((d) => ({ chave: d.status, contagem: d._count.id }))}
      mesLabel={mesLabel}
      dataInicioStr={dataInicioStr}
      dataFimStr={dataFimStr}
      nascimentos={nascimentosPessoas.map((p) => p.nascimento as Date)}
      totalSemNascimento={totalSemNascimento}
      escolaridade={escolaridadeRaw.map((e) => ({ chave: e.escolaridade, contagem: e._count.id }))}
      religiao={religiaoRaw.map((r) => ({ chave: r.religiao, contagem: r._count.id }))}
    />
  )
}
