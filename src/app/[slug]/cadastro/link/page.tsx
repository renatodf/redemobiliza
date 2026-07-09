import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import CadastroForm from '../[segmentoSlug]/CadastroForm'

export default async function CadastroLinkPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { segmentos?: string; m?: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete || !gabinete.ativo) notFound()

  const segmentoSlugs = (searchParams.segmentos ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Link fixo do mobilizador não tem segmento nenhum — só ?m=token. Só é 404
  // se não há segmento E não há token de mobilizador (link vazio, sem sentido).
  if (segmentoSlugs.length === 0 && !searchParams.m) notFound()

  // Se todos os slugs informados forem inválidos/obsoletos mas houver ?m=,
  // segue mesmo assim com lista vazia — o vínculo com o mobilizador é o que
  // importa nesse caso, não os segmentos obsoletos.
  const segmentosValidos = segmentoSlugs.length > 0
    ? await prisma.segmento.findMany({
        where: { gabineteId: gabinete.id, slug: { in: segmentoSlugs }, status: 'ativo' },
        select: { slug: true },
      })
    : []
  if (segmentoSlugs.length > 0 && segmentosValidos.length === 0 && !searchParams.m) notFound()

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
          <h1 className="text-xl font-bold text-gray-900">Cadastro</h1>
        </div>

        <CadastroForm
          slug={params.slug}
          segmentoSlugs={segmentosValidos.map((s) => s.slug)}
          mobilizadorToken={searchParams.m}
          sucessoUrl={`/${params.slug}/cadastro/link/sucesso`}
          regioes={regioes}
          profissoes={profissoes}
        />
      </div>
    </div>
  )
}
