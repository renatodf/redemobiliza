import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import CadastroForm from './CadastroForm'

export default async function CadastroPage({
  params,
  searchParams,
}: {
  params: { slug: string; segmentoSlug: string }
  searchParams: { m?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete || !gabinete.ativo) notFound()

  const segmento = await prisma.segmento.findFirst({
    where: { gabineteId: gabinete.id, slug: params.segmentoSlug, status: 'ativo' },
    select: { id: true, nome: true, descricao: true },
  })
  if (!segmento) notFound()

  const [regioes, profissoes] = await Promise.all([
    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.profissao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-8 space-y-6">
        {gabinete.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gabinete.logoUrl}
            alt={gabinete.nomeSistema}
            className="h-12 object-contain mx-auto"
          />
        )}
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">{segmento.nome}</h1>
          {segmento.descricao && (
            <p className="mt-1 text-sm text-gray-500">{segmento.descricao}</p>
          )}
        </div>

        <CadastroForm
          slug={params.slug}
          segmentoSlugs={[params.segmentoSlug]}
          mobilizadorToken={searchParams.m}
          sucessoUrl={`/${params.slug}/cadastro/${params.segmentoSlug}/sucesso`}
          regioes={regioes}
          profissoes={profissoes}
        />
      </div>
    </div>
  )
}
