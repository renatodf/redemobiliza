'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function excluirDemanda(formData: FormData) {
  const slug = formData.get('slug') as string
  const demandaId = formData.get('demandaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.demanda.updateMany({
    where: { id: demandaId, gabineteId: gabinete.id },
    data: { deletedAt: new Date() },
  })

  redirect(`/${slug}/admin/demandas`)
}
