'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { key: 'demandas', label: 'Demandas' },
  { key: 'profissoes', label: 'Profissões' },
  { key: 'cidades', label: 'Cidades' },
  { key: 'segmentos', label: 'Segmentos' },
  { key: 'personalizacao', label: 'Personalização' },
]

export default function ConfiguracoesSidebar({ slug }: { slug: string }) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop: sidebar lateral */}
      <nav className="hidden md:flex flex-col gap-1 w-44 shrink-0">
        {items.map((item) => {
          const href = `/${slug}/admin/configuracoes/${item.key}`
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={item.key}
              href={href}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Mobile: abas horizontais com scroll */}
      <nav className="md:hidden flex overflow-x-auto gap-1 pb-2 border-b border-gray-200">
        {items.map((item) => {
          const href = `/${slug}/admin/configuracoes/${item.key}`
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={item.key}
              href={href}
              className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
