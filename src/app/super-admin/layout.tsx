import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Sem redirect aqui — o middleware já protege todas as rotas /super-admin/*
  // exceto /super-admin/login. Sem redirect no layout = sem redirect loop.
  // Se não autenticado (ex: página de login), renderiza só os filhos sem chrome.
  if (!user || user.app_metadata?.role !== 'super-admin') {
    return <>{children}</>
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
