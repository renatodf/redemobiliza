'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function salvarPersonalizacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const nomeSistemaRaw = (formData.get('nomeSistema') as string).trim()
  const corPrimaria = (formData.get('corPrimaria') as string).trim() || '#1D4ED8'
  const corSecundaria = (formData.get('corSecundaria') as string).trim() || '#3B82F6'

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  await prisma.gabinete.update({
    where: { id: gabinete.id },
    data: {
      nomeSistema: nomeSistemaRaw || undefined,
      corPrimaria,
      corSecundaria,
    },
  })

  revalidatePath(`/${slug}/admin/personalizacao`)
}
