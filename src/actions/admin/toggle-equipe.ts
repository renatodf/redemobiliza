'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function toggleColaborador(formData: FormData) {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string
  const acao = formData.get('acao') as 'marcar' | 'desmarcar'

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.pessoa.updateMany({
    where: { id: pessoaId, gabineteId: gabinete.id },
    data: { isColaborador: acao === 'marcar' },
  })

  revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
}
