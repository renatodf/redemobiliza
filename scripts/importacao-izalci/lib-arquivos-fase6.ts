export function montarCaminhoFoto(gabineteId: string, pessoaId: string, ext: string): string {
  return `${gabineteId}/pessoas/${pessoaId}/foto.${ext}`
}

export function montarCaminhoCurriculo(gabineteId: string, pessoaId: string, ext: string): string {
  return `${gabineteId}/pessoas/${pessoaId}/curriculo.${ext}`
}

export function precisaComprimir(tamanhoBytes: number, limiteBytes: number): boolean {
  return tamanhoBytes > limiteBytes
}
