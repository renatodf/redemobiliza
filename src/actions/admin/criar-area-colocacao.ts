'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function criarAreaColocacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const { gabinete } = await assertAdminAccess(slug)

  const existente = await prisma.areaColocacao.findFirst({
    where: { gabineteId: gabinete.id, nome },
  })

  if (existente) {
    if (existente.status === 'ativa') {
      throw new Error(`Já existe uma área ativa com esse nome: "${existente.nome}"`)
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

  revalidatePath(`/${slug}/admin/configuracoes/areas-colocacao`)
}
