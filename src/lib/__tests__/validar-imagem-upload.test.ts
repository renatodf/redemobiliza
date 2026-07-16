import { describe, it, expect } from 'vitest'
import { validarImagemUpload } from '../validar-imagem-upload'

function criarArquivo(tipo: string, tamanhoBytes: number, nome = 'arquivo'): File {
  const conteudo = new Uint8Array(tamanhoBytes)
  return new File([conteudo], nome, { type: tipo })
}

describe('validarImagemUpload', () => {
  it('aceita JPEG dentro do limite de tamanho', () => {
    const file = criarArquivo('image/jpeg', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'jpg' })
  })

  it('aceita PNG dentro do limite de tamanho', () => {
    const file = criarArquivo('image/png', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'png' })
  })

  it('aceita WebP dentro do limite de tamanho', () => {
    const file = criarArquivo('image/webp', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'webp' })
  })

  it('aceita GIF dentro do limite de tamanho', () => {
    const file = criarArquivo('image/gif', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'gif' })
  })

  it('rejeita SVG (vetor de XSS armazenado)', () => {
    const file = criarArquivo('image/svg+xml', 1024)
    expect(() => validarImagemUpload(file)).toThrow('Tipo de imagem não permitido')
  })

  it('rejeita tipo arbitrário não relacionado a imagem', () => {
    const file = criarArquivo('application/octet-stream', 1024)
    expect(() => validarImagemUpload(file)).toThrow('Tipo de imagem não permitido')
  })

  it('rejeita arquivo maior que 5MB mesmo com tipo válido', () => {
    const file = criarArquivo('image/png', 5 * 1024 * 1024 + 1)
    expect(() => validarImagemUpload(file)).toThrow('máximo 5MB')
  })

  it('aceita arquivo exatamente no limite de 5MB', () => {
    const file = criarArquivo('image/png', 5 * 1024 * 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'png' })
  })

  it('ignora extensão do nome do arquivo — extensão vem sempre do MIME validado', () => {
    const file = criarArquivo('image/png', 1024, '../../../etc/passwd.png')
    expect(validarImagemUpload(file)).toEqual({ ext: 'png' })
  })

  it('é case-insensitive no MIME type', () => {
    const file = criarArquivo('IMAGE/PNG', 1024)
    expect(validarImagemUpload(file)).toEqual({ ext: 'png' })
  })
})
