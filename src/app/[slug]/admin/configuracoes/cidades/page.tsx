import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { desativarRegiao } from '@/actions/admin/desativar-regiao'
import CriarRegiaoForm from '@/components/admin/CriarRegiaoForm'
import EditarCidadeDialog from './EditarCidadeDialog'

export default async function CidadesConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  const regioes = await prisma.regiao.findMany({
    where: { gabineteId: gabinete.id, ativa: true },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, uf: true, latitude: true, longitude: true },
  })

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">Cidades</h2>
      <CriarRegiaoForm slug={params.slug} corPrimaria={gabinete.corPrimaria} corTexto={corTexto} />
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {regioes.map((r) => {
          const temCoordenada = r.latitude != null && r.longitude != null
          return (
            <li key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${temCoordenada ? 'bg-green-500' : 'bg-gray-300'}`}
                  title={temCoordenada ? 'No mapa' : 'Sem localização'}
                />
                <span className="text-sm truncate">
                  {r.nome}
                  {r.uf ? ` (${r.uf})` : ''}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <EditarCidadeDialog
                  slug={params.slug}
                  regiaoId={r.id}
                  nomeAtual={r.nome}
                  ufAtual={r.uf}
                  corPrimaria={gabinete.corPrimaria}
                />
                <form action={desativarRegiao}>
                  <input type="hidden" name="slug" value={params.slug} />
                  <input type="hidden" name="regiaoId" value={r.id} />
                  <button type="submit" className="text-red-600 text-xs hover:underline">Desativar</button>
                </form>
              </div>
            </li>
          )
        })}
        {regioes.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Nenhuma cidade cadastrada</li>
        )}
      </ul>
    </div>
  )
}
