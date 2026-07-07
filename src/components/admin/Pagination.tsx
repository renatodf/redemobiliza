import Link from 'next/link'
import { paginar } from '@/lib/paginacao'
import { corTextoContraste } from '@/lib/cor-contraste'

export default function Pagination({
  totalItens,
  paginaAtual,
  tamanhoPagina,
  baseUrl,
  searchParams,
  corPrimaria,
}: {
  totalItens: number
  paginaAtual: number
  tamanhoPagina: number
  baseUrl: string
  searchParams: Record<string, string | undefined>
  corPrimaria: string
}) {
  const { totalPaginas } = paginar(totalItens, paginaAtual, tamanhoPagina)
  const corTexto = corTextoContraste(corPrimaria)
  const exibindo = Math.min(tamanhoPagina, Math.max(0, totalItens - (paginaAtual - 1) * tamanhoPagina))

  function hrefParaPagina(pagina: number) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') params.set(k, v)
    }
    params.set('page', String(pagina))
    return `${baseUrl}?${params.toString()}`
  }

  const janela = new Set<number>()
  janela.add(1)
  janela.add(totalPaginas)
  for (let p = paginaAtual - 2; p <= paginaAtual + 2; p++) {
    if (p >= 1 && p <= totalPaginas) janela.add(p)
  }
  const paginasOrdenadas = Array.from(janela).sort((a, b) => a - b)

  const itens: Array<{ tipo: 'pagina'; numero: number } | { tipo: 'reticencias'; chave: string }> = []
  for (let i = 0; i < paginasOrdenadas.length; i++) {
    const atual = paginasOrdenadas[i]
    if (i > 0 && atual - paginasOrdenadas[i - 1] > 1) {
      itens.push({ tipo: 'reticencias', chave: `ellipsis-${atual}` })
    }
    itens.push({ tipo: 'pagina', numero: atual })
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 text-sm">
      <span className="text-[#757575] whitespace-nowrap">
        Exibindo {exibindo.toLocaleString('pt-BR')} de {totalItens.toLocaleString('pt-BR')}
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {itens.map((item) =>
          item.tipo === 'reticencias' ? (
            <span key={item.chave} className="text-gray-400 px-1">
              …
            </span>
          ) : (
            <Link
              key={item.numero}
              href={hrefParaPagina(item.numero)}
              style={item.numero === paginaAtual ? { backgroundColor: corPrimaria, color: corTexto } : undefined}
              className={`px-2 py-1 rounded ${
                item.numero === paginaAtual ? '' : 'text-[#757575] hover:bg-gray-100'
              }`}
            >
              {item.numero}
            </Link>
          )
        )}
        <span className="text-[#757575] pl-1">de {totalPaginas}</span>
      </div>
    </div>
  )
}
