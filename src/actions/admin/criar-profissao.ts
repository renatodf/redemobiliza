'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { Prisma } from '@/generated/prisma/client'

export async function criarProfissao(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) return { erro: 'Nome é obrigatório' }

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.profissao.findFirst({
      where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' }, ativa: true },
    })
    if (existente) return { erro: `Já existe uma profissão ativa com esse nome: "${existente.nome}"` }

    await prisma.profissao.create({
      data: { nome, gabineteId: gabinete.id, ativa: true },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: `Já existe uma profissão ativa com esse nome: "${nome}"` }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar profissão' }
  }

  revalidatePath(`/${slug}/admin/profissoes`)
  revalidatePath(`/${slug}/admin/configuracoes/profissoes`)
  return {}
}
