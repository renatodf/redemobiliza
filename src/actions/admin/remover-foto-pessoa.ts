'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function removerFotoPessoa(formData: FormData) {
  const slug = formData.get('slug')
  const pessoaId = formData.get('pessoaId')
  if (!slug || !pessoaId) throw new Error('Parâmetros inválidos')

  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug as string)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId as string, gabineteId: gabinete.id },
    select: { id: true, userId: true, fotoUrl: true },
  })
  if (!pessoa) throw new Error('Pessoa não encontrada')

  const role = user.app_metadata?.role as string | undefined
  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })
  const isAdmin = usuarioGabinete?.papel === 'admin' || role === 'super-admin'
  const isPropriaPessoa = pessoa.userId === user.id

  if (!isAdmin && !isPropriaPessoa) throw new Error('Sem permissão')

  if (pessoa.fotoUrl) {
    const oldPath = pessoa.fotoUrl.split('gabinete-assets/')[1]?.split('?')[0]
    if (oldPath) {
      await getSupabaseAdmin().storage.from('gabinete-assets').remove([oldPath])
    }
  }

  await prisma.pessoa.update({
    where: { id: pessoaId as string },
    data: { fotoUrl: null },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
