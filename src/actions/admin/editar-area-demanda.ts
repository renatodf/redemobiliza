'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function editarAreaDemanda(formData: FormData) {
  const slug = formData.get('slug') as string
  const areaId = formData.get('areaId') as string
  const nome = (formData.get('nome') as string).trim()
  if (!nome) throw new Error('Nome é obrigatório')

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.areaDemanda.updateMany({
    where: { id: areaId, gabineteId: gabinete.id },
    data: { nome },
  })
  revalidatePath(`/${slug}/admin/demandas/areas`)
}
