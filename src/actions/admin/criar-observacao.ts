'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function criarObservacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const texto = (formData.get('texto') as string).trim()
  if (!texto) throw new Error('Texto é obrigatório')

  const { session, gabinete } = await assertAdminAccess(slug)

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
