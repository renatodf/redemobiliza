'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { Prisma } from '@/generated/prisma/client'

export async function criarAreaDemanda(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.areaDemanda.findFirst({
      where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' } },
    })
    if (existente) return { erro: 'Já existe uma área com esse nome' }

    await prisma.areaDemanda.create({ data: { nome, gabineteId: gabinete.id } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: 'Já existe uma área com esse nome' }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar área' }
  }

  revalidatePath(`/${slug}/admin/demandas/areas`)
  revalidatePath(`/${slug}/admin/configuracoes/demandas`)
  return {}
}
