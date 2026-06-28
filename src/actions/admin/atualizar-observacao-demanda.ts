'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function atualizarObservacaoDemanda(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string
  const observacao = (formData.get('observacao') as string).trim()

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

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { observacao },
  })

  await prisma.movimentacaoDemanda.create({
    data: {
      demandaId,
      tipo: 'observacao',
      descricao: observacao,
      autorId: pessoa.id,
    },
  })

  revalidatePath(`/${slug}/admin/demandas/${demandaId}`)
  return {}
}
