'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/assert-admin-access'

export async function tornarMobilizador(formData: FormData): Promise<{ erro?: string }> {
  const slug = formData.get('slug') as string
  const pessoaId = formData.get('pessoaId') as string

  try {
    const { gabinete } = await assertAdminAccess(slug)

    const pessoa = await prisma.pessoa.findFirst({
      where: { id: pessoaId, gabineteId: gabinete.id },
      select: { id: true, email: true, isMobilizador: true },
    })
    if (!pessoa) return { erro: 'Pessoa não encontrada' }
    if (!pessoa.email) return { erro: 'A pessoa precisa ter um e-mail cadastrado para ser mobilizador' }
    if (pessoa.isMobilizador) return { erro: 'Esta pessoa já é mobilizadora' }

    const tokenMobilizador = crypto.randomUUID().replace(/-/g, '')

    await prisma.pessoa.update({
      where: { id: pessoaId },
      data: { isMobilizador: true, tokenMobilizador },
    })

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?token=${tokenMobilizador}&gabineteId=${gabinete.id}`

    const { error: emailError } = await getSupabaseAdmin().auth.signInWithOtp({
      email: pessoa.email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    })

    if (emailError) {
      return { erro: `Pessoa configurada como mobilizador, mas falha ao enviar e-mail: ${emailError.message}` }
    }

    revalidatePath(`/${slug}/admin/pessoas/${pessoaId}`)
    return {}
  } catch (err: unknown) {
    return { erro: err instanceof Error ? err.message : 'Erro inesperado' }
  }
}
