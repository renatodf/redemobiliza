import 'server-only'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { readSuporteSessao } from '@/lib/modo-suporte'
import { sairModoSuporte } from '@/actions/super-admin/modo-suporte'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect(`/${params.slug}/login`)

  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) redirect('/404')
  if (!gabinete.ativo) redirect(`/${params.slug}/login?erro=gabinete_inativo`)

  const role = session.user.app_metadata?.role as string | undefined
  const suporteCookieValue = cookieStore.get('suporteSessao')?.value

  let modoSuporteAtivo = false
  let sairAction: (() => Promise<void>) | null = null

  if (role === 'super-admin') {
    let sessao: { gabineteId: string; sessaoId: string } | null = null
    try {
      sessao = readSuporteSessao(role, suporteCookieValue)
    } catch {
      redirect('/super-admin/')
    }
    if (!sessao || sessao.gabineteId !== gabinete.id) {
      redirect('/super-admin/')
    }
    modoSuporteAtivo = true
    sairAction = sairModoSuporte.bind(null, sessao.gabineteId, sessao.sessaoId)
  } else {
    const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
      where: {
        userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id },
      },
      select: { papel: true },
    })
    if (!usuarioGabinete || usuarioGabinete.papel !== 'admin') {
      redirect(`/${params.slug}/login?erro=sem_acesso`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {modoSuporteAtivo && sairAction && (
        <div className="bg-yellow-400 text-yellow-900 px-4 py-2 flex items-center justify-between text-sm font-medium">
          <span>
            Modo Suporte ativo — você está visualizando{' '}
            <strong>{gabinete.nomeSistema ?? params.slug}</strong>
          </span>
          <form action={sairAction}>
            <button type="submit" className="underline hover:no-underline">
              Sair do modo suporte
            </button>
          </form>
        </div>
      )}
      <main>{children}</main>
    </div>
  )
}
