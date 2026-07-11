import { describe, it, expect } from 'vitest'
import { estaNoIntervaloAniversario, calcularIdade } from '../aniversario'

describe('estaNoIntervaloAniversario', () => {
  it('modo dia — aniversário é hoje', () => {
    const hoje = new Date(2026, 6, 15)
    const nascimento = new Date(1990, 6, 15)
    expect(estaNoIntervaloAniversario(nascimento, 'dia', hoje)).toBe(true)
  })

  it('modo dia — aniversário não é hoje', () => {
    const hoje = new Date(2026, 6, 15)
    const nascimento = new Date(1990, 6, 16)
    expect(estaNoIntervaloAniversario(nascimento, 'dia', hoje)).toBe(false)
  })

  it('modo semana — aniversário em 3 dias', () => {
    const hoje = new Date(2026, 6, 15)
    const nascimento = new Date(1985, 6, 18)
    expect(estaNoIntervaloAniversario(nascimento, 'semana', hoje)).toBe(true)
  })

  it('modo semana — aniversário em 10 dias fica de fora', () => {
    const hoje = new Date(2026, 6, 15)
    const nascimento = new Date(1985, 6, 25)
    expect(estaNoIntervaloAniversario(nascimento, 'semana', hoje)).toBe(false)
  })

  it('modo semana — atravessa virada de ano', () => {
    const hoje = new Date(2026, 11, 29)
    const nascimento = new Date(1992, 0, 2)
    expect(estaNoIntervaloAniversario(nascimento, 'semana', hoje)).toBe(true)
  })

  it('modo mes — mesmo mês', () => {
    const hoje = new Date(2026, 6, 1)
    const nascimento = new Date(2000, 6, 30)
    expect(estaNoIntervaloAniversario(nascimento, 'mes', hoje)).toBe(true)
  })

  it('modo mes — mês diferente', () => {
    const hoje = new Date(2026, 6, 1)
    const nascimento = new Date(2000, 7, 1)
    expect(estaNoIntervaloAniversario(nascimento, 'mes', hoje)).toBe(false)
  })
})

describe('calcularIdade', () => {
  it('já fez aniversário este ano', () => {
    const nascimento = new Date(1990, 2, 10)
    const hoje = new Date(2026, 6, 15)
    expect(calcularIdade(nascimento, hoje)).toBe(36)
  })

  it('ainda não fez aniversário este ano', () => {
    const nascimento = new Date(1990, 9, 10)
    const hoje = new Date(2026, 6, 15)
    expect(calcularIdade(nascimento, hoje)).toBe(35)
  })

  it('aniversário é hoje', () => {
    const nascimento = new Date(1990, 6, 15)
    const hoje = new Date(2026, 6, 15)
    expect(calcularIdade(nascimento, hoje)).toBe(36)
  })
})
