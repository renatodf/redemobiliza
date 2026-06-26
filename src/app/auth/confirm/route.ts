import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = createSupabaseServerClient()

  // Troca token ou code por sessão e captura o user diretamente do retorno
  let user: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>['data']['user']

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.user) {
      return NextResponse.redirect(
        new URL('/login?erro=invite_invalid', origin)
      )
    }
    user = data.user
  } else if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (error || !data.user) {
      return NextResponse.redirect(
        new URL('/login?erro=invite_invalid', origin)
      )
    }
    user = data.user
  } else {
    return NextResponse.redirect(new URL('/login?erro=invite_invalid', origin))
  }

  // Verificar app_metadata.gabineteId — race condition ou acesso não autorizado
  const gabineteId = user.app_metadata?.gabineteId as string | undefined

  if (!gabineteId) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL('/login?erro=invite_invalid', origin)
    )
  }

  // Verificar que o gabinete existe e está ativo
  const gabinete = await prisma.gabinete.findUnique({
    where: { id: gabineteId },
    select: { id: true, slug: true, ativo: true },
  })

  if (!gabinete || !gabinete.ativo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL('/login?erro=gabinete_not_found', origin)
    )
  }

  // Upsert UsuarioGabinete — idempotente (double-click / retry seguro)
  await prisma.usuarioGabinete.upsert({
    where: {
      userId_gabineteId: { userId: user.id, gabineteId },
    },
    create: { userId: user.id, gabineteId, papel: 'admin' },
    update: {},
  })

  return NextResponse.redirect(
    new URL(`/g/${gabinete.slug}/admin/`, origin)
  )
}
