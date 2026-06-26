'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function editarObservacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const observacaoId = formData.get('observacaoId') as string
  const texto = (formData.get('texto') as string).trim()
  if (!texto) throw new Error('Texto é obrigatório')

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const obs = await prisma.observacaoPessoa.findFirst({
    where: { id: observacaoId, gabineteId: gabinete.id },
    select: { autorUserId: true },
  })
  if (!obs) throw new Error('Observação não encontrada')

  const role = session.user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })

  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isAutor = obs.autorUserId === session.user.id

  if (!isAdmin && !isAutor) throw new Error('Sem permissão para editar esta observação')

  await prisma.observacaoPessoa.update({
    where: { id: observacaoId },
    data: { texto, editadoEm: new Date() },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
