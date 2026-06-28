import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { GraficoDemandas } from '@/components/GraficoDemandas'

function calcularIntervalo(
  periodo: string,
  inicio?: string,
  fim?: string
): { dataInicio: Date; dataFim: Date } {
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
  if (periodo === 'personalizado' && inicio && fim) {
    return {
      dataInicio: new Date(`${inicio}T00:00:00`),
      dataFim: new Date(`${fim}T23:59:59.999`),
    }
  }
  // Default: 30 dias
  const dataInicio = new Date(agora)
  dataInicio.setDate(dataInicio.getDate() - 30)
  dataInicio.setHours(0, 0, 0, 0)
  return { dataInicio, dataFim }
}

const LABEL_ORIGEM: Record<string, string> = {
  qrcode: 'QR Code',
  link: 'Link',
  manual: 'Manual',
  indicacao: 'Indicação',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  importacao: 'Importação',
}

const LABEL_GENERO: Record<string, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  outro: 'Outro',
  prefiro_nao_informar: 'Prefiro não informar',
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { periodo?: string; inicio?: string; fim?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const periodo = searchParams.periodo ?? '30dias'
  const { dataInicio, dataFim } = calcularIntervalo(
    periodo,
    searchParams.inicio,
    searchParams.fim
  )

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999)
  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dataInicioStr = inicioMes.toISOString().slice(0, 10)
  const dataFimStr = fimMes.toISOString().slice(0, 10)

  const [
    totalPessoas,
    novasPessoas,
    totalMobilizadores,
    totalEquipe,
    segmentosComContagem,
    mobilizadoresAtivos,
    pessoasPorOrigem,
    pessoasPorRegiao,
    pessoasPorGenero,
    demandasMes,
  ] = await Promise.all([
    prisma.pessoa.count({ where: { gabineteId: gabinete.id } }),

    prisma.pessoa.count({
      where: {
        gabineteId: gabinete.id,
        criadoEm: { gte: dataInicio, lte: dataFim },
      },
    }),

    prisma.pessoa.count({ where: { gabineteId: gabinete.id, isMobilizador: true } }),

    prisma.pessoa.count({ where: { gabineteId: gabinete.id, isColaborador: true } }),

    prisma.segmento.findMany({
      where: { gabineteId: gabinete.id, status: 'ativo' },
      select: {
        nome: true,
        tipo: true,
        _count: { select: { pessoas: true } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true },
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
      where: { gabineteId: gabinete.id },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id },
      select: {
        nome: true,
        ativa: true,
        _count: { select: { pessoas: true } },
      },
      orderBy: { pessoas: { _count: 'desc' } },
    }),

    prisma.pessoa.groupBy({
      by: ['genero'],
      where: { gabineteId: gabinete.id },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.demanda.groupBy({
      by: ['status'],
      where: { gabineteId: gabinete.id, criadoEm: { gte: inicioMes, lte: fimMes } },
      _count: { id: true },
    }),
  ])

  const contagemDemandasMes = Object.fromEntries(demandasMes.map((d) => [d.status, d._count.id]))

  const barrasDemandas = [
    { status: 'aberta',       label: 'Em aberto',    bgClass: 'bg-yellow-400', count: contagemDemandasMes['aberta']       ?? 0 },
    { status: 'expirada',     label: 'Expirada',     bgClass: 'bg-orange-400', count: contagemDemandasMes['expirada']     ?? 0 },
    { status: 'atendida',     label: 'Atendida',     bgClass: 'bg-green-500',  count: contagemDemandasMes['atendida']     ?? 0 },
    { status: 'nao_atendida', label: 'Não atendida', bgClass: 'bg-red-400',    count: contagemDemandasMes['nao_atendida'] ?? 0 },
  ].map((b) => ({
    ...b,
    href: `/${params.slug}/admin/demandas?status=${b.status}&dataInicio=${dataInicioStr}&dataFim=${dataFimStr}`,
  }))

  const rankingMobilizadores = mobilizadoresAtivos
    .map((m) => ({ nome: m.nome, contagem: m.redesComoIndicador.length }))
    .sort((a, b) => b.contagem - a.contagem)

  const labelPeriodo: Record<string, string> = {
    hoje: 'Hoje',
    '7dias': 'Últimos 7 dias',
    '30dias': 'Últimos 30 dias',
    personalizado: `${searchParams.inicio ?? '?'} a ${searchParams.fim ?? '?'}`,
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

        <div className="flex flex-wrap gap-2">
          {(['hoje', '7dias', '30dias'] as const).map((p) => (
            <a
              key={p}
              href={`/${params.slug}/admin/dashboard?periodo=${p}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                periodo === p
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {labelPeriodo[p]}
            </a>
          ))}
          <form
            method="GET"
            action={`/${params.slug}/admin/dashboard`}
            className="flex gap-1"
          >
            <input type="hidden" name="periodo" value="personalizado" />
            <input
              name="inicio"
              type="date"
              defaultValue={searchParams.inicio}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            />
            <input
              name="fim"
              type="date"
              defaultValue={searchParams.fim}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-sm hover:border-blue-400"
            >
              Aplicar
            </button>
          </form>
        </div>
      </div>

      <p className="text-sm text-gray-500 -mt-4">
        Período selecionado: <strong>{labelPeriodo[periodo] ?? periodo}</strong>
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total pessoas</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalPessoas}</p>
          <p className="text-xs text-gray-400 mt-0.5">estado atual</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Novas no período</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{novasPessoas}</p>
          <p className="text-xs text-gray-400 mt-0.5">{labelPeriodo[periodo]}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Mobilizadores</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{totalMobilizadores}</p>
          <p className="text-xs text-gray-400 mt-0.5">ativos agora</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Colaboradores</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">{totalEquipe}</p>
          <p className="text-xs text-gray-400 mt-0.5">membros</p>
        </div>
      </div>

      <GraficoDemandas barras={barrasDemandas} mesLabel={mesLabel} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por segmento</h2>
          {segmentosComContagem.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum segmento ativo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Segmento</th>
                  <th className="text-left pb-2 text-gray-600 font-medium">Tipo</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {segmentosComContagem.map((s) => (
                  <tr key={s.nome}>
                    <td className="py-2 text-gray-800">{s.nome}</td>
                    <td className="py-2 text-gray-500 capitalize">{s.tipo}</td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      {s._count.pessoas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Ranking de mobilizadores
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            Convidados no período: {labelPeriodo[periodo]}
          </p>
          {rankingMobilizadores.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum mobilizador ativo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Mobilizador</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Convidados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rankingMobilizadores.map((m, i) => (
                  <tr key={m.nome}>
                    <td className="py-2 text-gray-800">
                      <span className="text-gray-400 mr-2 font-mono text-xs">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {m.nome}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      {m.contagem}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por origem</h2>
          {pessoasPorOrigem.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Origem</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pessoasPorOrigem.map((o) => (
                  <tr key={o.origem ?? 'null'}>
                    <td className="py-2 text-gray-800">
                      {o.origem ? (LABEL_ORIGEM[o.origem] ?? o.origem) : 'Não informado'}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      {o._count.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por região</h2>
          {pessoasPorRegiao.filter((r) => r._count.pessoas > 0).length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma pessoa com região cadastrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Região</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pessoasPorRegiao
                  .filter((r) => r._count.pessoas > 0)
                  .map((r) => (
                    <tr key={r.nome}>
                      <td className="py-2 text-gray-800">
                        {r.nome}
                        {!r.ativa && (
                          <span className="ml-1 text-xs text-gray-400">(desativada)</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-medium text-gray-900">
                        {r._count.pessoas}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por gênero</h2>
          {pessoasPorGenero.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Gênero</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pessoasPorGenero.map((g) => (
                  <tr key={g.genero ?? 'null'}>
                    <td className="py-2 text-gray-800">
                      {g.genero ? (LABEL_GENERO[g.genero] ?? g.genero) : 'Não informado'}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      {g._count.id}
                    </td>
                    <td className="py-2 text-right text-gray-500">
                      {totalPessoas > 0
                        ? `${Math.round((g._count.id / totalPessoas) * 100)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

      </div>
    </div>
  )
}
