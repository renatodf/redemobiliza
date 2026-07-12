import { describe, it, expect } from 'vitest'
import { calcularFaixaEtaria } from '../faixa-etaria'

describe('calcularFaixaEtaria', () => {
  it('16-24', () => {
    expect(calcularFaixaEtaria(16)).toBe('16-24')
    expect(calcularFaixaEtaria(24)).toBe('16-24')
  })

  it('25-34', () => {
    expect(calcularFaixaEtaria(25)).toBe('25-34')
    expect(calcularFaixaEtaria(34)).toBe('25-34')
  })

  it('35-44', () => {
    expect(calcularFaixaEtaria(35)).toBe('35-44')
    expect(calcularFaixaEtaria(44)).toBe('35-44')
  })

  it('45-59', () => {
    expect(calcularFaixaEtaria(45)).toBe('45-59')
    expect(calcularFaixaEtaria(59)).toBe('45-59')
  })

  it('60+', () => {
    expect(calcularFaixaEtaria(60)).toBe('60+')
    expect(calcularFaixaEtaria(90)).toBe('60+')
  })

  it('limites exatos entre faixas', () => {
    expect(calcularFaixaEtaria(24)).toBe('16-24')
    expect(calcularFaixaEtaria(25)).toBe('25-34')
    expect(calcularFaixaEtaria(34)).toBe('25-34')
    expect(calcularFaixaEtaria(35)).toBe('35-44')
  })
})
