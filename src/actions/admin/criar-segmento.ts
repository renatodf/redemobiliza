'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { toSlug } from '@/lib/slug'
import { Prisma } from '@/generated/prisma/client'

export async function criarSegmento(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  const segmentoSlug = toSlug(nome)

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.segmento.findFirst({
      where: { gabineteId: gabinete.id, slug: segmentoSlug, status: 'ativo' },
    })
    if (existente) {
      return { erro: `Já existe um segmento ativo com nome similar: "${existente.nome}"` }
    }

    await prisma.segmento.create({
      data: { nome, slug: segmentoSlug, gabineteId: gabinete.id, tipo: 'geral', status: 'ativo' },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: `Já existe um segmento ativo com nome similar: "${nome}"` }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar segmento' }
  }

  revalidatePath(`/${slug}/admin/segmentos`)
  revalidatePath(`/${slug}/admin/configuracoes/segmentos`)
  return {}
}
