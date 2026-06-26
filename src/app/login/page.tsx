import { loginAdmin, loginAdminGoogle } from '@/actions/auth/login-admin'

interface Props {
  searchParams: { erro?: string }
}

export default function LoginPage({ searchParams }: Props) {
  const mensagens: Record<string, string> = {
    credenciais_invalidas: 'E-mail ou senha incorretos.',
    nao_autorizado:
      'Seu e-mail não está autorizado. Entre em contato com o administrador.',
    gabinete_inativo:
      'Este gabinete foi desativado. Entre em contato com o suporte.',
    oauth_falhou: 'Erro ao iniciar login com Google. Tente novamente.',
    invite_invalid:
      'Convite inválido — solicite ao administrador do sistema o reenvio do convite.',
    gabinete_not_found:
      'Gabinete não encontrado. Entre em contato com o suporte.',
  }
  const erro = searchParams.erro ? mensagens[searchParams.erro] : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 text-center">
          Rede Mobiliza
        </h1>

        {erro && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <form action={loginAdmin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Entrar
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-gray-50 px-2 text-gray-400">ou</span>
          </div>
        </div>

        <form action={loginAdminGoogle}>
          <button
            type="submit"
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Entrar com Google
          </button>
        </form>
      </div>
    </div>
  )
}
