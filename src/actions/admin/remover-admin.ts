'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function removerAdmin(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const pessoa = await prisma.pessoa.findFirst({
      where: { id: pessoaId, gabineteId: gabinete.id },
      select: { id: true, userId: true, isAdmin: true },
    })
    if (!pessoa) return { erro: 'Pessoa não encontrada' }
    if (!pessoa.isAdmin) return { erro: 'Esta pessoa não é administradora' }

    await prisma.$transaction(async (tx) => {
      await tx.pessoa.update({
        where: { id: pessoaId },
        data: { isAdmin: false, userId: null },
      })

      if (pessoa.userId) {
        await tx.usuarioGabinete.deleteMany({
          where: {
            userId: pessoa.userId,
            gabineteId: gabinete.id,
            papel: 'admin',
          },
        })
      }
    })

    revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
    revalidatePath(`/super-admin/gabinetes/${gabinete.id}`)
    return {}
  } catch (err: unknown) {
    return { erro: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}
