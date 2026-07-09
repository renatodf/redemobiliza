'use server'

import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { getAppUrl } from '@/lib/app-url'

export type GerarLinkCadastroState = {
  erro?: string
  link?: string
  qrPngDataUrl?: string
  qrTransparenteDataUrl?: string
}

export async function gerarLinkCadastro(
  _prevState: GerarLinkCadastroState,
  formData: FormData
): Promise<GerarLinkCadastroState> {
  const slug = formData.get('slug') as string
  const segmentoIds = formData.getAll('segmentoIds') as string[]
  const mobilizadorPessoaId = (formData.get('mobilizadorPessoaId') as string) || null

  if (segmentoIds.length === 0) return { erro: 'Selecione ao menos um segmento.' }

  const { gabinete } = await assertAdminAccess(slug)

  const segmentos = await prisma.segmento.findMany({
    where: { id: { in: segmentoIds }, gabineteId: gabinete.id, status: 'ativo' },
    select: { slug: true },
  })
  if (segmentos.length === 0) return { erro: 'Nenhum segmento válido selecionado.' }

  let token: string | null = null
  if (mobilizadorPessoaId) {
    const mobilizador = await prisma.pessoa.findFirst({
      where: { id: mobilizadorPessoaId, gabineteId: gabinete.id, isMobilizador: true },
      select: { tokenMobilizador: true },
    })
    if (!mobilizador?.tokenMobilizador) return { erro: 'Mobilizador inválido.' }
    token = mobilizador.tokenMobilizador
  }

  const appUrl = getAppUrl()
  const segmentosParam = segmentos.map((s) => s.slug).join(',')
  const link = `${appUrl}/${slug}/cadastro/link?segmentos=${encodeURIComponent(segmentosParam)}${token ? `&m=${token}` : ''}`

  const [qrPngDataUrl, qrTransparenteDataUrl] = await Promise.all([
    QRCode.toDataURL(link, { width: 300, margin: 2 }),
    QRCode.toDataURL(link, { width: 300, margin: 2, color: { light: '#ffffff00' } }),
  ])

  return { link, qrPngDataUrl, qrTransparenteDataUrl }
}
