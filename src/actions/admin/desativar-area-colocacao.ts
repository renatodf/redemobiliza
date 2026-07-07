'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function desativarAreaColocacao(formData: FormData) {
  const slug = formData.get('slug') as string
  const areaId = formData.get('areaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.areaColocacao.updateMany({
    where: { id: areaId, gabineteId: gabinete.id },
    data: { status: 'inativa' },
  })

  revalidatePath(`/${slug}/admin/configuracoes/areas-colocacao`)
}
