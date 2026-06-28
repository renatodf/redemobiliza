import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarAreaDemanda } from '@/actions/admin/criar-area-demanda'
import { excluirAreaDemanda } from '@/actions/admin/excluir-area-demanda'

export default async function AreasPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const areas = await prisma.areaDemanda.findMany({
    where: { gabineteId: gabinete.id },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, _count: { select: { demandas: true } } },
  })

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Áreas de Demanda</h1>

      <form action={criarAreaDemanda} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova área"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Criar
        </button>
      </form>

      <ul className="divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
        {areas.map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-900">
              {a.nome}
              <span className="ml-2 text-xs text-gray-400">({a._count.demandas} demandas)</span>
            </span>
            {a._count.demandas === 0 && (
              <form action={excluirAreaDemanda}>
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="areaId" value={a.id} />
                <button type="submit" className="text-red-600 text-xs hover:underline">
                  Excluir
                </button>
              </form>
            )}
          </li>
        ))}
        {areas.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma área cadastrada</li>
        )}
      </ul>
    </div>
  )
}
