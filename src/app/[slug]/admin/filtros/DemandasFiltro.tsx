// src/app/[slug]/admin/filtros/DemandasFiltro.tsx
import Pagination from '@/components/admin/Pagination'
import VisualizarDadosGeraisDemandasButton from '@/components/admin/VisualizarDadosGeraisDemandasButton'
import { statusDemandaPill } from '@/lib/status-demanda'

type DemandaLinha = {
  id: string
  titulo: string
  status: string
  prazoDesfecho: Date
  area: { nome: string }
  solicitante: { nome: string }
  responsavel: { nome: string }
}

export default function DemandasFiltro({
  baseHref,
  dashboardHref,
  exportarHref,
  searchParams,
  demandas,
  totalFiltrado,
  paginaAtual,
  tamanhoPagina,
  areas,
  regioes,
  corPrimaria,
}: {
  baseHref: string
  dashboardHref: string
  exportarHref: string
  searchParams: Record<string, string | undefined>
  demandas: DemandaLinha[]
  totalFiltrado: number
  paginaAtual: number
  tamanhoPagina: number
  areas: { id: string; nome: string }[]
  regioes: { id: string; nome: string }[]
  corPrimaria: string
}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== 'page') qs.set(k, v)
  }
  const queryAtual = qs.toString()
  const separador = queryAtual ? '&' : ''

  return (
    <div className="space-y-4">
      <form method="get" action={baseHref} className="flex flex-wrap items-end gap-3 bg-gray-50 p-4 rounded-lg">
        <div>
          <label className="block text-xs font-medium text-gray-600">Área</label>
          <select name="areaId" defaultValue={searchParams.areaId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Status</label>
          <select name="status" defaultValue={searchParams.status ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="atendida">Atendida</option>
            <option value="nao_atendida">Não atendida</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Região</label>
          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Data início</label>
          <input type="date" name="dataInicio" defaultValue={searchParams.dataInicio ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Data fim</label>
          <input type="date" name="dataFim" defaultValue={searchParams.dataFim ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria }}
          className="text-white text-sm px-4 py-1.5 rounded-md font-medium hover:opacity-90"
        >
          Filtrar
        </button>
        <a
          href={baseHref}
          className="text-sm text-gray-500 underline px-2 py-1.5 hover:text-gray-700"
        >
          Limpar filtro
        </a>
      </form>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} demanda(s) encontrada(s)</p>
        <div className="flex gap-2">
          <VisualizarDadosGeraisDemandasButton dashboardHref={dashboardHref} searchParams={searchParams} corPrimaria={corPrimaria} />
          <a
            href={`${exportarHref}?${queryAtual}${separador}formato=pdf`}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Exportar PDF
          </a>
          <a
            href={`${exportarHref}?${queryAtual}${separador}formato=excel`}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Exportar Excel
          </a>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Título</th>
              <th className="py-2 pr-3">Área</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Solicitante</th>
              <th className="py-2 pr-3">Responsável</th>
              <th className="py-2 pr-3">Prazo</th>
            </tr>
          </thead>
          <tbody>
            {demandas.map((d) => {
              const pill = statusDemandaPill(d.status)
              return (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{d.titulo}</td>
                  <td className="py-2 pr-3">{d.area.nome}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${pill.corClasse}`}>{pill.label}</span>
                  </td>
                  <td className="py-2 pr-3">{d.solicitante.nome}</td>
                  <td className="py-2 pr-3">{d.responsavel.nome}</td>
                  <td className="py-2 pr-3">{d.prazoDesfecho.toLocaleDateString('pt-BR')}</td>
                </tr>
              )
            })}
            {demandas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">Nenhuma demanda encontrada com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItens={totalFiltrado}
        paginaAtual={paginaAtual}
        tamanhoPagina={tamanhoPagina}
        baseUrl={baseHref}
        searchParams={searchParams}
        corPrimaria={corPrimaria}
      />
    </div>
  )
}
