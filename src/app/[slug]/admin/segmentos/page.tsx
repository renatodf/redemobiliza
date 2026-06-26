import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarSegmento } from '@/actions/admin/criar-segmento'
import { inativarSegmento } from '@/actions/admin/inativar-segmento'

export default async function SegmentosPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, slug: true },
  })

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Segmentos</h1>

      <form action={criarSegmento} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome do novo segmento"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Criar
        </button>
      </form>

      <ul className="divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
        {segmentos.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3">
            <Link
              href={`/${params.slug}/admin/segmentos/${s.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              {s.nome}
            </Link>
            <form action={inativarSegmento}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="segmentoId" value={s.id} />
              <button type="submit" className="text-red-600 text-xs hover:underline">
                Inativar
              </button>
            </form>
          </li>
        ))}
        {segmentos.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhum segmento ativo</li>
        )}
      </ul>
    </div>
  )
}
