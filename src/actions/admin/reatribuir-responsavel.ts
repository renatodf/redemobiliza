'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function reatribuirResponsavel(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const novoResponsavelId = formData.get('novoResponsavelId') as string

  if (!novoResponsavelId) return { erro: 'Selecione um responsável' }

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
    select: { id: true },
  })
  if (!pessoa) return { erro: 'Usuário não encontrado' }

  const demanda = await prisma.demanda.findFirst({
    where: { id: demandaId, gabineteId: gabinete.id },
    select: { responsavel: { select: { nome: true } } },
  })
  if (!demanda) return { erro: 'Demanda não encontrada' }

  const novoResponsavel = await prisma.pessoa.findFirst({
    where: { id: novoResponsavelId, gabineteId: gabinete.id, isMobilizador: true, isColaborador: true },
    select: { nome: true },
  })
  if (!novoResponsavel) return { erro: 'Responsável não encontrado' }

  await prisma.demanda.update({
    where: { id: demandaId },
    data: { responsavelId: novoResponsavelId },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'responsavel_alterado',
      descricao: `Responsável alterado de ${demanda.responsavel.nome} para ${novoResponsavel.nome}`,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  return {}
}
