import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import CriarProfissaoForm from '@/components/admin/CriarProfissaoForm'
import { desativarProfissao } from '@/actions/admin/desativar-profissao'

export default async function ProfissoesConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const profissoes = await prisma.profissao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Profissões</h2>
      <CriarProfissaoForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
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
