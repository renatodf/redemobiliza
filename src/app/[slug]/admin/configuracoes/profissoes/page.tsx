import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { criarProfissao } from '@/actions/admin/criar-profissao'
import { desativarProfissao } from '@/actions/admin/desativar-profissao'

export default async function ProfissoesConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const profissoes = await prisma.profissao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Profissões</h2>
      <form action={criarProfissao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova profissão"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          Adicionar
        </button>
      </form>
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {profissoes.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{p.nome}</span>
            <form action={desativarProfissao}>
              <input type="hidden" name="slug" value={params.slug} />
              <input type="hidden" name="profissaoId" value={p.id} />
              <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
            </form>
          </li>
        ))}
        {profissoes.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma profissão ativa</li>
        )}
      </ul>
    </div>
  )
}
