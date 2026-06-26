'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function inativarSegmento(formData: FormData) {
  const slug = formData.get('slug') as string
  const segmentoId = formData.get('segmentoId') as string

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.segmento.updateMany({
    where: { id: segmentoId, gabineteId: gabinete.id },
    data: { status: 'inativo' },
  })

  revalidatePath(`/${slug}/admin/segmentos`)
}
