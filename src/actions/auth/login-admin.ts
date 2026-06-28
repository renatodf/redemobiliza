'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAppUrl } from '@/lib/app-url'

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

  // Verificar se é admin de algum gabinete
  const usuarioGabinete = await prisma.usuarioGabinete.findFirst({
    where: { userId: session.user.id, papel: 'admin' },
    include: { gabinete: { select: { slug: true, ativo: true } } },
  })

  if (usuarioGabinete) {
    if (!usuarioGabinete.gabinete.ativo) {
      await supabase.auth.signOut()
      redirect('/login?erro=gabinete_inativo')
    }
    redirect(`/${usuarioGabinete.gabinete.slug}/admin/`)
  }

  // Verificar se é mobilizador
  const usuarioMobilizador = await prisma.usuarioGabinete.findFirst({
    where: { userId: session.user.id, papel: 'mobilizador' },
    include: { gabinete: { select: { slug: true, ativo: true } } },
  })

  if (usuarioMobilizador) {
    if (!usuarioMobilizador.gabinete.ativo) {
      await supabase.auth.signOut()
      redirect('/login?erro=gabinete_inativo')
    }
    redirect(`/${usuarioMobilizador.gabinete.slug}/mobilizador/`)
  }

  await supabase.auth.signOut()
  redirect('/login?erro=nao_autorizado')
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
