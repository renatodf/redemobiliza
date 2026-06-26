'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function desativarProfissao(formData: FormData) {
  const slug = formData.get('slug') as string
  const profissaoId = formData.get('profissaoId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.profissao.updateMany({
    where: { id: profissaoId, gabineteId: gabinete.id },
    data: { ativa: false },
  })

  revalidatePath(`/${slug}/admin/profissoes`)
}
