'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { corTextoContraste } from '@/lib/cor-contraste'

type IconeTipo =
  | 'dados-gerais'
  | 'usuarios'
  | 'demandas'
  | 'tarefas'
  | 'banco-talentos'
  | 'link-cadastro'
  | 'importar-exportar'
  | 'configuracoes'
  | 'inicio'
  | 'minha-rede'

type ItemMenu = { label: string; href?: string; emBreve?: boolean; icone: IconeTipo }

function buildItensAdmin(slug: string): ItemMenu[] {
  return [
    { label: 'Dados Gerais', href: `/${slug}/admin/dashboard`, icone: 'dados-gerais' },
    { label: 'Usuários', href: `/${slug}/admin/pessoas`, icone: 'usuarios' },
    { label: 'Demandas', href: `/${slug}/admin/demandas`, icone: 'demandas' },
    { label: 'Tarefas', emBreve: true, icone: 'tarefas' },
    { label: 'Banco de Talentos', emBreve: true, icone: 'banco-talentos' },
    { label: 'Link de Cadastro', emBreve: true, icone: 'link-cadastro' },
    { label: 'Importar/Exportar', emBreve: true, icone: 'importar-exportar' },
    { label: 'Configurações', href: `/${slug}/admin/configuracoes`, icone: 'configuracoes' },
  ]
}

function buildItensMobilizador(slug: string): ItemMenu[] {
  return [
    { label: 'Início', href: `/${slug}/mobilizador`, icone: 'inicio' },
    { label: 'Minha Rede', href: `/${slug}/mobilizador/rede`, icone: 'minha-rede' },
  ]
}

function IconeMenu({ tipo }: { tipo: IconeTipo }) {
  const props = { width: 17, height: 17, viewBox: '0 0 17 17', fill: 'none', 'aria-hidden': true, className: 'shrink-0' } as const
  switch (tipo) {
    case 'dados-gerais':
      return (
        <svg {...props}>
          <path d="M2 15V9.5M6.5 15V5M11 15V7M15.5 15V2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'usuarios':
      return (
        <svg {...props}>
          <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M1.5 15c0-2.9 2-5 4.5-5s4.5 2.1 4.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="12.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.8 9.3c2 .2 3.7 2 3.7 4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'demandas':
      return (
        <svg {...props}>
          <rect x="2.5" y="2" width="12" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.5 6.5h7M5.5 9.5h7M5.5 12.5h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'tarefas':
      return (
        <svg {...props}>
          <path d="M3 4.5 4.5 6l2.5-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.5 5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M3 12 4.5 13.5l2.5-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.5 12.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'banco-talentos':
      return (
        <svg {...props}>
          <rect x="2" y="5.5" width="13" height="8.5" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 5.5V4a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 11 4v1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 9.5h13" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
    case 'link-cadastro':
      return (
        <svg {...props}>
          <path d="M7 10 10 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8.5 4.5 10 3a2.5 2.5 0 0 1 3.5 3.5L12 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8.5 12.5 7 14a2.5 2.5 0 0 1-3.5-3.5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'importar-exportar':
      return (
        <svg {...props}>
          <path d="M5 4v9M3 6.5 5 4l2 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 4v9M10 10.5l2 2.5 2-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'configuracoes':
      return (
        <svg {...props}>
          <circle cx="8.5" cy="8.5" r="2.4" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8.5 2.5v1.6M8.5 12.9v1.6M14.5 8.5h-1.6M3.6 8.5H2M12.6 4.4l-1.1 1.1M6 11l-1.1 1.1M12.6 12.6l-1.1-1.1M6 6 4.9 4.9"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'inicio':
      return (
        <svg {...props}>
          <path d="M2.5 8 8.5 2.5 14.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 6.8V14h9V6.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'minha-rede':
      return (
        <svg {...props}>
          <circle cx="4" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="13" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8.5" cy="13" r="1.8" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.5 5.5 7.3 11.3M11.5 5.5 9.7 11.3M5.8 4.5h5.4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
  }
}

export default function Sidebar({
  slug,
  gabineteNome,
  logoUrl,
  corPrimaria,
  variante = 'admin',
}: {
  slug: string
  gabineteNome: string
  logoUrl: string | null
  corPrimaria: string
  variante?: 'admin' | 'mobilizador'
}) {
  const pathname = usePathname()
  const itens = variante === 'mobilizador' ? buildItensMobilizador(slug) : buildItensAdmin(slug)
  const corTexto = corTextoContraste(corPrimaria)

  return (
    <aside
      className="w-[200px] shrink-0 text-[var(--cor-texto)] flex flex-col min-h-screen md:min-h-0 md:h-full fixed inset-y-0 left-0 z-40 -translate-x-full transition-transform duration-200 peer-checked:translate-x-0 md:relative md:translate-x-0 md:z-auto"
      style={{ backgroundColor: corPrimaria, ['--cor-texto' as string]: corTexto }}
    >
      <div className="flex flex-col items-center py-6 px-3 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={gabineteNome} className="w-24 h-24 rounded-full object-cover" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-[color-mix(in_srgb,var(--cor-texto)_10%,transparent)] flex items-center justify-center text-3xl">
            {gabineteNome.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="mt-2 text-sm font-medium">{gabineteNome}</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-3">
        {itens.map((item) => {
          const hrefsComMatch = itens
            .map((i) => i.href)
            .filter((h): h is string => !!h && (pathname === h || pathname.startsWith(`${h}/`)))
          const hrefAtivo = hrefsComMatch.sort((a, b) => b.length - a.length)[0]
          const ativo = item.href ? item.href === hrefAtivo : false
          if (item.emBreve) {
            return (
              <span
                key={item.label}
                className="px-3 py-2 rounded-md text-sm text-[color-mix(in_srgb,var(--cor-texto)_30%,transparent)] cursor-not-allowed flex items-center justify-between gap-2"
                title="Em breve"
              >
                <span className="flex items-center gap-2">
                  <IconeMenu tipo={item.icone} />
                  {item.label}
                </span>
                <span className="text-[10px] uppercase shrink-0">em breve</span>
              </span>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href!}
              onClick={() => {
                const toggle = document.getElementById('sidebar-toggle') as HTMLInputElement | null
                if (toggle) toggle.checked = false
              }}
              className={`px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                ativo
                  ? 'bg-[color-mix(in_srgb,var(--cor-texto)_15%,transparent)] text-[var(--cor-texto)]'
                  : 'text-[color-mix(in_srgb,var(--cor-texto)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--cor-texto)_10%,transparent)] hover:text-[var(--cor-texto)]'
              }`}
            >
              <IconeMenu tipo={item.icone} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <form
        action="/api/auth/logout"
        method="POST"
        className="px-3 pb-6 pt-4 mt-4 border-t border-[color-mix(in_srgb,var(--cor-texto)_10%,transparent)]"
      >
        <button
          type="submit"
          className="w-full text-left px-3 py-2 rounded-md text-sm text-[color-mix(in_srgb,var(--cor-texto)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--cor-texto)_10%,transparent)] hover:text-[var(--cor-texto)]"
        >
          Sair
        </button>
      </form>
    </aside>
  )
}
