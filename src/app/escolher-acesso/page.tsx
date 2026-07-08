import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listarDestinosAcesso, caminhoDestino, type DestinoAcesso } from '@/lib/auth-destino'

function rotuloDestino(destino: DestinoAcesso): string {
  if (destino.tipo === 'super-admin') return 'Super Admin'
  if (destino.tipo === 'admin') return `Admin — ${destino.nome}`
  return `Mobilizador — ${destino.nome}`
}

function descricaoDestino(destino: DestinoAcesso): string {
  if (destino.tipo === 'super-admin') return 'Gerenciar todos os gabinetes do sistema'
  if (destino.tipo === 'admin') return 'Acessar o painel administrativo deste gabinete'
  return 'Acessar sua área de mobilizador'
}

export default async function EscolherAcessoPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const isSuperAdminRole = user.app_metadata?.role === 'super-admin'
  const destinos = await listarDestinosAcesso(user.id, isSuperAdminRole)

  if (destinos.length === 0) {
    await supabase.auth.signOut()
    redirect('/login?erro=nao_autorizado')
  }

  if (destinos.length === 1) {
    redirect(caminhoDestino(destinos[0]))
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#EFEFEF]">
      <div className="h-[11px] w-full bg-[#244F99] shrink-0" />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[423px] space-y-6">
          <h1 className="text-center text-[26px] leading-9 text-[#494949]">
            Como deseja entrar?
          </h1>
          <p className="text-center text-sm text-[#686868]">
            Sua conta tem mais de um tipo de acesso.
          </p>

          <div className="space-y-3">
            {destinos.map((destino, i) => (
              <Link
                key={i}
                href={caminhoDestino(destino)}
                className="block rounded-sm bg-white shadow-[0_18px_38px_rgba(3,3,3,0.16)] px-5 py-4 hover:bg-[#F5F6FA] transition-colors"
              >
                <p className="text-sm font-medium text-[#244F99]">{rotuloDestino(destino)}</p>
                <p className="text-xs text-[#686868] mt-1">{descricaoDestino(destino)}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
