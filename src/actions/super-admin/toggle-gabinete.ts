'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export async function toggleGabinete(id: string, ativoAtual: boolean) {
  await prisma.gabinete.update({
    where: { id },
    data: { ativo: !ativoAtual },
  })

  redirect('/super-admin/')
}
