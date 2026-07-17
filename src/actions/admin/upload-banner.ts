'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/assert-admin-access'
import { validarImagemUpload } from '@/lib/validar-imagem-upload'

export async function uploadBanner(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const file = formData.get('banner') as File | null
  if (!file || file.size === 0) return {}

  try {
    const { gabinete } = await assertAdminAccess(slug)
    const { ext, contentType } = validarImagemUpload(file)

    const path = `${gabinete.id}/banner.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await getSupabaseAdmin().storage
      .from('gabinete-assets')
      .upload(path, buffer, { upsert: true, contentType })

    if (error) return { erro: `Erro no upload: ${error.message}` }

    const { data: { publicUrl } } = getSupabaseAdmin().storage
      .from('gabinete-assets')
      .getPublicUrl(path)

    await prisma.gabinete.update({
      where: { id: gabinete.id },
      data: { imagemBannerUrl: `${publicUrl}?v=${Date.now()}` },
    })

    revalidatePath(`/${slug}/admin/personalizacao`)
    return {}
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro ao enviar imagem' }
  }
}
