'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin, gerarLinkComRetry } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { prisma } from '@/lib/prisma'
import { enviarEmail, templateConviteAdmin } from '@/lib/email'

async function assertSuperAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }
}

export async function convidarAdmin(gabineteId: string, formData: FormData) {
  await assertSuperAdmin()
  const email = (formData.get('email') as string).trim().toLowerCase()

  if (!email) {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=email_obrigatorio`)
  }

  const { data: linkData, error: inviteError } = await gerarLinkComRetry({
    type: 'invite',
    email,
    options: { redirectTo: `${getAppUrl()}/auth/confirm` },
  })

  if (inviteError) {
    const jaExiste =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inviteError as any).code === 'email_exists' ||
      inviteError.message.toLowerCase().includes('already registered') ||
      inviteError.status === 422

    if (jaExiste) {
      const { data: { users } } = await getSupabaseAdmin().auth.admin.listUsers({ perPage: 1000 })
      const existingUser = users.find(u => u.email?.toLowerCase() === email)

      if (existingUser?.app_metadata?.role === 'super-admin') {
        await prisma.usuarioGabinete.upsert({
          where: { userId_gabineteId: { userId: existingUser.id, gabineteId } },
          create: { userId: existingUser.id, gabineteId, papel: 'admin' },
          update: {},
        })
        redirect(`/super-admin/gabinetes/${gabineteId}?sucesso=admin_vinculado`)
      }

      redirect(
        `/super-admin/gabinetes/${gabineteId}?erro=usuario_ja_existe&email=${encodeURIComponent(email)}`
      )
    }
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=convite_falhou`)
  }

  const userId = linkData.user.id

  const { error: updateError } =
    await getSupabaseAdmin().auth.admin.updateUserById(userId, {
      app_metadata: { gabineteId, papel: 'admin' },
    })

  if (updateError) {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=metadata_falhou&userId=${userId}`)
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId }, select: { nome: true } })
  const urlConvite = `${getAppUrl()}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=invite`

  try {
    await enviarEmail({
      para: email,
      assunto: `Convite para administrar ${gabinete?.nome ?? 'o gabinete'}`,
      html: templateConviteAdmin({ nomeGabinete: gabinete?.nome ?? 'o gabinete', urlConvite }),
    })
  } catch {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=email_falhou`)
  }

  redirect(`/super-admin/gabinetes/${gabineteId}?sucesso=convite_enviado`)
}
