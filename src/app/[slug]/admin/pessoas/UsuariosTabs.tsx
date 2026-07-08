'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function UsuariosTabs({ slug, corPrimaria }: { slug: string; corPrimaria: string }) {
  const pathname = usePathname()
  const emRedes = pathname.endsWith('/pessoas/redes')

  const abas = [
    { label: 'Todos os Usuários', href: `/${slug}/admin/pessoas`, ativo: !emRedes },
    { label: 'Redes de Usuários', href: `/${slug}/admin/pessoas/redes`, ativo: emRedes },
  ]

  return (
    <div className="flex items-center gap-6 border-b border-[#EDEDED] pb-3 mb-1">
      {abas.map((aba) => (
        <Link
          key={aba.href}
          href={aba.href}
          style={aba.ativo ? { color: corPrimaria } : undefined}
          className={`relative pb-3 -mb-3 text-sm ${aba.ativo ? 'font-medium' : 'text-[#757575]'}`}
        >
          {aba.label}
          {aba.ativo && (
            <span
              className="absolute left-0 right-0 -bottom-[13px] h-[3px] rounded-t"
              style={{ backgroundColor: corPrimaria }}
            />
          )}
        </Link>
      ))}
    </div>
  )
}
