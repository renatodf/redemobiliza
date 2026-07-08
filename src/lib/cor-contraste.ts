export function corTextoContraste(corFundo: string): string {
  const hex = corFundo.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#111827'

  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminancia = (r * 299 + g * 587 + b * 114) / 1000

  return luminancia >= 128 ? '#111827' : '#ffffff'
}
