import { loginSuperAdmin } from '@/actions/auth/login-super-admin'

interface Props {
  searchParams: { erro?: string }
}

export default function SuperAdminLoginPage({ searchParams }: Props) {
  const mensagens: Record<string, string> = {
    credenciais_invalidas: 'E-mail ou senha incorretos.',
    nao_autorizado: 'Acesso não autorizado.',
  }
  const erro = searchParams.erro ? mensagens[searchParams.erro] : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-white text-center">
          Acesso Restrito
        </h1>

        {erro && (
          <p className="text-sm text-red-400 text-center">{erro}</p>
        )}

        <form action={loginSuperAdmin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-gray-300 mb-1">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-gray-300 mb-1">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
