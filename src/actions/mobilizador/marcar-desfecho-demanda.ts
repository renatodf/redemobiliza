'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'

export async function marcarDesfechoDemandaMobilizador(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const desfecho = formData.get('desfecho') as 'atendida' | 'nao_atendida'

  if (!['atendida', 'nao_atendida'].includes(desfecho)) return { erro: 'Desfecho inválido' }

  const { gabinete, pessoa } = await assertMobilizadorAccess(slug)

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id, responsavelId: pessoa.id },
  })
  if (!demanda) return { erro: 'Demanda não encontrada ou sem permissão' }
  if (demanda.status !== 'aberta' && demanda.status !== 'expirada') {
    return { erro: 'Apenas demandas abertas ou expiradas podem ser encerradas' }
  }

  await prisma.demanda.update({ where: { id: demandaId, gabineteId: gabinete.id }, data: { status: desfecho } })
  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'status_alterado',
      descricao: desfecho === 'atendida' ? `Marcada como atendida por ${pessoa.nome}` : `Marcada como não atendida por ${pessoa.nome}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/mobilizador/demandas/${demandaId}`)
  revalidatePath(`/${slug}/mobilizador`)
  return {}
}
