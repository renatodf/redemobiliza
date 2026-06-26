import Link from 'next/link'
import { solicitarRecuperacaoSenha } from '@/actions/auth/recuperar-senha'

interface Props {
  searchParams: { enviado?: string; erro?: string }
}

export default function RecuperarSenhaPage({ searchParams }: Props) {
  const enviado = searchParams.enviado === '1'

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="rounded-md bg-green-50 border border-green-200 p-4">
            <p className="text-sm text-green-800 font-medium">E-mail enviado!</p>
            <p className="text-sm text-green-700 mt-1">
              Se esse endereço estiver cadastrado, você receberá um link para redefinir sua senha.
              Verifique também a caixa de spam.
            </p>
          </div>
          <Link href="/login" className="text-sm text-blue-600 underline">
            Voltar ao login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            Recuperar senha
          </h1>
          <p className="text-sm text-gray-600 text-center mt-2">
            Informe seu e-mail e enviaremos um link para criar uma nova senha.
          </p>
        </div>

        {searchParams.erro === 'email_vazio' && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">Informe um e-mail válido.</p>
          </div>
        )}

        <form action={solicitarRecuperacaoSenha} className="space-y-4">
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

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Enviar link
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          <Link href="/login" className="text-blue-600 underline">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}
