'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function excluirDemanda(formData: FormData): Promise<void> {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { deletedAt: new Date() },
  })

  revalidatePath(`/${slug}/admin/demandas`)
}
