'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function uploadLogo(formData: FormData) {
  const slug = formData.get('slug') as string
  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return

  const { gabinete } = await assertAdminAccess(slug)

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${gabinete.id}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await getSupabaseAdmin().storage
    .from('gabinete-assets')
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Erro no upload: ${error.message}`)

  const { data: { publicUrl } } = getSupabaseAdmin().storage
    .from('gabinete-assets')
    .getPublicUrl(path)

  await prisma.gabinete.update({
    where: { id: gabinete.id },
    data: { logoUrl: publicUrl },
  })

  revalidatePath(`/${slug}/admin/personalizacao`)
}
