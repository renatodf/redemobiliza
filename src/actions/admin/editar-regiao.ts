'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { geocodificarRegiao } from '@/lib/geocodificar-regiao'
import { ESTADOS_BR } from '@/lib/estados-br'

export async function editarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const regiaoId = formData.get('regiaoId') as string
  const nome = (formData.get('nome') as string).trim()
  const uf = formData.get('uf') as string
  if (!nome) throw new Error('Nome é obrigatório')
  if (!ESTADOS_BR.some((e) => e.sigla === uf)) throw new Error('UF inválida')

  const { gabinete } = await assertAdminAccess(slug)

  const atual = await prisma.regiao.findFirst({
    where: { id: regiaoId, gabineteId: gabinete.id },
    select: { nome: true, uf: true },
  })
  if (!atual) throw new Error('Região não encontrada')

  const mudouLocalizacao = atual.nome !== nome || atual.uf !== uf

  if (!mudouLocalizacao) {
    await prisma.regiao.update({ where: { id: regiaoId }, data: { nome, uf } })
    revalidatePath(`/${slug}/admin/configuracoes/cidades`)
    revalidatePath(`/${slug}/admin/dashboard`)
    return
  }

  const coordenada = await geocodificarRegiao(nome, uf)
  await prisma.regiao.update({
    where: { id: regiaoId },
    data: {
      nome,
      uf,
      latitude: coordenada?.latitude ?? null,
      longitude: coordenada?.longitude ?? null,
    },
  })

  revalidatePath(`/${slug}/admin/configuracoes/cidades`)
  revalidatePath(`/${slug}/admin/dashboard`)
}
