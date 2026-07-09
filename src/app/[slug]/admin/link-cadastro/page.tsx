import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import GerarLinkForm from './GerarLinkForm'

export default async function AdminLinkCadastroPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const [segmentos, mobilizadores] = await Promise.all([
    prisma.segmento.findMany({
      where: { gabineteId: gabinete.id, status: 'ativo' },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.pessoa.findMany({
      where: { gabineteId: gabinete.id, isMobilizador: true, deletedAt: null },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-[rgba(113,113,113,0.65)]">Início / Link de Cadastro</p>
      <h1 className="text-2xl font-bold text-gray-900 -mt-3">Link de Cadastro</h1>
      <p className="text-sm text-gray-600">
        Escolha um ou mais segmentos e, se quiser, a rede de um mobilizador específico.
        Quem se cadastrar pelo link gerado entra direto nessa rede (ou na Rede Raiz, se
        nenhuma for escolhida) e já fica marcado nos segmentos selecionados.
      </p>

      <GerarLinkForm
        slug={params.slug}
        segmentos={segmentos}
        mobilizadores={mobilizadores}
        corPrimaria={gabinete.corPrimaria}
      />
    </div>
  )
}
