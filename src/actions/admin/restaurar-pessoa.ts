'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { Prisma } from '@/generated/prisma/client'

export async function restaurarPessoa(
  _prevState: { erro?: string },
  formData: FormData
): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') return { erro: 'Apenas super-admin pode restaurar' }

  const gabinete = await getGabineteBySlug(slug)
  if (!gabinete) return { erro: 'Gabinete não encontrado' }

  try {
    await prisma.pessoa.updateMany({
      where: { id: pessoaId, gabineteId: gabinete.id },
      data: { deletedAt: null },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return {
        erro: 'Não é possível restaurar — já existe uma pessoa ativa com o mesmo WhatsApp ou token de mobilizador.',
      }
    }
    throw e
  }

  revalidatePath(`/${slug}/admin/configuracoes`)
  return {}
}
