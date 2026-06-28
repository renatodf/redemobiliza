'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertMobilizadorAccess } from '@/lib/assert-mobilizador-access'

export async function atualizarObservacaoDemandaMobilizador(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const observacao = (formData.get('observacao') as string).trim()

  const { gabinete, pessoa } = await assertMobilizadorAccess(slug)

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id, responsavelId: pessoa.id },
  })
  if (!demanda) return { erro: 'Demanda não encontrada ou sem permissão' }

  await prisma.demanda.update({ where: { id: demandaId, gabineteId: gabinete.id }, data: { observacao } })
  await prisma.movimentacaoDemanda.create({
    data: { demandaId, tipo: 'observacao', descricao: observacao, autorId: pessoa.id },
  })

  revalidatePath(`/${slug}/mobilizador/demandas/${demandaId}`)
  return {}
}
