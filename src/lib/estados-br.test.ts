import { describe, it, expect } from 'vitest'
import { ESTADOS_BR } from './estados-br'

describe('ESTADOS_BR', () => {
  it('tem as 27 unidades federativas do Brasil', () => {
    expect(ESTADOS_BR).toHaveLength(27)
  })

  it('todas as siglas são únicas e têm 2 letras maiúsculas', () => {
    const siglas = ESTADOS_BR.map((e) => e.sigla)
    expect(new Set(siglas).size).toBe(27)
    for (const sigla of siglas) {
      expect(sigla).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('inclui o Distrito Federal', () => {
    expect(ESTADOS_BR.find((e) => e.sigla === 'DF')).toEqual({ sigla: 'DF', nome: 'Distrito Federal' })
  })
})
