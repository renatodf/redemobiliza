'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'

export async function alterarPrazoDemandaMobilizador(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const novoPrazo = formData.get('novoPrazo') as string
  const justificativa = (formData.get('justificativa') as string).trim()

  if (!novoPrazo) return { erro: 'Informe o novo prazo' }
  if (!justificativa) return { erro: 'Justificativa é obrigatória' }

  const { gabinete, pessoa } = await assertMobilizadorAccess(slug)

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id, responsavelId: pessoa.id },
    select: { prazoDesfecho: true, status: true },
  })
  if (!demanda) return { erro: 'Demanda não encontrada ou sem permissão' }
  if (demanda.status !== 'aberta' && demanda.status !== 'expirada') {
    return { erro: 'Apenas demandas abertas ou expiradas podem ter o prazo alterado' }
  }

  const prazoNovo = new Date(novoPrazo)
  await prisma.demanda.update({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { prazoDesfecho: prazoNovo, prazoAlterado: true, observacao: justificativa },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'prazo_alterado',
      descricao: `Prazo alterado para ${prazoNovo.toLocaleDateString('pt-BR')}. Justificativa: ${justificativa}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/mobilizador/demandas/${demandaId}`)
  return {}
}
