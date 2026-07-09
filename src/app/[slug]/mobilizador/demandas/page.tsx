import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'

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
  searchParams: { status?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const { pessoa } = await assertMobilizadorAccess(params.slug)

  const demandas = await prisma.demanda.findMany({
    where: {
      gabineteId: gabinete.id,
      deletedAt: null,
      responsavelId: pessoa.id,
      ...(searchParams.status ? { status: searchParams.status } : {}),
    },
    orderBy: { prazoDesfecho: 'asc' },
    select: {
      id: true,
      titulo: true,
      status: true,
      prazoDesfecho: true,
      prazoAlterado: true,
      solicitante: { select: { nome: true } },
      area: { select: { nome: true } },
    },
  })

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
                  <td className="px-4 py-3 text-gray-600">{d.solicitante.nome}</td>
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
