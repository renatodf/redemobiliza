import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Não verificar auth na própria página de login — evita redirect loop
  const pathname = headers().get('x-pathname') ?? ''
  if (pathname === '/super-admin/login') {
    return <>{children}</>
  }

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'super-admin') {
    redirect('/super-admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-gray-900">Rede Mobiliza — Super Admin</span>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
            Sair
          </button>
        </form>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
