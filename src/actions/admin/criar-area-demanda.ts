'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function criarAreaDemanda(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const { gabinete } = await assertAdminAccess(slug)

  const existente = await prisma.areaDemanda.findFirst({
    where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' } },
  })
  if (existente) throw new Error('Já existe uma área com esse nome')

  await prisma.areaDemanda.create({ data: { nome, gabineteId: gabinete.id } })
  revalidatePath(`/${slug}/admin/demandas/areas`)
}
