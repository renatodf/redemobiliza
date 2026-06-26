'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Garante que o destino é um caminho relativo same-origin (evita open redirect)
function safeRelativePath(value: FormDataEntryValue | null, fallback: string): string {
  const s = typeof value === 'string' ? value : ''
  if (!s.startsWith('/') || s.startsWith('//')) return fallback
  return s
}

export async function atualizarSenha(formData: FormData) {
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string
  const redirectSucesso = safeRelativePath(formData.get('redirectSucesso'), '/login')
  const redirectErro = safeRelativePath(formData.get('redirectErro'), '/login/nova-senha')

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
