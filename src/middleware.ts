import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rotas públicas — sem autenticação necessária
  const isPublicAuth = [
    '/login',
    '/super-admin/login',
    '/auth/confirm',
    '/auth/callback',
  ].some((p) => pathname.startsWith(p))
  const isPublicCadastro = /^\/[^/]+\/cadastro/.test(pathname)

  if (isPublicAuth || isPublicCadastro) return supabaseResponse

  // Super-admin: exige user + role = super-admin em app_metadata
  if (pathname.startsWith('/super-admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/super-admin/login', request.url))
    }
    if (user.app_metadata?.role !== 'super-admin') {
      return new NextResponse('Acesso negado', { status: 403 })
    }
    return supabaseResponse
  }

  // Rotas de gabinete admin (/:slug/admin/...) — papel verificado no layout
  if (/^\/(?!super-admin|login|auth|api|_next)[^/]+\/admin/.test(pathname)) {
    if (!user) {
      const slug = pathname.split('/')[1]
      return NextResponse.redirect(new URL(`/${slug}/login`, request.url))
    }
    return supabaseResponse
  }

  // Rotas de mobilizador (/:slug/mobilizador/...) — papel verificado no layout
  if (/^\/(?!super-admin|login|auth|api|_next)[^/]+\/mobilizador/.test(pathname)) {
    if (!user) {
      const slug = pathname.split('/')[1]
      return NextResponse.redirect(new URL(`/${slug}/login`, request.url))
    }
    return supabaseResponse
  }

  // Qualquer outra rota exige autenticação
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
