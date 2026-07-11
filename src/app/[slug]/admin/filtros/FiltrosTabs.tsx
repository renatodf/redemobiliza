// src/app/[slug]/admin/filtros/FiltrosTabs.tsx
import Link from 'next/link'

type Aba = { chave: string; label: string; href?: string }

export default function FiltrosTabs({
  abas,
  abaAtiva,
  corPrimaria,
}: {
  abas: Aba[]
  abaAtiva: string
  corPrimaria: string
}) {
  return (
    <div className="flex gap-2 border-b border-gray-200">
      {abas.map((aba) => {
        const ativa = aba.chave === abaAtiva
        if (!aba.href) {
          return (
            <span
              key={aba.chave}
              className="px-4 py-2 text-sm text-gray-300 cursor-not-allowed"
              title="Em breve"
            >
              {aba.label}
            </span>
          )
        }
        return (
          <Link
            key={aba.chave}
            href={aba.href}
            style={ativa ? { borderColor: corPrimaria, color: corPrimaria } : undefined}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              ativa ? '' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {aba.label}
          </Link>
        )
      })}
    </div>
  )
}
