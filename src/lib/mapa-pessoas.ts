export function calcularTamanhoBalao(
  contagem: number,
  min: number,
  max: number,
  tamanhoMin = 17,
  tamanhoMax = 34
): number {
  if (max <= min) return (tamanhoMin + tamanhoMax) / 2
  const proporcao = (contagem - min) / (max - min)
  const tamanho = tamanhoMin + proporcao * (tamanhoMax - tamanhoMin)
  return Math.max(tamanhoMin, Math.min(tamanhoMax, tamanho))
}
