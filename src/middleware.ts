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
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  // Rotas públicas — sem autenticação
  const isPublicAuth = ['/login', '/auth/confirm', '/auth/callback'].some((p) =>
    pathname.startsWith(p)
  )
  const isPublicCadastro = /^\/[^/]+\/cadastro/.test(pathname)

  if (isPublicAuth || isPublicCadastro) return supabaseResponse

  // Super-admin: exige session + role = super-admin em app_metadata
  if (pathname.startsWith('/super-admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (session.user.app_metadata?.role !== 'super-admin') {
      return new NextResponse('Acesso negado', { status: 403 })
    }
    return supabaseResponse
  }

  // Rotas de gabinete admin/mobilizador — exige session (papel verificado nas routes)
  if (/^\/[^/]+\/(admin|mobilizador)/.test(pathname)) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // Qualquer outra rota não listada acima exige autenticação
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
