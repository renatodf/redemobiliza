'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function criarObservacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const texto = (formData.get('texto') as string).trim()
  if (!texto) throw new Error('Texto é obrigatório')

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, gabineteId: gabinete.id },
    select: { id: true },
  })
  if (!pessoa) throw new Error('Pessoa não encontrada')

  const autorNome =
    (session.user.user_metadata?.full_name as string | undefined) ??
    session.user.email ??
    session.user.id

  await prisma.observacaoPessoa.create({
    data: {
      gabineteId: gabinete.id,
      pessoaId,
      autorUserId: session.user.id,
      autorNome,
      texto,
    },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
