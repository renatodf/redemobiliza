'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function desativarRegiao(formData: FormData) {
  const slug = formData.get('slug') as string
  const regiaoId = formData.get('regiaoId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.regiao.updateMany({
    where: { id: regiaoId, gabineteId: gabinete.id },
    data: { ativa: false },
  })

  revalidatePath(`/${slug}/admin/regioes`)
}
