'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAppUrl } from '@/lib/app-url'
import { listarDestinosAcesso, caminhoDestino } from '@/lib/auth-destino'

export async function loginAdmin(formData: FormData) {
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
    redirect('/login?erro=credenciais_invalidas')
  }

  const isSuperAdminRole = session.user.app_metadata?.role === 'super-admin'
  const destinos = await listarDestinosAcesso(session.user.id, isSuperAdminRole)

  if (destinos.length === 0) {
    await supabase.auth.signOut()
    redirect('/login?erro=nao_autorizado')
  }

  if (destinos.length > 1) {
    redirect('/escolher-acesso')
  }

  redirect(caminhoDestino(destinos[0]))
}

export async function loginAdminGoogle() {
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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${getAppUrl()}/auth/confirm`,
    },
  })

  if (error || !data.url) {
    redirect('/login?erro=oauth_falhou')
  }

  redirect(data.url)
}
