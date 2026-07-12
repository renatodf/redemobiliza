export type FatiaAgrupada = { chave: string; contagem: number }

export function agruparTopEOutros(
  contagens: { chave: string | null; contagem: number }[],
  limite: number
): FatiaAgrupada[] {
  const naoInformado = contagens.filter((c) => !c.chave || !c.chave.trim())
  const informado = contagens
    .filter((c) => c.chave && c.chave.trim())
    .sort((a, b) => b.contagem - a.contagem)

  const totalNaoInformado = naoInformado.reduce((acc, c) => acc + c.contagem, 0)
  const top = informado.slice(0, limite)
  const resto = informado.slice(limite)
  const totalResto = resto.reduce((acc, c) => acc + c.contagem, 0)

  const resultado: FatiaAgrupada[] = top.map((c) => ({ chave: c.chave as string, contagem: c.contagem }))
  if (totalResto > 0) resultado.push({ chave: 'Outros', contagem: totalResto })
  if (totalNaoInformado > 0) resultado.push({ chave: 'Não informado', contagem: totalNaoInformado })
  return resultado
}
