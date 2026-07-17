'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { Prisma } from '@/generated/prisma/client'

export async function criarAreaColocacao(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.areaColocacao.findFirst({
      where: { gabineteId: gabinete.id, nome },
    })

    if (existente) {
      if (existente.status === 'ativa') {
        return { erro: `Já existe uma área ativa com esse nome: "${existente.nome}"` }
      }
      await prisma.areaColocacao.update({
        where: { id: existente.id },
        data: { status: 'ativa' },
      })
    } else {
      await prisma.areaColocacao.create({
        data: { nome, gabineteId: gabinete.id, status: 'ativa' },
      })
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: `Já existe uma área ativa com esse nome: "${nome}"` }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar área' }
  }

  revalidatePath(`/${slug}/admin/configuracoes/areas-colocacao`)
  return {}
}
