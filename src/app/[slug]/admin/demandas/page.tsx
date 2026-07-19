import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { GraficoPizza, type FatiaPizza } from '@/components/GraficoPizza'
import { CORES_STATUS_DEMANDA, PALETA_CATEGORICA } from '@/lib/cores-graficos'
import { toggleLista } from '@/lib/toggle-lista'
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
    statusIds?: string
    areaIds?: string
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

  const statusSelecionados = searchParams.statusIds ? searchParams.statusIds.split(',').filter(Boolean) : []
  const areaSelecionadas = searchParams.areaIds ? searchParams.areaIds.split(',').filter(Boolean) : []

  const pagina = Math.max(1, Number(searchParams.pagina ?? 1))

  const whereBase = { gabineteId: gabinete.id, deletedAt: null }
  const where = {
    ...whereBase,
    ...(statusSelecionados.length > 0 ? { status: { in: statusSelecionados } } : {}),
    ...(areaSelecionadas.length > 0 ? { areaId: { in: areaSelecionadas } } : {}),
    ...(searchParams.responsavelId ? { responsavelId: searchParams.responsavelId } : {}),
    ...(searchParams.regiaoId ? { solicitante: { regiaoId: searchParams.regiaoId } } : {}),
    ...(searchParams.prazoAlterado ? { prazoAlterado: searchParams.prazoAlterado === 'sim' } : {}),
    ...(searchParams.dataInicio || searchParams.dataFim
      ? {
          criadoEm: {
            ...(searchParams.dataInicio ? { gte: new Date(`${searchParams.dataInicio}T00:00:00`) } : {}),
            ...(searchParams.dataFim ? { lte: new Date(`${searchParams.dataFim}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }
  const whereParaStatus = {
    ...whereBase,
    ...(areaSelecionadas.length > 0 ? { areaId: { in: areaSelecionadas } } : {}),
  }
  const whereParaArea = {
    ...whereBase,
    ...(statusSelecionados.length > 0 ? { status: { in: statusSelecionados } } : {}),
  }

  const [demandas, total, contagensStatus, contagensArea, areas] = await Promise.all([
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
    prisma.demanda.groupBy({ by: ['status'], where: whereParaStatus, _count: { id: true } }),
    prisma.demanda.groupBy({ by: ['areaId'], where: whereParaArea, _count: { id: true } }),
    prisma.areaDemanda.findMany({ where: { gabineteId: gabinete.id }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])

  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  const baseHref = `/${params.slug}/admin/demandas`
  function hrefComToggleStatus(chave: string): string {
    const novaLista = toggleLista(statusSelecionados, chave)
    const params2 = new URLSearchParams()
    if (novaLista.length > 0) params2.set('statusIds', novaLista.join(','))
    if (areaSelecionadas.length > 0) params2.set('areaIds', areaSelecionadas.join(','))
    const qs = params2.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }
  function hrefComToggleArea(id: string): string {
    const novaLista = toggleLista(areaSelecionadas, id)
    const params2 = new URLSearchParams()
    if (statusSelecionados.length > 0) params2.set('statusIds', statusSelecionados.join(','))
    if (novaLista.length > 0) params2.set('areaIds', novaLista.join(','))
    const qs = params2.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }

  const mapaStatus = Object.fromEntries(contagensStatus.map((c) => [c.status, c._count.id]))
  const STATUS_LABELS: { chave: string; label: string }[] = [
    { chave: 'aberta', label: 'Em aberto' },
    { chave: 'atendida', label: 'Atendida' },
    { chave: 'nao_atendida', label: 'Não atendida' },
    { chave: 'expirada', label: 'Expirada' },
  ]
  const fatiasStatus: FatiaPizza[] = STATUS_LABELS.map((s) => ({
    chave: s.chave,
    label: s.label,
    valor: mapaStatus[s.chave] ?? 0,
    cor: CORES_STATUS_DEMANDA[s.chave],
    href: hrefComToggleStatus(s.chave),
  }))

  const mapaArea = Object.fromEntries(contagensArea.map((c) => [c.areaId, c._count.id]))
  const fatiasArea: FatiaPizza[] = areas.map((a, i) => ({
    chave: a.id,
    label: a.nome,
    valor: mapaArea[a.id] ?? 0,
    cor: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length],
    href: hrefComToggleArea(a.id),
  }))

  const temFiltroAtivo = statusSelecionados.length > 0 || areaSelecionadas.length > 0

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

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {temFiltroAtivo ? 'Filtrado — clique numa fatia pra ajustar' : 'Clique numa fatia pra filtrar'}
        </p>
        {temFiltroAtivo && (
          <Link href={`/${params.slug}/admin/demandas`} className="text-sm text-gray-500 underline hover:text-gray-700">
            Limpar filtro
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GraficoPizza titulo="Status" fatias={fatiasStatus} />
        <GraficoPizza titulo="Área" fatias={fatiasArea} />
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
