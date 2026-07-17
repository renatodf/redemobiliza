import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import CriarAreaDemandaForm from '@/components/admin/CriarAreaDemandaForm'
import { excluirAreaDemanda } from '@/actions/admin/excluir-area-demanda'
import { editarAreaDemanda } from '@/actions/admin/editar-area-demanda'

export default async function AreasPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const areas = await prisma.areaDemanda.findMany({
    where: { gabineteId: gabinete.id },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, _count: { select: { demandas: true } } },
  })

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Áreas de Demanda</h1>

      <CriarAreaDemandaForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />

      <ul className="divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
        {areas.map((a) => (
          <li key={a.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
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
            </div>
            <details className="mt-1">
              <summary className="cursor-pointer text-blue-600 text-xs hover:underline">Renomear</summary>
              <form action={editarAreaDemanda} className="mt-2 flex gap-2">
                <input type="hidden" name="slug" value={params.slug} />
                <input type="hidden" name="areaId" value={a.id} />
                <input
                  name="nome"
                  defaultValue={a.nome}
                  required
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                />
                <button
                  type="submit"
                  style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
                  className="px-3 py-1 rounded-md text-xs"
                >
                  Salvar
                </button>
              </form>
            </details>
          </li>
        ))}
        {areas.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma área cadastrada</li>
        )}
      </ul>
    </div>
  )
}
