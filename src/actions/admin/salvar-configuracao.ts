'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function salvarConfiguracao(formData: FormData) {
  const slug = formData.get('slug') as string
  const prazoDemandasHoras = Number(formData.get('prazoDemandasHoras'))
  const alertaExpiracaoHoras = Number(formData.get('alertaExpiracaoHoras'))

  if (!prazoDemandasHoras || prazoDemandasHoras < 1) throw new Error('Prazo inválido')
  if (!alertaExpiracaoHoras || alertaExpiracaoHoras < 1) throw new Error('Alerta inválido')

  const { gabinete } = await assertAdminAccess(slug)

  await prisma.configuracaoSistema.upsert({
    where: { gabineteId: gabinete.id },
    update: { prazoDemandasHoras, alertaExpiracaoHoras },
    create: { gabineteId: gabinete.id, prazoDemandasHoras, alertaExpiracaoHoras },
  })

  revalidatePath(`/${slug}/admin/configuracoes`)
}
