import { describe, it, expect } from 'vitest'
import { montarCaminhoFoto, montarCaminhoCurriculo, precisaComprimir } from './lib-arquivos-fase6'

describe('montarCaminhoFoto', () => {
  it('monta o caminho no mesmo padrão usado por uploadFotoPessoa', () => {
    expect(montarCaminhoFoto('gabinete-1', 'pessoa-1', 'jpg')).toBe('gabinete-1/pessoas/pessoa-1/foto.jpg')
  })

  it('usa a extensão passada, sem normalizar', () => {
    expect(montarCaminhoFoto('gabinete-1', 'pessoa-1', 'png')).toBe('gabinete-1/pessoas/pessoa-1/foto.png')
  })
})

describe('montarCaminhoCurriculo', () => {
  it('monta o caminho no mesmo padrão usado por salvarBancoTalentos', () => {
    expect(montarCaminhoCurriculo('gabinete-1', 'pessoa-1', 'pdf')).toBe('gabinete-1/pessoas/pessoa-1/curriculo.pdf')
  })

  it('usa a extensão passada, sem normalizar', () => {
    expect(montarCaminhoCurriculo('gabinete-1', 'pessoa-1', 'docx')).toBe('gabinete-1/pessoas/pessoa-1/curriculo.docx')
  })
})

describe('precisaComprimir', () => {
  it('abaixo do limite não precisa comprimir', () => {
    expect(precisaComprimir(1000, 5000)).toBe(false)
  })

  it('exatamente no limite não precisa comprimir', () => {
    expect(precisaComprimir(5000, 5000)).toBe(false)
  })

  it('acima do limite precisa comprimir', () => {
    expect(precisaComprimir(5001, 5000)).toBe(true)
  })
})
