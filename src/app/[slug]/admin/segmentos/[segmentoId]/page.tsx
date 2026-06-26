import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export default async function SegmentoDetalhePage({
  params,
}: {
  params: { slug: string; segmentoId: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const segmento = await prisma.segmento.findFirst({
    where: { id: params.segmentoId, gabineteId: gabinete.id, status: 'ativo' },
    select: { id: true, nome: true, slug: true },
  })
  if (!segmento) notFound()

  const linkCadastro = `${process.env.NEXT_PUBLIC_APP_URL}/${params.slug}/cadastro/${segmento.slug}`

  const qrDataUrl = await QRCode.toDataURL(linkCadastro, { width: 256, margin: 2 })

  return (
    <div className="max-w-md mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">{segmento.nome}</h1>

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <p className="text-sm font-medium text-gray-700">Link de cadastro público</p>
        <p className="text-sm text-blue-600 break-all">{linkCadastro}</p>
        <a
          href={linkCadastro}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-blue-600 underline"
        >
          Abrir link
        </a>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm flex flex-col items-center gap-4">
        <p className="text-sm font-medium text-gray-700">QR Code</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`QR Code — ${segmento.nome}`} className="w-64 h-64" />
        <a
          href={qrDataUrl}
          download={`qr-${segmento.slug}.png`}
          className="text-sm text-blue-600 underline"
        >
          Baixar QR Code
        </a>
      </div>
    </div>
  )
}
