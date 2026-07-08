'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { listarDestinosAcesso, caminhoDestino } from '@/lib/auth-destino'

export async function loginSuperAdmin(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )

  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !session) {
    redirect('/super-admin/login?erro=credenciais_invalidas')
  }

  if (session.user.app_metadata?.role !== 'super-admin') {
    await supabase.auth.signOut()
    redirect('/super-admin/login?erro=nao_autorizado')
  }

  const destinos = await listarDestinosAcesso(session.user.id, true)

  if (destinos.length > 1) {
    redirect('/escolher-acesso')
  }

  redirect(caminhoDestino(destinos[0]))
}
