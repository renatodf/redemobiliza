'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function atualizarSenha(formData: FormData) {
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string
  const redirectSucesso = (formData.get('redirectSucesso') as string) || '/login'
  const redirectErro = (formData.get('redirectErro') as string) || '/login/nova-senha'

  if (!password || password.length < 6) {
    redirect(`${redirectErro}?erro=senha_curta`)
  }

  if (password !== confirm) {
    redirect(`${redirectErro}?erro=senhas_diferentes`)
  }

  const supabase = createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect(`${redirectErro}?erro=falha`)
  }

  redirect(`${redirectSucesso}?senhaAtualizada=1`)
}
