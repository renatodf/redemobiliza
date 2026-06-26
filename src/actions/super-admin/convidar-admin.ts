'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function assertSuperAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session || session.user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }
}

export async function convidarAdmin(gabineteId: string, formData: FormData) {
  await assertSuperAdmin()
  const email = (formData.get('email') as string).trim().toLowerCase()

  if (!email) {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=email_obrigatorio`)
  }

  const { data: invite, error: inviteError } =
    await getSupabaseAdmin().auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
    })

  if (inviteError) {
    if (inviteError.message.includes('already registered')) {
      redirect(
        `/super-admin/gabinetes/${gabineteId}?erro=usuario_ja_existe&email=${encodeURIComponent(email)}`
      )
    }
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=convite_falhou`)
  }

  const userId = invite.user.id

  const { error: updateError } =
    await getSupabaseAdmin().auth.admin.updateUserById(userId, {
      app_metadata: { gabineteId, papel: 'admin' },
    })

  if (updateError) {
    redirect(`/super-admin/gabinetes/${gabineteId}?erro=metadata_falhou&userId=${userId}`)
  }

  redirect(`/super-admin/gabinetes/${gabineteId}?sucesso=convite_enviado`)
}
