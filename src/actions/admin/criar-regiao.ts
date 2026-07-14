'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { geocodificarRegiao } from '@/lib/geocodificar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'

export async function criarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const uf = formData.get('uf') as string
  if (!nome) throw new Error('Nome é obrigatório')
  if (!ESTADOS_BR.some((e) => e.sigla === uf)) throw new Error('UF inválida')

  const { gabinete } = await assertAdminAccess(slug)

  const regiao = await prisma.regiao.create({
    data: { nome, uf, gabineteId: gabinete.id, ativa: true },
  })

  const coordenada = await geocodificarRegiao(nome, uf)
  if (coordenada) {
    await prisma.regiao.update({
      where: { id: regiao.id },
      data: { latitude: coordenada.latitude, longitude: coordenada.longitude },
    })
  }

  revalidatePath(`/${slug}/admin/configuracoes/cidades`)
  revalidatePath(`/${slug}/admin/dashboard`)
}
