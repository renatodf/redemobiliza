import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { criarSegmento } from '@/actions/admin/criar-segmento'
import { inativarSegmento } from '@/actions/admin/inativar-segmento'

export default async function SegmentosConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Segmentos</h2>
      <form action={criarSegmento} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome do novo segmento"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Criar
        </button>
      </form>
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
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
              <button type="submit" className="text-red-600 text-xs hover:underline">Inativar</button>
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
