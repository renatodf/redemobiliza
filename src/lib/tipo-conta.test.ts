import { describe, it, expect } from 'vitest'
import { mapPapelParaTipoConta } from './tipo-conta'

describe('mapPapelParaTipoConta', () => {
  it('retorna Administrador para papel admin', () => {
    expect(mapPapelParaTipoConta('admin')).toBe('Administrador')
  })
  it('retorna Mobilizador para papel mobilizador', () => {
    expect(mapPapelParaTipoConta('mobilizador')).toBe('Mobilizador')
  })
  it('retorna — para null', () => {
    expect(mapPapelParaTipoConta(null)).toBe('—')
  })
  it('retorna — para undefined', () => {
    expect(mapPapelParaTipoConta(undefined)).toBe('—')
  })
  it('retorna — para papel desconhecido', () => {
    expect(mapPapelParaTipoConta('outro')).toBe('—')
  })
})
