const TIPOS_IMAGEM_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024

type TipoImagemPermitido = keyof typeof TIPOS_IMAGEM_PERMITIDOS

export function validarImagemUpload(file: File): { ext: string; contentType: string } {
  const tipo = file.type.toLowerCase() as TipoImagemPermitido

  if (!(tipo in TIPOS_IMAGEM_PERMITIDOS)) {
    throw new Error('Tipo de imagem não permitido — use JPEG, PNG, WebP ou GIF')
  }

  if (file.size > TAMANHO_MAXIMO_BYTES) {
    throw new Error('Imagem muito grande — máximo 5MB')
  }

  return { ext: TIPOS_IMAGEM_PERMITIDOS[tipo], contentType: tipo }
}
