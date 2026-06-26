import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { atualizarSenha } from '@/actions/auth/atualizar-senha'

interface Props {
  searchParams: { erro?: string }
}

const mensagensErro: Record<string, string> = {
  senhas_diferentes: 'As senhas não coincidem.',
  senha_curta: 'A senha deve ter pelo menos 6 caracteres.',
  falha: 'Erro ao atualizar a senha. O link pode ter expirado. Solicite um novo.',
}

export default async function NovaSenhaPage({ searchParams }: Props) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login/recuperar-senha?erro=link_expirado')
  }

  const erro = searchParams.erro ? mensagensErro[searchParams.erro] : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            Criar nova senha
          </h1>
          <p className="text-sm text-gray-600 text-center mt-2">
            Escolha uma senha com pelo menos 6 caracteres.
          </p>
        </div>

        {erro && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <form action={atualizarSenha} className="space-y-4">
          <input type="hidden" name="redirectSucesso" value="/login" />
          <input type="hidden" name="redirectErro" value="/login/nova-senha" />

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Nova senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
              Confirmar nova senha
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Salvar nova senha
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
