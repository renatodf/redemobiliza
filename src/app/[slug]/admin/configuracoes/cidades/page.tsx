import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarRegiao } from '@/actions/admin/criar-regiao'
import { desativarRegiao } from '@/actions/admin/desativar-regiao'

export default async function CidadesConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const regioes = await prisma.regiao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Cidades</h2>
      <form action={criarRegiao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova cidade"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Adicionar
        </button>
      </form>
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {regioes.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{r.nome}</span>
            <form action={desativarRegiao}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="regiaoId" value={r.id} />
              <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
            </form>
          </li>
        ))}
        {regioes.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma cidade cadastrada</li>
        )}
      </ul>
    </div>
  )
}
