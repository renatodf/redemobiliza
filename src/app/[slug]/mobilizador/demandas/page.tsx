import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { corTextoContraste } from '@/lib/cor-contraste'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'
import { coletarSubRedeIds } from '@/lib/rede'

const STATUS_CONFIG = {
  aberta: { label: 'Em aberto', cor: 'bg-yellow-100 text-yellow-800' },
  expirada: { label: 'Expirada', cor: 'bg-orange-100 text-orange-800' },
  atendida: { label: 'Atendida', cor: 'bg-green-100 text-green-800' },
  nao_atendida: { label: 'Não atendida', cor: 'bg-red-100 text-red-800' },
} as const

export default async function MobilizadorDemandasPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { status?: string; dataInicio?: string; dataFim?: string }
}) {
  const resultado = await assertMobilizadorAccess(params.slug).catch(() => null)
  if (!resultado) notFound()
  const { gabinete, pessoa } = resultado
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const demandas = await prisma.demanda.findMany({
    where: {
      gabineteId: gabinete.id,
      deletedAt: null,
      responsavelId: pessoa.id,
      ...(searchParams.status ? { status: searchParams.status } : {}),
      // dataInicio/dataFim chegam via clique no gráfico de pizza de Demandas
      // do dashboard (Dados Gerais), que escopa ao mês atual — mesmo padrão
      // já usado em /admin/demandas.
      ...(searchParams.dataInicio || searchParams.dataFim
        ? {
            criadoEm: {
              ...(searchParams.dataInicio ? { gte: new Date(`${searchParams.dataInicio}T00:00:00`) } : {}),
              ...(searchParams.dataFim ? { lte: new Date(`${searchParams.dataFim}T23:59:59.999`) } : {}),
            },
          }
        : {}),
    },
    orderBy: { prazoDesfecho: 'asc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      prazoAlterado: true,
      solicitante: { select: { id: true, nome: true } },
      area: { select: { nome: true } },
    },
  })

  // coletarSubRedeIds exclui o próprio pessoa.id do resultado — inclui aqui
  // pra que uma demanda cujo solicitante é o próprio mobilizador também vire link.
  const idsRedeSolicitante = new Set([pessoa.id, ...(await coletarSubRedeIds(pessoa.id, gabinete.id))])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Demandas</h1>

      <form method="GET" className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3">
        <select name="status" defaultValue={searchParams.status ?? ''} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">Todos os status</option>
          <option value="aberta">Em aberto</option>
          <option value="expirada">Expirada</option>
          <option value="atendida">Atendida</option>
          <option value="nao_atendida">Não atendida</option>
        </select>
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-1.5 rounded-md text-sm"
        >
          Filtrar
        </button>
        {searchParams.status && (
          <a href={`/${params.slug}/mobilizador/demandas`} className="text-sm text-gray-500 hover:text-gray-700">
            Limpar filtro
          </a>
        )}
      </form>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Solicitante</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Área</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Prazo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {demandas.map((d) => {
              const cfg = STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG] ?? { label: d.status, cor: 'bg-gray-100 text-gray-800' }
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/${params.slug}/mobilizador/demandas/${d.id}`} className="text-blue-600 hover:underline font-medium">
                      {d.titulo}
                      {d.prazoAlterado && <span className="ml-1 text-xs text-orange-500">⚑</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {idsRedeSolicitante.has(d.solicitante.id) ? (
                      <Link href={`/${params.slug}/mobilizador/pessoas/${d.solicitante.id}`} className="hover:underline">
                        {d.solicitante.nome}
                      </Link>
                    ) : (
                      d.solicitante.nome
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.area.nome}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {d.prazoDesfecho.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cor}`}>
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              )
            })}
            {demandas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nenhuma demanda encontrada</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
