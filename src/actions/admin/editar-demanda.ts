'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function editarDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const titulo = (formData.get('titulo') as string).trim()
  const descricao = (formData.get('descricao') as string).trim()
  const areaId = formData.get('areaId') as string

  if (!titulo || !descricao || !areaId) return { erro: 'Preencha todos os campos obrigatórios' }

  const { session, gabinete } = await assertAdminAccess(slug)

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true, nome: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
    select: { titulo: true, descricao: true, areaId: true },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }

  const areaCheck = await prisma.areaDemanda.findFirst({
    where: { id: areaId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!areaCheck) return { erro: 'Área não encontrada' }

  const camposAlterados: string[] = []
  if (demanda.titulo !== titulo) camposAlterados.push('título')
  if (demanda.descricao !== descricao) camposAlterados.push('descrição')
  if (demanda.areaId !== areaId) camposAlterados.push('área')

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { titulo, descricao, areaId },
  })

  if (camposAlterados.length > 0) {
    await prisma.movimentacaoDemanda.create({
      data: {
        demandaId,
        tipo: 'dados_editados',
        descricao: `Dados editados por ${pessoa.nome}: ${camposAlterados.join(', ')} alterado(s)`,
        autorId: pessoa.id,
      },
    })
  }

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  revalidatePath(`/${slug}/admin/demandas`)
  return {}
}
