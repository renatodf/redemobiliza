'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { geocodificarRegiao } from '@/lib/geocodificar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'
import { Prisma } from '@/generated/prisma/client'

export async function criarRegiao(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const uf = formData.get('uf') as string
  if (!nome) return { erro: 'Nome é obrigatório' }
  if (!ESTADOS_BR.some((e) => e.sigla === uf)) return { erro: 'UF inválida' }

  let regiaoId: string

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const existente = await prisma.regiao.findFirst({
      where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' }, ativa: true },
    })
    if (existente) return { erro: `Já existe uma cidade ativa com esse nome: "${existente.nome}"` }

    const regiao = await prisma.regiao.create({
      data: { nome, uf, gabineteId: gabinete.id, ativa: true },
    })
    regiaoId = regiao.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { erro: `Já existe uma cidade ativa com esse nome: "${nome}"` }
    }
    return { erro: e instanceof Error ? e.message : 'Erro ao criar cidade' }
  }

  try {
    const coordenada = await geocodificarRegiao(nome, uf)
    if (coordenada) {
      await prisma.regiao.update({
        where: { id: regiaoId },
        data: { latitude: coordenada.latitude, longitude: coordenada.longitude },
      })
    }
  } catch (e) {
    console.error('[criarRegiao] falha na geocodificação — cidade criada sem coordenadas:', e)
  }

  revalidatePath(`/${slug}/admin/configuracoes/cidades`)
  revalidatePath(`/${slug}/admin/dashboard`)
  return {}
}
