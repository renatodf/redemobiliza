'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function inativarSegmento(formData: FormData) {
  const slug = formData.get('slug') as string
  const segmentoId = formData.get('segmentoId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.segmento.updateMany({
    where: { id: segmentoId, gabineteId: gabinete.id },
    data: { status: 'inativo' },
  })

  revalidatePath(`/${slug}/admin/segmentos`)
}
