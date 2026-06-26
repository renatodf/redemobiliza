'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { toSlug } from '@/lib/slug'

export async function criarSegmento(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const { gabinete } = await assertAdminAccess(slug)

  const segmentoSlug = toSlug(nome)

  const existente = await prisma.segmento.findFirst({
    where: { gabineteId: gabinete.id, slug: segmentoSlug, status: 'ativo' },
  })
  if (existente) {
    throw new Error(`Já existe um segmento ativo com nome similar: "${existente.nome}"`)
  }

  await prisma.segmento.create({
    data: { nome, slug: segmentoSlug, gabineteId: gabinete.id, tipo: 'geral', status: 'ativo' },
  })

  revalidatePath(`/${slug}/admin/segmentos`)
}
