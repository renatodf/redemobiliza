'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGabineteBySlug } from '@/lib/gabinete'

export async function uploadLogo(formData: FormData) {
  const slug = formData.get('slug') as string
  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) throw new Error('Gabinete não encontrado')

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${gabinete.id}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseAdmin.storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.gabinete.update({
    where: { id: gabinete.id },
    data: { logoUrl: publicUrl },
  })

  revalidatePath(`/${slug}/admin/personalizacao`)
}
