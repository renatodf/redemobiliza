import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import Sidebar from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'

export default async function MobilizadorLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete || !gabinete.ativo) notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect(`/${params.slug}/login`)

  const usuarioGabinete = await prisma.usuarioGabinete.findUnique({
    where: { userId_gabineteId: { userId: session.user.id, gabineteId: gabinete.id } },
    select: { papel: true },
  })

  if (!usuarioGabinete || usuarioGabinete.papel !== 'mobilizador') {
    redirect(`/${params.slug}/login`)
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
          variante="mobilizador"
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar usuarioNome={usuarioNome} usuarioFotoUrl={usuarioFotoUrl} corPrimaria={gabinete.corPrimaria} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 max-w-4xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
