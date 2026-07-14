import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { criarRegiao } from '@/actions/admin/criar-regiao'
import { desativarRegiao } from '@/actions/admin/desativar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'
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
      <form action={criarRegiao} className="flex gap-2">
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="nome"
          required
          placeholder="Nome da nova cidade"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <select name="uf" required defaultValue="" className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="" disabled>UF...</option>
          {ESTADOS_BR.map((e) => (
            <option key={e.sigla} value={e.sigla}>{e.sigla}</option>
          ))}
        </select>
        <button
          type="submit"
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium"
        >
          Adicionar
        </button>
      </form>
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
