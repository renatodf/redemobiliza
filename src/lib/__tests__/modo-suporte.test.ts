import { describe, it, expect } from 'vitest'
import { readSuporteSessao } from '../modo-suporte'

describe('readSuporteSessao', () => {
  it('lança se role não é super-admin', () => {
    expect(() =>
      readSuporteSessao('admin', JSON.stringify({ gabineteId: 'abc', sessaoId: '123' }))
    ).toThrow()
  })

  it('lança se role é undefined', () => {
    expect(() =>
      readSuporteSessao(undefined, JSON.stringify({ gabineteId: 'abc', sessaoId: '123' }))
    ).toThrow()
  })

  it('retorna null se cookie ausente', () => {
    expect(readSuporteSessao('super-admin', undefined)).toBeNull()
  })

  it('retorna null se cookie é string vazia', () => {
    expect(readSuporteSessao('super-admin', '')).toBeNull()
  })

  it('lança com mensagem específica se gabineteId ausente', () => {
    expect(() =>
      readSuporteSessao('super-admin', JSON.stringify({ sessaoId: '123' }))
    ).toThrow('cookie suporteSessao malformado')
  })

  it('lança com mensagem específica se sessaoId ausente', () => {
    expect(() =>
      readSuporteSessao('super-admin', JSON.stringify({ gabineteId: 'abc' }))
    ).toThrow('cookie suporteSessao malformado')
  })

  it('retorna { gabineteId, sessaoId } para cookie válido', () => {
    const result = readSuporteSessao(
      'super-admin',
      JSON.stringify({ gabineteId: 'abc', sessaoId: '123' })
    )
    expect(result).toEqual({ gabineteId: 'abc', sessaoId: '123' })
  })
})
