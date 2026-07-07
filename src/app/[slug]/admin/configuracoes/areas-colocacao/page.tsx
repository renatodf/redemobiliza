import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarAreaColocacao } from '@/actions/admin/criar-area-colocacao'
import { desativarAreaColocacao } from '@/actions/admin/desativar-area-colocacao'

export default async function AreasColocacaoPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const areas = await prisma.areaColocacao.findMany({
    where: { gabineteId: gabinete.id, status: 'ativa' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Áreas de Colocação</h2>
      <p className="text-xs text-gray-500">
        Lista de áreas de interesse usada no cadastro do Banco de Talentos. Mantenha padronizada para facilitar os filtros.
      </p>
      <form action={criarAreaColocacao} className="flex gap-2">
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
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {areas.map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{a.nome}</span>
            <form action={desativarAreaColocacao}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="areaId" value={a.id} />
              <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
            </form>
          </li>
        ))}
        {areas.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma área cadastrada</li>
        )}
      </ul>
    </div>
  )
}
