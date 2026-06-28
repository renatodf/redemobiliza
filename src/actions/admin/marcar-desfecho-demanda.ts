'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function marcarDesfechoDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const desfecho = formData.get('desfecho') as 'atendida' | 'nao_atendida'

  if (!['atendida', 'nao_atendida'].includes(desfecho)) return { erro: 'Desfecho inválido' }

  const { gabinete } = await assertAdminAccess(slug)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { erro: 'Não autenticado' }

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id },
    select: { id: true, nome: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }
  if (demanda.status !== 'aberta' && demanda.status !== 'expirada') {
    return { erro: 'Apenas demandas abertas ou expiradas podem ser encerradas' }
  }

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { status: desfecho },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'status_alterado',
      descricao: desfecho === 'atendida' ? `Demanda marcada como atendida por ${pessoa.nome}` : `Demanda marcada como não atendida por ${pessoa.nome}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  revalidatePath(`/${slug}/admin/demandas`)
  return {}
}
