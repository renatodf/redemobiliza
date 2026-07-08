'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function revogarMobilizadoresEmMassa(formData: FormData): Promise<void> {
  const slug = formData.get('slug') as string
  const pessoaIds = formData.getAll('pessoaIds') as string[]
  if (pessoaIds.length === 0) return

  const { gabinete } = await assertAdminAccess(slug)

  const pessoas = await prisma.pessoa.findMany({
    where: { id: { in: pessoaIds }, gabineteId: gabinete.id, isMobilizador: true },
    select: { id: true, userId: true },
  })
  const userIds = pessoas.map((p) => p.userId).filter((id): id is string => !!id)

  await prisma.$transaction([
    prisma.pessoa.updateMany({
      where: { id: { in: pessoas.map((p) => p.id) } },
      data: { isMobilizador: false, tokenMobilizador: null, userId: null },
    }),
    ...(userIds.length
      ? [
          prisma.usuarioGabinete.deleteMany({
            where: { userId: { in: userIds }, gabineteId: gabinete.id, papel: 'mobilizador' },
          }),
        ]
      : []),
  ])

  revalidatePath(`/${slug}/admin/pessoas/redes`)
}
