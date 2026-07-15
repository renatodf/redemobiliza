import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { GraficoDemandas } from '@/components/GraficoDemandas'
import { IconeEditar } from '@/components/admin/TableIcons'
import ExcluirDemandaButton from './ExcluirDemandaButton'
import SortableHeader from '@/components/SortableHeader'

const STATUS_CONFIG = {
  aberta: { label: 'Em aberto', cor: 'bg-yellow-100 text-yellow-800' },
  expirada: { label: 'Expirada', cor: 'bg-orange-100 text-orange-800' },
  atendida: { label: 'Atendida', cor: 'bg-green-100 text-green-800' },
  nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
} as const

const PAGE_SIZE = 20

function buildOrderBy(sort?: string, order?: string) {
  const direcao = order === 'asc' ? ('asc' as const) : ('desc' as const)
  if (sort === 'prazoDesfecho') return { prazoDesfecho: direcao }
  if (sort === 'responsavel') return { responsavel: { nome: direcao } }
  if (sort === 'solicitante') return { solicitante: { nome: direcao } }
  if (sort === 'area') return { area: { nome: direcao } }
  if (sort === 'status') return { status: direcao }
  return { criadoEm: 'desc' as const }
}

export default async function DemandasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: {
    status?: string
    areaId?: string
    responsavelId?: string
    regiaoId?: string
    prazoAlterado?: string
    dataInicio?: string
    dataFim?: string
    pagina?: string
    sort?: string
    order?: string
  }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999)
  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dataInicioStr = inicioMes.toISOString().slice(0, 10)
  const dataFimStr = fimMes.toISOString().slice(0, 10)

  const pagina = Math.max(1, Number(searchParams.pagina ?? 1))

  // Período padrão: últimos 30 dias (apenas quando não há filtros)
  const temFiltro = !!(searchParams.status || searchParams.areaId || searchParams.responsavelId || searchParams.regiaoId || searchParams.prazoAlterado || searchParams.dataInicio || searchParams.dataFim)
  const dataInicioPadrao = new Date()
  dataInicioPadrao.setDate(dataInicioPadrao.getDate() - 30)
  dataInicioPadrao.setHours(0, 0, 0, 0)

  const where = {
    gabineteId: gabinete.id,
    deletedAt: null,
    ...(searchParams.status ? { status: searchParams.status } : {}),
    ...(searchParams.areaId ? { areaId: searchParams.areaId } : {}),
    ...(searchParams.responsavelId ? { responsavelId: searchParams.responsavelId } : {}),
    ...(searchParams.regiaoId ? { solicitante: { regiaoId: searchParams.regiaoId } } : {}),
    ...(searchParams.prazoAlterado ? { prazoAlterado: searchParams.prazoAlterado === 'sim' } : {}),
    ...(!temFiltro
      ? { criadoEm: { gte: dataInicioPadrao } }
      : {
          criadoEm: {
            ...(searchParams.dataInicio ? { gte: new Date(`${searchParams.dataInicio}T00:00:00`) } : {}),
            ...(searchParams.dataFim ? { lte: new Date(`${searchParams.dataFim}T23:59:59.999`) } : {}),
          },
        }),
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- areas/colaboradores/regioes alimentam o formulario de filtros comentado (ocultado, nao removido)
  const [demandas, total, contagens, areas, colaboradores, regioes, contagensMes] = await Promise.all([
    prisma.demanda.findMany({
      where,
      orderBy: buildOrderBy(searchParams.sort, searchParams.order),
      skip: (pagina - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        titulo: true,
        status: true,
        prazoDesfecho: true,
        prazoAlterado: true,
        criadoEm: true,
        solicitante: { select: { nome: true } },
        responsavel: { select: { nome: true } },
        area: { select: { nome: true } },
      },
    }),
    prisma.demanda.count({ where }),
    prisma.demanda.groupBy({
      by: ['status'],
      where: { gabineteId: gabinete.id, deletedAt: null },
      _count: { id: true },
    }),
    prisma.areaDemanda.findMany({ where: { gabineteId: gabinete.id }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.pessoa.findMany({ where: { gabineteId: gabinete.id, isMobilizador: true, isColaborador: true, deletedAt: null }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.regiao.findMany({ where: { gabineteId: gabinete.id, ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.demanda.groupBy({
      by: ['status'],
      where: { gabineteId: gabinete.id, deletedAt: null, criadoEm: { gte: inicioMes, lte: fimMes } },
      _count: { id: true },
    }),
  ])

  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  const contagemPorStatus = Object.fromEntries(contagens.map((c) => [c.status, c._count.id]))

  const contagemMes = Object.fromEntries(contagensMes.map((c) => [c.status, c._count.id]))
  const barrasDemandas = [
    { status: 'aberta',       label: 'Em aberto',    bgClass: 'bg-yellow-400', count: contagemMes['aberta']       ?? 0 },
    { status: 'expirada',     label: 'Expirada',     bgClass: 'bg-orange-400', count: contagemMes['expirada']     ?? 0 },
    { status: 'atendida',     label: 'Atendida',     bgClass: 'bg-green-500',  count: contagemMes['atendida']     ?? 0 },
    { status: 'nao_atendida', label: 'Não atendida', bgClass: 'bg-red-400',    count: contagemMes['nao_atendida'] ?? 0 },
  ].map((b) => ({
    ...b,
    href: `/${params.slug}/admin/demandas?status=${b.status}&dataInicio=${dataInicioStr}&dataFim=${dataFimStr}`,
  }))
  const totalPrazoAlterado = await prisma.demanda.count({ where: { gabineteId: gabinete.id, deletedAt: null, prazoAlterado: true } })

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Demandas</h1>
        <Link
          href={`/${params.slug}/admin/demandas/nova`}
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          + Nova demanda
        </Link>
      </div>

      <GraficoDemandas barras={barrasDemandas} mesLabel={mesLabel} />

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { key: 'aberta', label: 'Em aberto', cor: 'text-yellow-600' },
          { key: 'expirada', label: 'Expiradas', cor: 'text-orange-600' },
          { key: 'atendida', label: 'Atendidas', cor: 'text-green-600' },
          { key: 'nao_atendida', label: 'Não atendidas', cor: 'text-red-600' },
        ].map(({ key, label, cor }) => (
          <div key={key} className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${cor}`}>{contagemPorStatus[key] ?? 0}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium">Prazo alterado</p>
          <p className="text-2xl font-bold mt-1 text-gray-700">{totalPrazoAlterado}</p>
        </div>
      </div>

      {/*
      Filtros - OCULTADO a pedido do usuario em 15/07/2026
      Spec: docs/superpowers/specs/2026-07-15-demandas-listagem-sort-e-filtros-design.md

      A lógica de dados (where/temFiltro no topo deste arquivo) continua ativa e
      respondendo aos mesmos parâmetros de URL (usados pelos links do Dashboard,
      ex. clique numa fatia de "Demandas do mês") - só este formulário visual foi
      ocultado. Para reativar, remova este comentário e descomente o form abaixo.

      <form method="GET" className="bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <select name="status" defaultValue={searchParams.status ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos os status</option>
            <option value="aberta">Em aberto</option>
            <option value="expirada">Expirada</option>
            <option value="atendida">Atendida</option>
            <option value="nao_atendida">Não atendida</option>
          </select>

          <select name="areaId" defaultValue={searchParams.areaId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas as áreas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>

          <select name="responsavelId" defaultValue={searchParams.responsavelId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos os responsáveis</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>

          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas as regiões</option>
            {regioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>

          <select name="prazoAlterado" defaultValue={searchParams.prazoAlterado ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Prazo alterado: todos</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>

          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="px-4 py-1.5 rounded-md text-sm"
          >
            Filtrar
          </button>
        </div>

        <div className="flex gap-3 mt-3">
          <input name="dataInicio" type="date" defaultValue={searchParams.dataInicio ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input name="dataFim" type="date" defaultValue={searchParams.dataFim ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <a href={`/${params.slug}/admin/demandas`} className="text-sm text-gray-500 hover:text-gray-700 self-center">
            Limpar filtros
          </a>
        </div>
      </form>
      */}

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Solicitante" field="solicitante" />
              </th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Responsável" field="responsavel" />
              </th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Área" field="area" />
              </th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Prazo" field="prazoDesfecho" />
              </th>
              <th className="text-left px-4 py-3">
                <SortableHeader label="Status" field="status" />
              </th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {demandas.map((d) => {
              const cfg = STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG] ?? { label: d.status, cor: 'bg-gray-100 text-gray-800' }
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/${params.slug}/admin/demandas/${d.id}`} className="text-blue-600 hover:underline font-medium">
                      {d.titulo}
                      {d.prazoAlterado && <span className="ml-1 text-xs text-orange-500">⚑</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.solicitante.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{d.responsavel.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{d.area.nome}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {d.prazoDesfecho.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cor}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/${params.slug}/admin/demandas/${d.id}`} aria-label={`Editar ${d.titulo}`}>
                        <IconeEditar />
                      </Link>
                      <ExcluirDemandaButton slug={params.slug} demandaId={d.id} titulo={d.titulo} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {demandas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nenhuma demanda encontrada</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/${params.slug}/admin/demandas?${new URLSearchParams({ ...Object.fromEntries(Object.entries(searchParams).filter(([k, v]) => k !== 'pagina' && v)), pagina: String(p) }).toString()}`}
              style={p === pagina ? { backgroundColor: gabinete.corPrimaria, color: corTexto } : undefined}
              className={`px-3 py-1 rounded text-sm ${p === pagina ? '' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
