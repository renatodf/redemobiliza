import Link from 'next/link'
import { loginAdmin, loginAdminGoogle } from '@/actions/auth/login-admin'

interface Props {
  searchParams: { erro?: string; senhaAtualizada?: string }
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
  const senhaAtualizada = searchParams.senhaAtualizada === '1'

  return (
    <div className="min-h-screen flex flex-col bg-[#EFEFEF]">
      <div className="h-[11px] w-full bg-[#244F99] shrink-0" />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[423px] space-y-6">
          <h1 className="text-center text-[31px] leading-9 text-[#494949]">
            Login
          </h1>

          {senhaAtualizada && (
            <div className="rounded-sm bg-green-50 border border-green-200 p-3">
              <p className="text-sm text-green-700">Senha atualizada! Faça login com a nova senha.</p>
            </div>
          )}

          {erro && (
            <div className="rounded-sm bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <form action={loginAdmin} className="space-y-5">
            <div className="rounded-sm bg-white shadow-[0_18px_38px_rgba(3,3,3,0.16)]">
              <div className="flex items-center gap-3 px-4 py-4">
                <label htmlFor="email" className="sr-only">E-mail</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="usuario@email.com"
                  className="flex-1 text-sm text-[#686868] placeholder:text-[#686868] outline-none bg-transparent"
                />
                <svg width="19" height="20" viewBox="0 0 19 20" fill="none" aria-hidden className="shrink-0">
                  <circle cx="9.5" cy="5" r="4.1" stroke="#244F99" strokeWidth="1.8" />
                  <path d="M0.9 19.1a9.5 6.5 0 0 1 17.2 0" stroke="#244F99" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                </svg>
              </div>
              <div className="border-t border-[#EFEFEF]" />
              <div className="flex items-center gap-3 px-4 py-4">
                <label htmlFor="password" className="sr-only">Senha</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Senha"
                  className="flex-1 text-sm text-[#686868] placeholder:text-[#686868] outline-none bg-transparent"
                />
                <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden className="shrink-0">
                  <rect x="1" y="8.5" width="16" height="10.5" rx="1.5" stroke="#244F99" strokeWidth="1.8" />
                  <path d="M4.5 8.5V5.5a4.5 4.5 0 0 1 9 0v3" stroke="#244F99" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="9" cy="13.5" r="1.5" fill="#244F99" />
                </svg>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-sm bg-[#244F99] py-3 text-sm font-medium tracking-wide text-white shadow-[0_12px_35px_rgba(212,212,212,1)] hover:opacity-90"
            >
              ENTRAR
            </button>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-[#686868] cursor-pointer">
                <input type="checkbox" name="lembrar" className="h-4 w-4 rounded-sm border border-[#D3D3D3] accent-[#244F99]" />
                Lembrar
              </label>
              <Link href="/login/recuperar-senha" className="text-[#244F99] hover:underline">
                Esqueceu a senha?
              </Link>
            </div>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#EFEFEF] px-2 text-gray-400">ou</span>
            </div>
          </div>

          <form action={loginAdminGoogle}>
            <button
              type="submit"
              className="w-full rounded-sm border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
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
    </div>
  )
}
