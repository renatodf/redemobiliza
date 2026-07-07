export function paginar(totalItens: number, paginaAtual: number, tamanhoPagina: number) {
  const totalPaginas = Math.max(1, Math.ceil(totalItens / tamanhoPagina))
  const paginaClampada = Math.min(Math.max(1, paginaAtual), totalPaginas)
  return {
    paginaAtual: paginaClampada,
    totalPaginas,
    skip: (paginaClampada - 1) * tamanhoPagina,
    take: tamanhoPagina,
  }
}
