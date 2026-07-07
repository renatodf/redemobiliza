'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type ItemMenu = { label: string; href?: string; emBreve?: boolean }

function buildItens(slug: string): ItemMenu[] {
  return [
    { label: 'Dados Gerais', href: `/${slug}/admin/dashboard` },
    { label: 'Usuários', href: `/${slug}/admin/pessoas` },
    { label: 'Demandas', href: `/${slug}/admin/demandas` },
    { label: 'Tarefas', emBreve: true },
    { label: 'Banco de Talentos', emBreve: true },
    { label: 'Link de Cadastro', emBreve: true },
    { label: 'Importar/Exportar', emBreve: true },
    { label: 'Configurações', href: `/${slug}/admin/configuracoes` },
  ]
}

export default function Sidebar({
  slug,
  gabineteNome,
  logoUrl,
  corPrimaria,
}: {
  slug: string
  gabineteNome: string
  logoUrl: string | null
  corPrimaria: string
}) {
  const pathname = usePathname()
  const itens = buildItens(slug)

  return (
    <aside
      className="w-[200px] shrink-0 text-white flex flex-col min-h-screen"
      style={{ backgroundColor: corPrimaria }}
    >
      <div className="flex flex-col items-center py-6 px-3 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={gabineteNome} className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-xl">
            {gabineteNome.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="mt-2 text-sm font-medium">{gabineteNome}</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-3">
        {itens.map((item) => {
          const ativo = item.href ? pathname.startsWith(item.href) : false
          if (item.emBreve) {
            return (
              <span
                key={item.label}
                className="px-3 py-2 rounded-md text-sm text-white/30 cursor-not-allowed flex items-center justify-between"
                title="Em breve"
              >
                {item.label}
                <span className="text-[10px] uppercase">em breve</span>
              </span>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href!}
              className={`px-3 py-2 rounded-md text-sm transition-colors ${
                ativo ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <form action="/api/auth/logout" method="POST" className="px-3 pb-6 pt-4 mt-4 border-t border-white/10">
        <button type="submit" className="w-full text-left px-3 py-2 rounded-md text-sm text-white/70 hover:bg-white/10 hover:text-white">
          Sair
        </button>
      </form>
    </aside>
  )
}
