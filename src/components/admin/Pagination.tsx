import Link from 'next/link'
import { paginar } from '@/lib/paginacao'

export default function Pagination({
  totalItens,
  paginaAtual,
  tamanhoPagina,
  baseUrl,
  searchParams,
}: {
  totalItens: number
  paginaAtual: number
  tamanhoPagina: number
  baseUrl: string
  searchParams: Record<string, string | undefined>
}) {
  const { totalPaginas } = paginar(totalItens, paginaAtual, tamanhoPagina)

  function hrefParaPagina(pagina: number) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') params.set(k, v)
    }
    params.set('page', String(pagina))
    return `${baseUrl}?${params.toString()}`
  }

  const paginasVisiveis = Array.from({ length: totalPaginas }, (_, i) => i + 1).slice(0, 7)

  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <div className="flex items-center gap-1">
        {paginasVisiveis.map((p) => (
          <Link
            key={p}
            href={hrefParaPagina(p)}
            className={`px-2 py-1 rounded ${
              p === paginaAtual ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {p}
          </Link>
        ))}
        {totalPaginas > 7 && <span className="text-gray-400 px-1">de {totalPaginas}</span>}
      </div>
      <span className="text-gray-500">
        {totalItens.toLocaleString('pt-BR')} usuários cadastrados
      </span>
    </div>
  )
}
