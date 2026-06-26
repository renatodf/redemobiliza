'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function solicitarRecuperacaoSenha(formData: FormData) {
  const email = formData.get('email') as string

  if (!email?.trim()) {
    redirect('/login/recuperar-senha?erro=email_vazio')
  }

  const supabase = createSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
  })

  // Sempre redireciona para "enviado" — não revela se o e-mail existe
  redirect('/login/recuperar-senha?enviado=1')
}
