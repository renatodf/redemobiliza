import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="px-4 py-3 text-white shadow-sm"
        style={{ backgroundColor: gabinete.corPrimaria }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="font-semibold text-sm">{gabinete.nomeSistema}</span>
          <span className="text-xs opacity-80">Área do Mobilizador</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto py-8 px-4">
        {children}
      </main>
    </div>
  )
}
