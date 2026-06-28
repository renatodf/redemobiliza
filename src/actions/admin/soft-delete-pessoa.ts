'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function softDeletePessoa(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { deletedAt: new Date() },
  })

  redirect(`/${slug}/admin/pessoas`)
}
