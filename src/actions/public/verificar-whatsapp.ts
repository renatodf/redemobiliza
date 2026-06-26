'use server'

import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { normalizeWhatsApp } from '@/lib/whatsapp'

export async function verificarWhatsApp(
  slug: string,
  whatsappRaw: string
): Promise<{ existe: boolean; erro?: string }> {
  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete || !gabinete.ativo) return { existe: false, erro: 'Gabinete não encontrado' }

  const whatsapp = normalizeWhatsApp(whatsappRaw)
  if (!whatsapp) return { existe: false, erro: 'Número de WhatsApp inválido' }

  const pessoa = await prisma.pessoa.findUnique({
    where: { gabineteId_whatsapp: { gabineteId: gabinete.id, whatsapp } },
    select: { id: true },
  })

  return { existe: !!pessoa }
}
