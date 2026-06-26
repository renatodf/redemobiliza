import { describe, it, expect } from 'vitest'
import { normalizeWhatsApp } from '../whatsapp'

describe('normalizeWhatsApp', () => {
  it('aceita 11 dígitos e prefixa com 55', () => {
    expect(normalizeWhatsApp('61912345678')).toBe('5561912345678')
  })

  it('aceita 10 dígitos e prefixa com 55', () => {
    expect(normalizeWhatsApp('6112345678')).toBe('556112345678')
  })

  it('aceita 13 dígitos (já com DDI) e mantém', () => {
    expect(normalizeWhatsApp('5561912345678')).toBe('5561912345678')
  })

  it('aceita 12 dígitos (DDI + DDD + 8) e mantém', () => {
    expect(normalizeWhatsApp('556112345678')).toBe('556112345678')
  })

  it('remove formatação antes de normalizar', () => {
    expect(normalizeWhatsApp('+55 (61) 9 1234-5678')).toBe('5561912345678')
  })

  it('retorna null para número muito curto', () => {
    expect(normalizeWhatsApp('123')).toBeNull()
  })

  it('retorna null para número com 14 dígitos', () => {
    expect(normalizeWhatsApp('55619123456789')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(normalizeWhatsApp('')).toBeNull()
  })
})
