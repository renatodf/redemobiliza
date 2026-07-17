'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function salvarPersonalizacao(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const nomeSistemaRaw = (formData.get('nomeSistema') as string).trim()
  const corPrimaria = (formData.get('corPrimaria') as string).trim() || '#1D4ED8'
  const corSecundaria = (formData.get('corSecundaria') as string).trim() || '#3B82F6'

  try {
    const { gabinete } = await assertAdminAccess(slug)

    await prisma.gabinete.update({
      where: { id: gabinete.id },
      data: {
        nomeSistema: nomeSistemaRaw || undefined,
        corPrimaria,
        corSecundaria,
      },
    })

    revalidatePath(`/${slug}/admin/personalizacao`)
    revalidatePath(`/${slug}/admin/configuracoes/personalizacao`)
    return {}
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro ao salvar personalização' }
  }
}
