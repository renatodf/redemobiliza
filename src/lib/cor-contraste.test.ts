import { describe, it, expect } from 'vitest'
import { corTextoContraste } from './cor-contraste'

describe('corTextoContraste', () => {
  it('cor de fundo preta -> texto branco', () => {
    expect(corTextoContraste('#000000')).toBe('#ffffff')
  })

  it('cor de fundo branca -> texto escuro', () => {
    expect(corTextoContraste('#ffffff')).toBe('#111827')
  })

  it('preto do shell antigo (#1A1A1A) -> texto branco', () => {
    expect(corTextoContraste('#1A1A1A')).toBe('#ffffff')
  })

  it('azul padrão do gabinete (#1D4ED8) -> texto branco', () => {
    expect(corTextoContraste('#1D4ED8')).toBe('#ffffff')
  })

  it('amarelo claro -> texto escuro', () => {
    expect(corTextoContraste('#FFEB3B')).toBe('#111827')
  })

  it('aceita hex sem # e é case-insensitive', () => {
    expect(corTextoContraste('000000')).toBe('#ffffff')
    expect(corTextoContraste('#ABCDEF')).toBe(corTextoContraste('#abcdef'))
  })

  it('hex inválido cai no fallback de texto escuro', () => {
    expect(corTextoContraste('não-é-cor')).toBe('#111827')
    expect(corTextoContraste('#fff')).toBe('#111827')
  })
})
