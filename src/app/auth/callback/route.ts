import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { whereMobilizadorAtivoPorToken } from '@/lib/mobilizador'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const token = searchParams.get('token')
  const gabineteId = searchParams.get('gabineteId')

  if (!code || !token || !gabineteId) {
    return NextResponse.redirect(new URL('/login?erro=link_invalido', origin))
  }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?erro=link_invalido', origin))
  }

  const user = data.user

  const pessoa = await prisma.pessoa.findFirst({
    where: whereMobilizadorAtivoPorToken(gabineteId, token),
    select: {
      id: true,
      email: true,
      gabinete: { select: { slug: true, ativo: true } },
    },
  })

  if (!pessoa || !pessoa.gabinete.ativo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?erro=link_invalido', origin))
  }

  if (
    !pessoa.email ||
    pessoa.email.toLowerCase() !== (user.email ?? '').toLowerCase()
  ) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?erro=email_incompativel', origin))
  }

  await prisma.usuarioGabinete.upsert({
    where: { userId_gabineteId: { userId: user.id, gabineteId } },
    create: { userId: user.id, gabineteId, papel: 'mobilizador' },
    update: { papel: 'mobilizador' },
  })

  await prisma.pessoa.update({
    where: { id: pessoa.id },
    data: { userId: user.id },
  })

  return NextResponse.redirect(
    new URL(`/${pessoa.gabinete.slug}/mobilizador/`, origin)
  )
}
