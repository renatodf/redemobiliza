'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function desativarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const regiaoId = formData.get('regiaoId') as string

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.regiao.updateMany({
    where: { id: regiaoId, gabineteId: gabinete.id },
    data: { ativa: false },
  })

  revalidatePath(`/${slug}/admin/regioes`)
}
