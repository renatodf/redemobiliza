'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Em aberto',
  expirada: 'Expirada',
  atendida: 'Atendida',
  nao_atendida: 'Não atendida',
}

export async function alterarStatusDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const novoStatus = formData.get('novoStatus') as string

  if (!Object.keys(STATUS_LABELS).includes(novoStatus)) return { erro: 'Status inválido' }

  const { session, gabinete } = await assertAdminAccess(slug)

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true, nome: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
    select: { status: true },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }
  if (demanda.status === novoStatus) return {}

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { status: novoStatus },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'status_alterado',
      descricao: `Status alterado de ${STATUS_LABELS[demanda.status] ?? demanda.status} para ${STATUS_LABELS[novoStatus]} por ${pessoa.nome}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  revalidatePath(`/${slug}/admin/demandas`)
  return {}
}
