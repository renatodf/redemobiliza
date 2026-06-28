'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function cadastrarSolicitante(formData: FormData): Promise<void> {
  const slug = formData.get('slug') as string
  const nome = (formData.get('nome') as string).trim()
  const whatsapp = (formData.get('whatsapp') as string).trim()
  const email = (formData.get('email') as string | null)?.trim() || null

  if (!nome || !whatsapp) {
    redirect(`/${slug}/admin/demandas/nova?cadastrar=1&erro=campos_obrigatorios`)
  }

  const { gabinete } = await assertAdminAccess(slug)

  const pessoa = await prisma.pessoa.create({
    data: {
      gabineteId: gabinete.id,
      nome,
      whatsapp,
      email,
      origem: 'manual',
      isColaborador: false,
      isMobilizador: false,
    },
    select: { id: true },
  })

  redirect(`/${slug}/admin/demandas/nova?solicitanteId=${pessoa.id}`)
}
