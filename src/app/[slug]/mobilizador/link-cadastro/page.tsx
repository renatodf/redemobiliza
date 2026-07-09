import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { getAppUrl } from '@/lib/app-url'

export default async function MobilizadorLinkCadastroPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) notFound()

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, nome: true, tokenMobilizador: true },
  })
  if (!pessoa || !pessoa.tokenMobilizador) notFound()

  const segmentos = await prisma.segmento.findMany({
    where: { gabineteId: gabinete.id, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, slug: true },
  })

  const appUrl = getAppUrl()

  const linksSegmentos = await Promise.all(
    segmentos.map(async (seg) => {
      const link = `${appUrl}/${params.slug}/cadastro/${seg.slug}?m=${pessoa.tokenMobilizador}`
      const [qrPngDataUrl, qrTransparenteDataUrl] = await Promise.all([
        QRCode.toDataURL(link, { width: 300, margin: 2 }),
        QRCode.toDataURL(link, { width: 300, margin: 2, color: { light: '#ffffff00' } }),
      ])
      return { ...seg, link, qrPngDataUrl, qrTransparenteDataUrl }
    })
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Link de Cadastro</h1>
        <p className="text-sm text-gray-600 mt-1">
          Copie o link abaixo e envie aos seus contatos. Todos que se cadastrarem por
          ele entram automaticamente na sua rede.
        </p>
      </div>

      {linksSegmentos.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum segmento ativo no momento.</p>
      ) : (
        <div className="space-y-6">
          {linksSegmentos.map((seg) => (
            <div key={seg.id} className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-gray-800">{seg.nome}</h2>
              <div>
                <p className="text-xs text-gray-500 mb-1">Seu link personalizado</p>
                <p className="text-sm text-blue-600 break-all">{seg.link}</p>
                <a
                  href={seg.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 text-xs text-blue-600 underline"
                >
                  Abrir link
                </a>
              </div>
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seg.qrPngDataUrl} alt={`QR Code — ${seg.nome}`} className="w-48 h-48" />
                <div className="flex gap-4">
                  <a
                    href={seg.qrPngDataUrl}
                    download={`qr-${params.slug}-${seg.slug}.png`}
                    className="text-xs text-blue-600 underline"
                  >
                    Baixar PNG
                  </a>
                  <a
                    href={seg.qrTransparenteDataUrl}
                    download={`qr-${params.slug}-${seg.slug}-transparente.png`}
                    className="text-xs text-blue-600 underline"
                  >
                    Baixar PNG transparente
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
