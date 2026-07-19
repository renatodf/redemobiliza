export type OpcaoComboBox = { id: string; label: string }

export function filtrarOpcoesComboBox(
  opcoes: OpcaoComboBox[],
  busca: string,
  selecionados: Set<string>
): OpcaoComboBox[] {
  const buscaNormalizada = busca.trim().toLowerCase()
  return opcoes.filter((o) => {
    if (selecionados.has(o.id)) return false
    if (!buscaNormalizada) return true
    return o.label.toLowerCase().includes(buscaNormalizada)
  })
}
