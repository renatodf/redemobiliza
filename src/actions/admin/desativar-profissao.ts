'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function desativarProfissao(formData: FormData) {
  const slug = formData.get('slug') as string
  const profissaoId = formData.get('profissaoId') as string

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.profissao.updateMany({
    where: { id: profissaoId, gabineteId: gabinete.id },
    data: { ativa: false },
  })

  revalidatePath(`/${slug}/admin/profissoes`)
}
