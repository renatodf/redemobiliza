import 'server-only'

export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import { readSuporteSessao } from '@/lib/modo-suporte'
import { sairModoSuporte } from '@/actions/super-admin/modo-suporte'
import Sidebar from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'

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

  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: {
      userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id },
    },
    select: { papel: true },
  })

  if (usuarioGabinete?.papel === 'admin') {
    // Acesso direto de admin no gabinete — mesmo que a conta também seja
    // super-admin, entra direto, sem exigir sessão de Modo Suporte.
  } else if (role === 'super-admin') {
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
    redirect(`/${params.slug}/login?erro=sem_acesso`)
  }

  const pessoaLogada = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, deletedAt: null },
    select: { nome: true, fotoUrl: true },
  })
  const usuarioNome = pessoaLogada?.nome ?? session.user.email?.split('@')[0] ?? 'Usuário'
  const usuarioFotoUrl = pessoaLogada?.fotoUrl ?? null

  return (
    <div className="h-screen overflow-hidden bg-[#F5F6FA] flex flex-col">
      <div className="h-[11px] w-full shrink-0" style={{ backgroundColor: gabinete.corPrimaria }} />
      <div className="flex flex-1 min-h-0">
        <input type="checkbox" id="sidebar-toggle" className="peer hidden" />
        <label
          htmlFor="sidebar-toggle"
          aria-label="Fechar menu"
          className="hidden peer-checked:block md:!hidden fixed inset-0 bg-black/40 z-30"
        />
        <Sidebar
          slug={params.slug}
          gabineteNome={gabinete.nomeSistema ?? params.slug}
          logoUrl={gabinete.logoUrl}
          corPrimaria={gabinete.corPrimaria}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {modoSuporteAtivo && sairAction && (
            <div className="bg-yellow-400 text-yellow-900 px-4 py-2 flex items-center justify-between text-sm font-medium shrink-0">
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
          <Topbar
            usuarioNome={usuarioNome}
            usuarioFotoUrl={usuarioFotoUrl}
            filtrosHref={`/${params.slug}/admin/filtros`}
          />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 max-w-6xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
