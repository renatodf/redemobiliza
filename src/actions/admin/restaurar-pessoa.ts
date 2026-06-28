'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function restaurarPessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') throw new Error('Apenas super-admin pode restaurar')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { deletedAt: null },
  })

  revalidatePath(`/${slug}/admin/configuracoes`)
}
