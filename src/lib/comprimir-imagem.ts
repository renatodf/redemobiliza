const DIMENSAO_MAXIMA = 1280
const QUALIDADE_JPEG = 0.8
const NAO_COMPRIMIR_ABAIXO_DE = 300 * 1024

export async function comprimirImagem(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith('image/') || arquivo.type === 'image/svg+xml') return arquivo
  if (arquivo.size <= NAO_COMPRIMIR_ABAIXO_DE) return arquivo

  const bitmap = await createImageBitmap(arquivo)
  const escala = Math.min(1, DIMENSAO_MAXIMA / Math.max(bitmap.width, bitmap.height))
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return arquivo
  ctx.drawImage(bitmap, 0, 0, largura, altura)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG)
  )
  if (!blob || blob.size >= arquivo.size) return arquivo

  const nomeSemExtensao = arquivo.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${nomeSemExtensao}.jpg`, { type: 'image/jpeg' })
}
