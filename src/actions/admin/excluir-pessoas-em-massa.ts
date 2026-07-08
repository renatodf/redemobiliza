'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function excluirPessoasEmMassa(formData: FormData): Promise<void> {
  const slug = formData.get('slug') as string
  const pessoaIds = formData.getAll('pessoaIds') as string[]
  if (pessoaIds.length === 0) return

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.pessoa.updateMany({
    where: { id: { in: pessoaIds }, gabineteId: gabinete.id },
    data: { deletedAt: new Date() },
  })

  revalidatePath(`/${slug}/admin/pessoas`)
}
