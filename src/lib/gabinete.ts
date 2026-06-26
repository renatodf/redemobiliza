import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'

export const getGabineteBySlug = cache(async (slug: string) => {
  return prisma.gabinete.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      ativo: true,
      nomeSistema: true,
      corPrimaria: true,
      corSecundaria: true,
      logoUrl: true,
      imagemBannerUrl: true,
    },
  })
})
