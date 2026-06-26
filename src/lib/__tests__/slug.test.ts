import { describe, it, expect } from 'vitest'
import { toSlug } from '../slug'

describe('toSlug', () => {
  it('converte para minúsculas', () => {
    expect(toSlug('JOAO')).toBe('joao')
  })

  it('substitui espaços por hífens', () => {
    expect(toSlug('gabinete joao')).toBe('gabinete-joao')
  })

  it('remove acentos', () => {
    expect(toSlug('João')).toBe('joao')
    expect(toSlug('Ação')).toBe('acao')
    expect(toSlug('ênfase')).toBe('enfase')
    expect(toSlug('universitários')).toBe('universitarios')
  })

  it('remove caracteres especiais', () => {
    expect(toSlug('teste@123!')).toBe('teste123')
  })

  it('colapsa múltiplos espaços e hífens', () => {
    expect(toSlug('a  b')).toBe('a-b')
    expect(toSlug('a--b')).toBe('a-b')
  })

  it('remove hífens no início e no fim', () => {
    expect(toSlug('-teste-')).toBe('teste')
  })

  it('mantém números', () => {
    expect(toSlug('palestra 2026')).toBe('palestra-2026')
  })

  it('exemplo completo do spec', () => {
    expect(toSlug('Gabinete João')).toBe('gabinete-joao')
  })
})
