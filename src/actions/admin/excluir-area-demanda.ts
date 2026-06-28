'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function excluirAreaDemanda(formData: FormData) {
  const slug = formData.get('slug') as string
  const areaId = formData.get('areaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  const emUso = await prisma.demanda.count({ where: { areaId, gabineteId: gabinete.id } })
  if (emUso > 0) throw new Error('Esta área possui demandas vinculadas e não pode ser excluída')

  await prisma.areaDemanda.deleteMany({ where: { id: areaId, gabineteId: gabinete.id } })
  revalidatePath(`/${slug}/admin/demandas/areas`)
}
